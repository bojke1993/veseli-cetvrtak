import type { AdminTaskDto } from '../api-types.js';
import type { SyncType } from '../db/schema.js';
import type { Deps } from '../deps.js';
import { gameNotStarted } from './dto.js';
import { missingForLock } from './rounds.js';

export const LOCK_SOON_MS = 60 * 60_000;
export const MANUAL_RESOLVE_AFTER_MS = 6 * 3_600_000;
export const SYNC_STALE_MS = 36 * 3_600_000;
export const LIVE_FAIL_RUNS = 5;

const SYNC_LABEL: Partial<Record<SyncType, string>> = { players: 'igrača', schedule: 'rasporeda' };

/** REQ-32: admin tasks derived from the current state (never stored; close automatically). */
export async function listAdminTasks(deps: Deps): Promise<AdminTaskDto[]> {
  const now = deps.now();
  const tasks: AdminTaskDto[] = [];
  const names = new Map((await deps.db.selectFrom('members').select(['id', 'name']).execute()).map((m) => [m.id, m.name]));

  const rounds = await deps.db
    .selectFrom('rounds')
    .selectAll()
    .where((eb) => eb.or([eb('status', 'in', ['open', 'locked', 'in_progress', 'lost']), eb('actual_win_provisional', '=', 1)]))
    .orderBy('number')
    .execute();
  const roundIds = rounds.map((r) => r.id);
  const picks = roundIds.length
    ? await deps.db
        .selectFrom('picks')
        .leftJoin('games', 'games.id', 'picks.game_id')
        .leftJoin('players', 'players.id', 'picks.player_id')
        .selectAll('picks')
        .select([
          'games.status as game_status',
          'games.scheduled_at as game_scheduled_at',
          'players.full_name as player_name',
        ])
        .where('picks.round_id', 'in', roundIds)
        .orderBy('picks.slot')
        .execute()
    : [];

  for (const r of rounds) {
    const ps = picks.filter((p) => p.round_id === r.id);
    const link = `/kolo/${r.id}`;
    if (r.status === 'open') {
      let first: number | null = null;
      const pickTimes = ps.map((p) => p.game_scheduled_at?.getTime()).filter((t): t is number => t !== undefined);
      if (pickTimes.length > 0) first = Math.min(...pickTimes);
      else {
        const g = await deps.db
          .selectFrom('games')
          .select('scheduled_at')
          .where('game_day', '=', r.game_day)
          .orderBy('scheduled_at')
          .executeTakeFirst();
        first = g?.scheduled_at.getTime() ?? null;
      }
      const started = ps.some(
        (p) => p.game_status && p.game_scheduled_at && !gameNotStarted({ status: p.game_status, scheduled_at: p.game_scheduled_at }, now),
      );
      if (started || (first !== null && first <= now.getTime())) {
        const missing = missingForLock(r, ps, names);
        tasks.push({
          kind: 'lock_soon',
          message: `Kolo ${r.number} nije zaključeno, a utakmica je počela.${missing.length ? ` Nedostaje: ${missing.join(', ')}.` : ''}`,
          roundId: r.id,
          slot: null,
          link: '/kolo',
        });
      } else if (first !== null && first - now.getTime() <= LOCK_SOON_MS) {
        const minutes = Math.max(1, Math.round((first - now.getTime()) / 60_000));
        tasks.push({
          kind: 'lock_soon',
          message: `Kolo ${r.number} nije zaključeno — prva utakmica počinje za ${minutes} min.`,
          roundId: r.id,
          slot: null,
          link: '/kolo',
        });
      }
      continue;
    }
    for (const p of ps) {
      if (p.result !== null || p.game_id === null || !p.game_scheduled_at) continue;
      const overdue = now.getTime() - p.game_scheduled_at.getTime() > MANUAL_RESOLVE_AFTER_MS;
      if (p.game_status === 'final' || overdue) {
        tasks.push({
          kind: 'manual_resolve',
          message: `Kolo ${r.number}: tip ${p.player_name ?? `#${p.slot}`} čeka ručno razrešenje.`,
          roundId: r.id,
          slot: p.slot,
          link,
        });
      }
    }
    if (r.status === 'won' && r.actual_win_provisional === 1) {
      tasks.push({
        kind: 'enter_actual_win',
        message: `Kolo ${r.number}: unesi stvarni dobitak (tiket dobitan sa poništenim tipom).`,
        roundId: r.id,
        slot: null,
        link,
      });
    }
  }

  const derived = await deps.derived.get();
  const inconsistent = [...derived.rounds.values()].filter((rd) => rd.cooldownInconsistent).sort((a, b) => a.number - b.number);
  for (const rd of inconsistent) {
    tasks.push({
      kind: 'cooldown_inconsistent',
      message: `Kolo ${rd.number}: nekonzistentno hlađenje — proveri sastav kola.`,
      roundId: rd.roundId,
      slot: null,
      link: `/kolo/${rd.roundId}`,
    });
  }

  for (const type of ['players', 'schedule'] as const) {
    const last = await deps.db
      .selectFrom('sync_runs')
      .selectAll()
      .where('type', '=', type)
      .where('status', '!=', 'running')
      .orderBy('started_at', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst();
    if (!last) continue;
    const lastOk = await deps.db
      .selectFrom('sync_runs')
      .select('finished_at')
      .where('type', '=', type)
      .where('status', '=', 'ok')
      .orderBy('started_at', 'desc')
      .executeTakeFirst();
    const okAt = lastOk?.finished_at ?? null;
    const stale = !okAt || now.getTime() - okAt.getTime() > SYNC_STALE_MS;
    if (last.status === 'error' || stale) {
      const when = okAt ? `Poslednja uspešna: ${okAt.toISOString()}.` : 'Nijedna sinhronizacija nije uspela.';
      tasks.push({
        kind: 'sync_failing',
        message: `Sinhronizacija ${SYNC_LABEL[type]} ne uspeva. ${when}`,
        roundId: null,
        slot: null,
        link: '/podesavanja',
      });
    }
  }

  const live = await deps.db
    .selectFrom('sync_runs')
    .select('status')
    .where('type', '=', 'live')
    .where('status', '!=', 'running')
    .orderBy('started_at', 'desc')
    .orderBy('id', 'desc')
    .limit(LIVE_FAIL_RUNS)
    .execute();
  if (live.length === LIVE_FAIL_RUNS && live.every((r) => r.status === 'error')) {
    tasks.push({
      kind: 'live_failing',
      message: `Praćenje uživo ne uspeva (${LIVE_FAIL_RUNS} neuspešnih pokušaja zaredom).`,
      roundId: null,
      slot: null,
      link: '/podesavanja',
    });
  }
  return tasks;
}
