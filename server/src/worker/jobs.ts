import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { DateTime } from 'luxon';
import type { PickLiveDto } from '../api-types.js';
import type { Deps } from '../deps.js';
import type { Game, SyncType } from '../db/schema.js';
import { toNum } from '../domain/money.js';
import { liveStatus } from '../domain/pick.js';
import { dayInBelgrade, TIMEZONE } from '../domain/season.js';
import { writeAudit } from '../services/audit.js';
import { lockRound } from '../services/rounds.js';
import { applyPickResult, computeGamePickResults, resolveGame } from '../services/resolution.js';
import { finishSyncRun, startSyncRun, syncPlayers, syncSchedule, withSyncRun } from '../services/sync.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Poll window opens this long before the scheduled tip-off. */
export const PRE_GAME_POLL_MS = 10 * MIN;
/** A game is considered finished only this long after its scheduled start (design §7). */
export const MIN_GAME_DURATION_MS = 90 * MIN;
/** Games that never went live are not polled forever (notPlayed takes over). */
export const MAX_POLL_AFTER_START_MS = 12 * HOUR;
/** Recheck of the final box score (BR-15). */
export const RECHECK_AFTER_MS = 12 * HOUR;
/** REQ-13.9: request budget per minute; 4 live games x (header + boxscore) every 30 s = 16. */
export const MAX_REQUESTS_PER_MINUTE = 20;
/** REQ-13.9: backoff steps after consecutive errors per game. */
export const BACKOFF_STEPS_MS = [30_000, 60_000, 2 * MIN, 5 * MIN];

// ---------- in-memory worker state (per Deps instance) ----------

interface WorkerState {
  backoff: Map<number, { failures: number; nextAt: number }>;
  requests: number[];
}

const states = new WeakMap<Deps, WorkerState>();

function state(deps: Deps): WorkerState {
  let s = states.get(deps);
  if (!s) {
    s = { backoff: new Map(), requests: [] };
    states.set(deps, s);
  }
  return s;
}

/** Reserves `n` requests from the per-minute budget; false when it would exceed it. */
function reserveRequests(deps: Deps, n: number): boolean {
  const s = state(deps);
  const now = deps.now().getTime();
  s.requests = s.requests.filter((t) => t > now - MIN && t <= now);
  if (s.requests.length + n > MAX_REQUESTS_PER_MINUTE) return false;
  for (let i = 0; i < n; i++) s.requests.push(now);
  return true;
}

function inBackoff(deps: Deps, gameId: number): boolean {
  const b = state(deps).backoff.get(gameId);
  return !!b && b.nextAt > deps.now().getTime();
}

function recordFailure(deps: Deps, gameId: number): void {
  const s = state(deps);
  const failures = (s.backoff.get(gameId)?.failures ?? 0) + 1;
  const step = BACKOFF_STEPS_MS[Math.min(failures, BACKOFF_STEPS_MS.length) - 1]!;
  s.backoff.set(gameId, { failures, nextAt: deps.now().getTime() + step });
}

function recordSuccess(deps: Deps, gameId: number): void {
  state(deps).backoff.delete(gameId);
}

/** Exposed for tests: forget backoff/rate-limit state. */
export function resetWorkerState(deps: Deps): void {
  states.delete(deps);
}

function belgrade(deps: Deps): DateTime {
  return DateTime.fromJSDate(deps.now(), { zone: TIMEZONE });
}

// ---------- autoLock (BR-28, REQ-11.3) ----------

export async function runAutoLock(deps: Deps): Promise<number[]> {
  const now = deps.now();
  const rows = await deps.db
    .selectFrom('rounds')
    .innerJoin('picks', 'picks.round_id', 'rounds.id')
    .innerJoin('games', 'games.id', 'picks.game_id')
    .select(['rounds.id'])
    .where('rounds.status', '=', 'open')
    .where((eb) => eb.or([eb('games.scheduled_at', '<=', now), eb('games.status', 'in', ['live', 'final'])]))
    .groupBy('rounds.id')
    .execute();
  const locked: number[] = [];
  for (const { id } of rows) {
    if (!(await isRoundComplete(deps, id))) continue; // the admin warning is derived elsewhere
    try {
      await lockRound(deps, id, null);
      locked.push(id);
    } catch (e) {
      logJob('autoLock', 'error', { roundId: id, error: String(e) });
    }
  }
  return locked;
}

