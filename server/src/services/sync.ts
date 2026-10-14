import { sql, type Updateable } from 'kysely';
import type { Deps } from '../deps.js';
import type { GamesTable, SyncType } from '../db/schema.js';
import { dayInBelgrade, seasonForDate, seasonName, seasonStartDate } from '../domain/season.js';
import { normalizeName } from '../domain/text.js';
import type { ProviderClub, ProviderPlayer } from '../provider/types.js';
import { applyPickResult } from './resolution.js';

// ---------- sync_runs bookkeeping ----------

export async function startSyncRun(deps: Deps, type: SyncType): Promise<number> {
  const res = await deps.db
    .insertInto('sync_runs')
    .values({ type, started_at: deps.now(), status: 'running', finished_at: null, error_message: null, items_changed: null })
    .executeTakeFirstOrThrow();
  return Number(res.insertId);
}

export async function finishSyncRun(
  deps: Deps,
  id: number,
  r: { ok: true; changed: number } | { ok: false; error: unknown },
): Promise<void> {
  await deps.db
    .updateTable('sync_runs')
    .set(
      r.ok
        ? { status: 'ok', finished_at: deps.now(), items_changed: r.changed }
        : { status: 'error', finished_at: deps.now(), error_message: errorMessage(r.error).slice(0, 2000) },
    )
    .where('id', '=', id)
    .execute();
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

/** Runs `fn` inside a sync_runs row (running -> ok/error). Rethrows on error. */
export async function withSyncRun<T extends { changed: number }>(
  deps: Deps,
  type: SyncType,
  fn: () => Promise<T>,
): Promise<T> {
  const id = await startSyncRun(deps, type);
  try {
    const result = await fn();
    await finishSyncRun(deps, id, { ok: true, changed: result.changed });
    return result;
  } catch (e) {
    await finishSyncRun(deps, id, { ok: false, error: e });
    throw e;
  }
}

// ---------- clubs ----------

async function upsertClubs(deps: Deps, clubs: Iterable<ProviderClub>): Promise<void> {
  const unique = new Map<string, ProviderClub>();
  for (const c of clubs) if (c.code) unique.set(c.code, c);
  for (const c of unique.values()) {
    await deps.db
      .insertInto('clubs')
      .values({ code: c.code, name: c.name.slice(0, 128), short_name: c.shortName.slice(0, 64), crest_url: c.crestUrl })
      .onDuplicateKeyUpdate({
        name: c.name.slice(0, 128),
        short_name: c.shortName.slice(0, 64),
        crest_url: sql<string | null>`COALESCE(VALUES(crest_url), crest_url)`,
      })
      .execute();
  }
}

async function ensureSeason(deps: Deps, code: string): Promise<void> {
  await deps.db
    .insertInto('seasons')
    .values({ code, name: seasonName(code), start_date: seasonStartDate(code) })
    .onDuplicateKeyUpdate({ code })
    .execute();
}

// ---------- players (REQ-04) ----------

/** Prefers the active entry when the feed lists a player twice (e.g. after a transfer). */
function dedupePlayers(list: ProviderPlayer[]): ProviderPlayer[] {
  const byCode = new Map<string, ProviderPlayer>();
  for (const p of list) {
    if (!p.code) continue;
    const prev = byCode.get(p.code);
    if (!prev || (!prev.active && p.active)) byCode.set(p.code, p);
  }
  return [...byCode.values()];
}

export async function syncPlayers(deps: Deps): Promise<{ changed: number }> {
  return withSyncRun(deps, 'players', async () => {
    const season = seasonForDate(dayInBelgrade(deps.now()));
    const feed = dedupePlayers(await deps.provider.listPlayers(season));
    if (feed.length === 0) throw new Error('Prazan spisak igrača iz izvora; zadržani su postojeći podaci.');
    await upsertClubs(deps, feed.flatMap((p) => (p.club ? [p.club] : [])));

    const existing = await deps.db
      .selectFrom('players')
      .selectAll()
      .where('external_code', 'is not', null)
      .execute();
    const byCode = new Map(existing.map((p) => [p.external_code!, p]));
    const now = deps.now();
    let changed = 0;

    for (const p of feed) {
      const fullName = `${p.firstName} ${p.lastName}`.trim();
      const row = {
        first_name: p.firstName.slice(0, 64),
        last_name: p.lastName.slice(0, 64),
        full_name: fullName.slice(0, 128),
        search_name: normalizeName(`${fullName} ${p.club?.shortName ?? ''}`).slice(0, 160),
        club_code: p.club?.code ?? null,
        position: p.position?.slice(0, 16) ?? null,
        jersey: p.jersey?.slice(0, 4) ?? null,
        photo_url: p.photoUrl?.slice(0, 512) ?? null,
        is_active: p.active ? 1 : 0,
      };
      const cur = byCode.get(p.code);
      if (!cur) {
        await deps.db
          .insertInto('players')
          .values({ ...row, external_code: p.code, is_manual: 0, last_synced_at: now })
          .execute();
        changed++;
        continue;
      }
      if (cur.is_manual) continue;
      const differs = (Object.keys(row) as Array<keyof typeof row>).some((k) => cur[k] !== row[k]);
      await deps.db
        .updateTable('players')
        .set({ ...row, last_synced_at: now })
        .where('id', '=', cur.id)
        .execute();
      if (differs) changed++;
    }

    const feedCodes = new Set(feed.map((p) => p.code));
    const gone = existing.filter((p) => !p.is_manual && p.is_active && !feedCodes.has(p.external_code!)).map((p) => p.id);
    if (gone.length > 0) {
      await deps.db.updateTable('players').set({ is_active: 0 }).where('id', 'in', gone).execute();
      changed += gone.length;
    }
    return { changed };
  });
}

// ---------- schedule (REQ-05, BR-14) ----------

/** Round statuses that can still have unresolved picks (a round can be lost before all games end). */
const UNRESOLVED_ROUND = ['open', 'locked', 'in_progress', 'lost'] as const;

export async function syncSchedule(deps: Deps, seasonCode?: string): Promise<{ changed: number }> {
  return withSyncRun(deps, 'schedule', async () => {
    const season = seasonCode ?? seasonForDate(dayInBelgrade(deps.now()));
    const feed = await deps.provider.listGames(season);
    await ensureSeason(deps, season);
    await upsertClubs(deps, feed.flatMap((g) => [g.home, g.away]));

    const existing = await deps.db.selectFrom('games').selectAll().where('season_code', '=', season).execute();
    const byCode = new Map(existing.map((g) => [g.game_code, g]));

    // Games referenced by unresolved picks are finalized by the live poller, never here.
    const pickedRows = await deps.db
      .selectFrom('picks')
      .innerJoin('rounds', 'rounds.id', 'picks.round_id')
      .select('picks.game_id')
      .where('picks.game_id', 'is not', null)
      .where('picks.result', 'is', null)
      .where('rounds.status', 'in', [...UNRESOLVED_ROUND])
      .execute();
    const picked = new Set(pickedRows.map((r) => r.game_id!));

    const now = deps.now();
    let changed = 0;
    for (const g of feed) {
      const gameDay = dayInBelgrade(g.scheduledAt);
      const cur = byCode.get(g.gameCode);
      if (!cur) {
        const finalNow = g.played && g.homeScore !== null && g.awayScore !== null;
        await deps.db
          .insertInto('games')
          .values({
            season_code: season,
            game_code: g.gameCode,
            euroleague_round: g.round,
            home_club_code: g.home.code,
            away_club_code: g.away.code,
            scheduled_at: g.scheduledAt,
            game_day: gameDay,
            status: finalNow ? 'final' : 'scheduled',
            home_score: finalNow ? g.homeScore : null,
            away_score: finalNow ? g.awayScore : null,
            live_quarter: null,
            live_clock: null,
            started_at: finalNow ? g.scheduledAt : null,
            final_at: finalNow ? now : null,
            recheck_done_at: finalNow ? now : null,
            last_polled_at: null,
            is_manual: 0,
          })
          .execute();
        changed++;
        continue;
      }
      if (cur.is_manual) continue;

      const update: Updateable<GamesTable> = {};
      if (cur.scheduled_at.getTime() !== g.scheduledAt.getTime()) update.scheduled_at = g.scheduledAt;
      if (cur.game_day !== gameDay) update.game_day = gameDay;
      if (cur.euroleague_round !== g.round) update.euroleague_round = g.round;
      if (cur.home_club_code !== g.home.code) update.home_club_code = g.home.code;
      if (cur.away_club_code !== g.away.code) update.away_club_code = g.away.code;
      // A played game nobody bet on (still pending) can be closed directly from the schedule.
      if (
        g.played &&
        g.homeScore !== null &&
        g.awayScore !== null &&
        (cur.status === 'scheduled' || cur.status === 'live') &&
        !picked.has(cur.id)
      ) {
        Object.assign(update, {
          status: 'final',
          home_score: g.homeScore,
          away_score: g.awayScore,
          started_at: cur.started_at ?? g.scheduledAt,
          final_at: now,
          recheck_done_at: cur.recheck_done_at ?? now,
          live_quarter: null,
          live_clock: null,
        });
      }
      if (Object.keys(update).length > 0) {
        await deps.db.updateTable('games').set(update).where('id', '=', cur.id).execute();
        changed++;
      }
    }

    changed += await voidMovedGames(deps);
    return { changed };
  });
}

/**
 * BR-14: a pick whose game (not yet started) is now scheduled on a different day than its
 * locked round is voided immediately ('game_not_played'). Returns the number of voided picks.
 */
export async function voidMovedGames(deps: Deps): Promise<number> {
  const rows = await deps.db
    .selectFrom('picks')
    .innerJoin('rounds', 'rounds.id', 'picks.round_id')
    .innerJoin('games', 'games.id', 'picks.game_id')
    .select(['picks.id'])
    .where('picks.result', 'is', null)
    .where('rounds.status', 'in', ['locked', 'in_progress', 'lost'])
    .where('games.status', '=', 'scheduled')
    .where('games.started_at', 'is', null)
    .whereRef('games.game_day', '!=', 'rounds.game_day')
    .execute();
  for (const r of rows) {
    await applyPickResult(deps, r.id, {
      result: 'void',
      finalPoints: null,
      voidReason: 'game_not_played',
      resolution: 'auto',
    });
  }
  return rows.length;
}
