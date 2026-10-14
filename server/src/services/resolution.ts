import type { Deps } from '../deps.js';
import type { PickResult, Resolution, RoundStatus, VoidReason } from '../db/schema.js';
import { toNum } from '../domain/money.js';
import { resolvePick } from '../domain/pick.js';
import { computeActualWin, ticketOutcome } from '../domain/ticket.js';

const TERMINAL: RoundStatus[] = ['won', 'lost', 'void'];

/**
 * Recomputes a round's ticket outcome from its picks (BR-17, BR-18, BR-19) and stores
 * hits/misses/voids, status, resolved_at and actual_win. Idempotent.
 *
 * Status rule: 'lost' as soon as any pick missed (even before all games end);
 * 'won'/'void' only when every pick is resolved; otherwise the round keeps
 * locked/in_progress (a previously terminal round falls back to 'in_progress').
 * Open rounds keep status 'open' (only counters change).
 */
export async function refreshRoundOutcome(deps: Deps, roundId: number): Promise<void> {
  const round = await deps.db.selectFrom('rounds').selectAll().where('id', '=', roundId).executeTakeFirst();
  if (!round) return;
  const picks = await deps.db
    .selectFrom('picks')
    .select(['result', 'odds'])
    .where('round_id', '=', roundId)
    .orderBy('slot')
    .execute();

  const outcome = ticketOutcome(picks.map((p) => p.result));

  let status: RoundStatus = round.status;
  if (round.status !== 'open') {
    if (outcome.status === 'lost') status = 'lost';
    else if (outcome.resolved && (outcome.status === 'won' || outcome.status === 'void')) status = outcome.status;
    else if (TERMINAL.includes(round.status)) status = 'in_progress';
  }

  let resolvedAt: Date | null = null;
  if (outcome.resolved && round.status !== 'open') resolvedAt = round.resolved_at ?? deps.now();

  const update: {
    status: RoundStatus;
    hits: number;
    misses: number;
    voids: number;
    resolved_at: Date | null;
    actual_win?: number | null;
    actual_win_provisional?: number;
  } = {
    status,
    hits: outcome.hits,
    misses: outcome.misses,
    voids: outcome.voids,
    resolved_at: resolvedAt,
  };

  if (!round.actual_win_manual) {
    const win =
      round.status === 'open'
        ? { amount: null, provisional: false }
        : computeActualWin({
            status: outcome.status,
            stake: toNum(round.stake),
            totalOdds: toNum(round.total_odds),
            picks: picks.map((p) => ({ result: p.result, odds: toNum(p.odds) })),
          });
    update.actual_win = win.amount;
    update.actual_win_provisional = win.provisional ? 1 : 0;
  }

  await deps.db.updateTable('rounds').set(update).where('id', '=', roundId).execute();
  deps.derived.invalidate();
  deps.bus.roundChanged(roundId);
}

export interface PickResultInput {
  result: PickResult | null;
  finalPoints: number | null;
  voidReason: VoidReason | null;
  resolution: Resolution | null;
}

/** Stores a pick's result (auto, manual or import) and refreshes the round outcome. */
export async function applyPickResult(deps: Deps, pickId: number, r: PickResultInput): Promise<void> {
  const pick = await deps.db.selectFrom('picks').select(['round_id']).where('id', '=', pickId).executeTakeFirst();
  if (!pick) return;
  await deps.db
    .updateTable('picks')
    .set({
      result: r.result,
      final_points: r.finalPoints,
      void_reason: r.result === 'void' ? r.voidReason : null,
      resolution: r.result === null ? null : r.resolution,
      resolved_at: r.result === null ? null : deps.now(),
    })
    .where('id', '=', pickId)
    .execute();
  await refreshRoundOutcome(deps, pick.round_id);
}

/**
 * Computes the automatic result of every pick on a game from stored stats.
 * Players without a stats row count as DNP (BR-13). Returns null when the pick lacks data.
 */
export async function computeGamePickResults(
  deps: Deps,
  gameId: number,
): Promise<Array<{
  pickId: number;
  roundId: number;
  current: { result: PickResult | null; finalPoints: number | null; resolution: Resolution | null };
  next: { result: PickResult; finalPoints: number | null; voidReason: VoidReason | null };
}>> {
  const picks = await deps.db
    .selectFrom('picks')
    .innerJoin('rounds', 'rounds.id', 'picks.round_id')
    .select([
      'picks.id',
      'picks.round_id',
      'picks.player_id',
      'picks.line',
      'picks.direction',
      'picks.result',
      'picks.final_points',
      'picks.resolution',
    ])
    .where('picks.game_id', '=', gameId)
    .where('rounds.status', '!=', 'open')
    .execute();
  if (picks.length === 0) return [];
  const stats = await deps.db.selectFrom('player_game_stats').selectAll().where('game_id', '=', gameId).execute();
  const byPlayer = new Map(stats.map((s) => [s.player_id, s]));
  const out = [];
  for (const p of picks) {
    const line = toNum(p.line);
    if (p.player_id === null || line === null || p.direction === null) continue;
    const s = byPlayer.get(p.player_id);
    const points = s?.points ?? 0;
    const r = resolvePick({ direction: p.direction, line, points, secondsPlayed: s?.seconds_played ?? 0 });
    out.push({
      pickId: p.id,
      roundId: p.round_id,
      current: { result: p.result, finalPoints: p.final_points, resolution: p.resolution },
      next: { result: r.result, finalPoints: s ? s.points : null, voidReason: r.voidReason },
    });
  }
  return out;
}

/**
 * Resolves every pick on a finished game (BR-12, BR-13) from the final stats,
 * skipping picks resolved manually or by import.
 */
export async function resolveGame(deps: Deps, gameId: number): Promise<void> {
  const items = await computeGamePickResults(deps, gameId);
  for (const it of items) {
    if (it.current.resolution === 'manual' || it.current.resolution === 'import') continue;
    if (
      it.current.result === it.next.result &&
      it.current.finalPoints === it.next.finalPoints &&
      it.current.resolution === 'auto'
    ) {
      continue;
    }
    await applyPickResult(deps, it.pickId, { ...it.next, resolution: 'auto' });
  }
}