async function isRoundComplete(deps: Deps, roundId: number): Promise<boolean> {
  const round = await deps.db
    .selectFrom('rounds')
    .select(['stake', 'total_odds', 'payer_member_id'])
    .where('id', '=', roundId)
    .executeTakeFirst();
  if (!round || round.stake === null || round.total_odds === null || round.payer_member_id === null) return false;
  const picks = await deps.db
    .selectFrom('picks')
    .select(['player_id', 'line', 'direction', 'game_id'])
    .where('round_id', '=', roundId)
    .execute();
  return (
    picks.length === 4 &&
    picks.every((p) => p.player_id !== null && p.line !== null && p.direction !== null && p.game_id !== null)
  );
}

// ---------- livePoll (REQ-13, REQ-14.1) ----------

export interface LivePollResult {
  polled: number[];
  finalized: number[];
  errors: number;
}

export async function runLivePoll(deps: Deps): Promise<LivePollResult> {
  const now = deps.now();
  const result: LivePollResult = { polled: [], finalized: [], errors: 0 };

  const games = await deps.db
    .selectFrom('games')
    .selectAll('games')
    .where('games.is_manual', '=', 0)
    .where('games.status', 'in', ['scheduled', 'live'])
    .where('games.scheduled_at', '<=', new Date(now.getTime() + PRE_GAME_POLL_MS))
    .where('games.id', 'in', (eb) =>
      eb
        .selectFrom('picks')
        .innerJoin('rounds', 'rounds.id', 'picks.round_id')
        .select('picks.game_id')
        .where('picks.game_id', 'is not', null)
        // A round lost early still needs its remaining picks resolved (streak statistics).
        .where((w) =>
          w.or([
            w('rounds.status', 'in', ['open', 'locked', 'in_progress']),
            w.and([w('rounds.status', '=', 'lost'), w('picks.result', 'is', null)]),
          ]),
        )
        .$narrowType<{ game_id: number }>(),
    )
    .orderBy('games.last_polled_at')
    .orderBy('games.scheduled_at')
    .execute();

  const errors: string[] = [];
  const touchedGames: number[] = [];
  for (const game of games) {
    if (game.status === 'scheduled' && now.getTime() > game.scheduled_at.getTime() + MAX_POLL_AFTER_START_MS) continue;
    if (inBackoff(deps, game.id)) continue;
    // Before tip-off only the header is needed; afterwards header + boxscore.
    const needsBox = game.status === 'live' || now.getTime() >= game.scheduled_at.getTime();
    if (!reserveRequests(deps, needsBox ? 2 : 1)) break;
    try {
      const finalized = await pollGame(deps, game, needsBox);
      recordSuccess(deps, game.id);
      result.polled.push(game.id);
      touchedGames.push(game.id);
      if (finalized) result.finalized.push(game.id);
    } catch (e) {
      recordFailure(deps, game.id);
      result.errors++;
      errors.push(`${game.season_code}/${game.game_code}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (result.polled.length > 0 || errors.length > 0) {
    const id = await startSyncRun(deps, 'live');
    await finishSyncRun(
      deps,
      id,
      errors.length > 0 ? { ok: false, error: new Error(errors.join('; ')) } : { ok: true, changed: result.polled.length },
    );
  }

  if (touchedGames.length > 0) {
    await markRoundsInProgress(deps);
    await publishLive(deps, touchedGames);
  }
  return result;
}

/** Polls one game; returns true when the game was finalized. */
async function pollGame(deps: Deps, game: Game, boxReserved: boolean): Promise<boolean> {
  const now = deps.now();
  const header = await deps.provider.getHeader(game.season_code, game.game_code);
  const total = header.homeScore + header.awayScore;
  const started = header.live || total > 0 || game.status === 'live';
  if (!started) {
    await deps.db.updateTable('games').set({ last_polled_at: now }).where('id', '=', game.id).execute();
    return false;
  }

  // Early tip-off: the boxscore call was not reserved up front (REQ-13.9).
  if (!boxReserved && !reserveRequests(deps, 1)) {
    await deps.db.updateTable('games').set({ last_polled_at: now }).where('id', '=', game.id).execute();
    return false;
  }
  const box = await deps.provider.getBoxscore(game.season_code, game.game_code);
  const finished =
    !header.live && !box.live && total > 0 && now.getTime() >= game.scheduled_at.getTime() + MIN_GAME_DURATION_MS;

  await upsertPickedStats(deps, game.id, box.lines, finished);

  await deps.db
    .updateTable('games')
    .set({
      status: finished ? 'final' : 'live',
      home_score: header.homeScore,
      away_score: header.awayScore,
      live_quarter: finished ? null : header.quarter?.slice(0, 8) ?? null,
      live_clock: finished ? null : header.clock?.slice(0, 8) ?? null,
      started_at: game.started_at ?? now,
      final_at: finished ? now : null,
      last_polled_at: now,
    })
    .where('id', '=', game.id)
    .execute();

  if (finished) {
    await withSyncRun(deps, 'final', async () => {
      await resolveGame(deps, game.id);
      return { changed: 1 };
    });
  }
  return finished;
}

/** Upserts stats for players that appear in any pick on this game. Returns number of rows written. */
async function upsertPickedStats(
  deps: Deps,
  gameId: number,
  lines: Array<{ playerCode: string; points: number; secondsPlayed: number; fouls: number | null }>,
  isFinal: boolean,
): Promise<number> {
  const picked = await deps.db
    .selectFrom('picks')
    .innerJoin('players', 'players.id', 'picks.player_id')
    .select(['players.id', 'players.external_code'])
    .where('picks.game_id', '=', gameId)
    .where('players.external_code', 'is not', null)
    .distinct()
    .execute();
  if (picked.length === 0) return 0;
  const byCode = new Map<string, (typeof lines)[number]>();
  for (const l of lines) byCode.set(l.playerCode, l);
  const now = deps.now();
  let written = 0;
  for (const p of picked) {
    const l = byCode.get(p.external_code!);
    if (!l) {
      if (isFinal) {
        // Not in the final box score: keep any live row but mark it final (DNP is derived from absence).
        await deps.db
          .updateTable('player_game_stats')
          .set({ is_final: 1, updated_at: now })
          .where('game_id', '=', gameId)
          .where('player_id', '=', p.id)
          .execute();
      }
      continue;
    }
    await deps.db
      .insertInto('player_game_stats')
      .values({
        game_id: gameId,
        player_id: p.id,
        points: l.points,
        seconds_played: l.secondsPlayed,
        fouls: l.fouls,
        is_final: isFinal ? 1 : 0,
        updated_at: now,
      })
      .onDuplicateKeyUpdate({
        points: l.points,
        seconds_played: l.secondsPlayed,
        fouls: l.fouls,
        is_final: isFinal ? 1 : 0,
        updated_at: now,
      })
      .execute();
    written++;
  }
  return written;
}

/** REQ-11.6: a locked round becomes in_progress once any of its games has started. */
async function markRoundsInProgress(deps: Deps): Promise<void> {
  const rows = await deps.db
    .selectFrom('rounds')
    .innerJoin('picks', 'picks.round_id', 'rounds.id')
    .innerJoin('games', 'games.id', 'picks.game_id')
    .select('rounds.id')
    .where('rounds.status', '=', 'locked')
    .where((eb) => eb.or([eb('games.status', 'in', ['live', 'final']), eb('games.started_at', 'is not', null)]))
    .groupBy('rounds.id')
    .execute();
  for (const { id } of rows) {
    const res = await deps.db
      .updateTable('rounds')
      .set({ status: 'in_progress' })
      .where('id', '=', id)
      .where('status', '=', 'locked')
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) > 0) {
      deps.derived.invalidate();
      deps.bus.roundChanged(id);
    }
  }
}

/** Builds the live DTO of every pick in rounds touching `gameIds` and publishes SSE 'live' events. */
export async function publishLive(deps: Deps, gameIds: number[]): Promise<void> {
  if (gameIds.length === 0) return;
  const roundIds = (
    await deps.db
      .selectFrom('picks')
      .select('round_id')
      .where('game_id', 'in', gameIds)
      .distinct()
      .execute()
  ).map((r) => r.round_id);
  if (roundIds.length === 0) return;
  for (const roundId of roundIds) {
    const live = await buildRoundLive(deps, roundId);
    deps.bus.publish({ type: 'live', data: { roundId, picks: live } });
    deps.bus.roundChanged(roundId);
  }
}

export async function buildRoundLive(deps: Deps, roundId: number): Promise<Array<{ slot: number; live: PickLiveDto }>> {
  const rows = await deps.db
    .selectFrom('picks')
    .leftJoin('games', 'games.id', 'picks.game_id')
    .leftJoin('player_game_stats as s', (j) =>
      j.onRef('s.game_id', '=', 'picks.game_id').onRef('s.player_id', '=', 'picks.player_id'),
    )
    .select([
      'picks.slot',
      'picks.direction',
      'picks.line',
      'picks.result',
      'games.status as game_status',
      's.points',
      's.seconds_played',
      's.fouls',
      's.updated_at',
    ])
    .where('picks.round_id', '=', roundId)
    .orderBy('picks.slot')
    .execute();
  const out: Array<{ slot: number; live: PickLiveDto }> = [];
  for (const r of rows) {
    const line = toNum(r.line);
    if (r.direction === null || line === null) continue;
    const ls = liveStatus({
      direction: r.direction,
      line,
      gameStatus: r.game_status ?? 'scheduled',
      points: r.points ?? null,
      secondsPlayed: r.seconds_played ?? null,
      result: r.result,
    });
    out.push({
      slot: r.slot,
      live: {
        points: r.points ?? null,
        secondsPlayed: r.seconds_played ?? null,
        fouls: r.fouls ?? null,
        status: ls.status,
        pointsNeeded: ls.pointsNeeded,
        updatedAt: r.updated_at ? r.updated_at.toISOString() : null,
      },
    });
  }
  return out;
}

// ---------- resolvePending (REQ-14.1 retry) ----------

/**
 * Final games whose picks are still unresolved (e.g. resolveGame failed or the process
 * restarted right after the game was marked final) are resolved again on every tick.
 */
export async function runResolvePending(deps: Deps): Promise<number> {
  const rows = await deps.db
    .selectFrom('picks')
    .innerJoin('rounds', 'rounds.id', 'picks.round_id')
    .innerJoin('games', 'games.id', 'picks.game_id')
    .select('games.id')
    .where('picks.result', 'is', null)
    .where('rounds.status', 'in', ['locked', 'in_progress', 'lost'])
    .where('games.status', '=', 'final')
    .where('games.is_manual', '=', 0)
    .groupBy('games.id')
    .execute();
  let resolved = 0;
  for (const { id } of rows) {
    try {
      await resolveGame(deps, id);
      resolved++;
    } catch (e) {
      logJob('resolvePending', 'error', { gameId: id, error: String(e) });
    }
  }
  return resolved;
}

// ---------- notPlayed (BR-14, REQ-14.5) ----------

export async function runNotPlayed(deps: Deps): Promise<number> {
  const now = deps.now();
  const rows = await deps.db
    .selectFrom('picks')
    .innerJoin('rounds', 'rounds.id', 'picks.round_id')
    .innerJoin('games', 'games.id', 'picks.game_id')
    .select(['picks.id', 'rounds.game_day', 'games.status', 'games.started_at'])
    .where('picks.result', 'is', null)
    .where('rounds.status', 'in', ['locked', 'in_progress', 'lost'])
    .where('games.status', 'in', ['scheduled', 'postponed', 'cancelled'])
    // Manual games have no live data; the admin resolves them (REQ-16).
    .where('games.is_manual', '=', 0)
    .execute();
  let voided = 0;
  for (const r of rows) {
    let notPlayed = r.status === 'postponed' || r.status === 'cancelled';
    if (!notPlayed && r.started_at === null) {
      const deadline = DateTime.fromISO(r.game_day, { zone: TIMEZONE }).plus({ days: 1 }).set({ hour: 6 });
      notPlayed = now.getTime() >= deadline.toMillis();
    }
    if (!notPlayed) continue;
    await applyPickResult(deps, r.id, { result: 'void', finalPoints: null, voidReason: 'game_not_played', resolution: 'auto' });
    voided++;
  }
  return voided;
}

// ---------- recheck (BR-15, REQ-14.6) ----------

export async function runRecheck(deps: Deps): Promise<{ checked: number; fixed: number }> {
  const now = deps.now();
  const games = await deps.db
    .selectFrom('games')
    .selectAll()
    .where('status', '=', 'final')
    .where('is_manual', '=', 0)
    .where('recheck_done_at', 'is', null)
    .where('final_at', '<=', new Date(now.getTime() - RECHECK_AFTER_MS))
    .orderBy('final_at')
    .execute();
  let checked = 0;
  let fixed = 0;
  for (const game of games) {
    if (inBackoff(deps, game.id)) continue;
    if (!reserveRequests(deps, 1)) break;
    try {
      const n = await withSyncRun(deps, 'recheck', async () => {
        const box = await deps.provider.getBoxscore(game.season_code, game.game_code);
        if (box.live) throw new Error(`Utakmica ${game.game_code} je ponovo označena kao živa`);
        await upsertPickedStats(deps, game.id, box.lines, true);
        let changes = 0;
        for (const it of await computeGamePickResults(deps, game.id)) {
          if (it.current.resolution !== 'auto' || it.current.result === null) continue;
          if (it.current.result !== it.next.result) {
            await applyPickResult(deps, it.pickId, { ...it.next, resolution: 'auto' });
            await deps.db.updateTable('rounds').set({ has_corrections: 1 }).where('id', '=', it.roundId).execute();
            await writeAudit(deps.db, {
              at: deps.now(),
              actorMemberId: null,
              action: 'auto_recheck_fix',
              roundId: it.roundId,
              entity: 'pick',
              entityId: it.pickId,
              field: 'result',
              oldValue: { result: it.current.result, finalPoints: it.current.finalPoints },
              newValue: { result: it.next.result, finalPoints: it.next.finalPoints, voidReason: it.next.voidReason },
              reason: 'Ponovna provera boxscore-a',
            });
            changes++;
          } else if (it.current.finalPoints !== it.next.finalPoints) {
            await deps.db
              .updateTable('picks')
              .set({ final_points: it.next.finalPoints })
              .where('id', '=', it.pickId)
              .execute();
            deps.bus.roundChanged(it.roundId);
          }
        }
        await deps.db.updateTable('games').set({ recheck_done_at: deps.now() }).where('id', '=', game.id).execute();
        return { changed: changes };
      });
      recordSuccess(deps, game.id);
      checked++;
      fixed += n.changed;
    } catch (e) {
      recordFailure(deps, game.id);
      logJob('recheck', 'error', { gameId: game.id, error: String(e) });
    }
  }
  return { checked, fixed };
}

// ---------- daily syncs (REQ-04.1, REQ-05.1/2) ----------

const RETRY_AFTER_ERROR_MS = 15 * MIN;

async function lastRun(deps: Deps, type: SyncType, okOnly: boolean): Promise<Date | null> {
  let q = deps.db.selectFrom('sync_runs').select('started_at').where('type', '=', type);
  if (okOnly) q = q.where('status', '=', 'ok');
  const row = await q.orderBy('started_at', 'desc').orderBy('id', 'desc').limit(1).executeTakeFirst();
  return row?.started_at ?? null;
}

/** Daily job due at/after hh:mm Belgrade when there is no successful run today; retries errors every 15 min. */
async function dailyDue(deps: Deps, type: SyncType, hour: number, minute: number): Promise<boolean> {
  const local = belgrade(deps);
  const lastOk = await lastRun(deps, type, true);
  const lastAny = await lastRun(deps, type, false);
  if (lastAny && deps.now().getTime() - lastAny.getTime() < RETRY_AFTER_ERROR_MS && (!lastOk || lastAny > lastOk)) {
    return false; // recent failure: wait before retrying
  }
  if (!lastOk) return true; // never synced (fresh install): run immediately
  const afterTime = local.hour > hour || (local.hour === hour && local.minute >= minute);
  return afterTime && dayInBelgrade(lastOk) !== local.toISODate();
}

export async function runSchedule(deps: Deps): Promise<boolean> {
  let due = await dailyDue(deps, 'schedule', 4, 0);
  if (!due) {
    // REQ-05.2: every 15 min on the game day of an unresolved round.
    const today = belgrade(deps).toISODate()!;
    const active = await deps.db
      .selectFrom('rounds')
      .select('id')
      .where('game_day', '=', today)
      .where('status', 'in', ['open', 'locked', 'in_progress', 'lost'])
      .where('resolved_at', 'is', null)
      .executeTakeFirst();
    if (active) {
      const lastAny = await lastRun(deps, 'schedule', false);
      due = !lastAny || deps.now().getTime() - lastAny.getTime() >= 15 * MIN;
    }
  }
  if (!due) return false;
  if (!reserveRequests(deps, 1)) return false;
  await syncSchedule(deps);
  return true;
}

export async function runPlayers(deps: Deps): Promise<boolean> {
  if (!(await dailyDue(deps, 'players', 4, 30))) return false;
  if (!reserveRequests(deps, 1)) return false;
  await syncPlayers(deps);
  return true;
}

// ---------- backup (REQ-37.2) ----------

export const BACKUP_KEEP_DAYS = 30;

export async function runBackup(deps: Deps): Promise<string | null> {
  const dir = deps.config.backupDir;
  if (!dir) return null;
  const local = belgrade(deps);
  if (local.hour < 3) return null;
  const stamp = local.toFormat('yyyyLLdd');
  const file = join(dir, `vc-${stamp}.sql.gz`);
  if (await exists(file)) return null;
  const lastAny = await lastRun(deps, 'backup', false);
  if (lastAny && deps.now().getTime() - lastAny.getTime() < HOUR) return null; // failed recently

  await withSyncRun(deps, 'backup', async () => {
    await mkdir(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    const db = deps.config.db;
    const child = spawn(
      'mysqldump',
      [
        '--single-transaction',
        '--routines',
        '--no-tablespaces',
        `--host=${db.host}`,
        `--port=${db.port}`,
        `--user=${db.user}`,
        db.database,
      ],
      { env: { ...process.env, MYSQL_PWD: db.password }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    const exited = new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? -1));
    });
    try {
      await Promise.all([pipeline(child.stdout, createGzip(), createWriteStream(tmp)), exited]);
      const code = await exited;
      if (code !== 0) throw new Error(`mysqldump exit ${code}: ${stderr.trim().slice(0, 500)}`);
      await rename(tmp, file);
    } catch (e) {
      await unlink(tmp).catch(() => undefined);
      throw e;
    }
    const removed = await pruneBackups(dir, local.minus({ days: BACKUP_KEEP_DAYS }).toFormat('yyyyLLdd'));
    return { changed: 1 + removed };
  });
  return file;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Deletes vc-YYYYMMDD.sql.gz files dated before `cutoff` (YYYYMMDD). */
export async function pruneBackups(dir: string, cutoff: string): Promise<number> {
  let removed = 0;
  for (const name of await readdir(dir)) {
    const m = /^vc-(\d{8})\.sql\.gz$/.exec(name);
    if (m && m[1]! < cutoff) {
      await unlink(join(dir, name));
      removed++;
    }
  }
  return removed;
}

// ---------- logging (REQ-37.5) ----------

export function logJob(job: string, level: 'info' | 'error', data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ at: new Date().toISOString(), level, job, ...data });
  if (level === 'error') console.error(line);
  else console.log(line);
}
