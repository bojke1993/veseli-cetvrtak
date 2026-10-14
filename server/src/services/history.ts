import type { RoundsQuery, RoundsResponse } from '../api-types.js';
import type { Deps } from '../deps.js';
import { buildRoundSummaries } from './rounds.js';

export const PAGE_SIZE = 20;

/** REQ-27: round history with combinable filters, newest first, 20 per page. */
export async function listRounds(deps: Deps, q: RoundsQuery): Promise<RoundsResponse> {
  let query = deps.db.selectFrom('rounds').selectAll();
  if (q.season && q.season !== 'all') query = query.where('season_code', '=', q.season);
  if (q.from) query = query.where('game_day', '>=', q.from);
  if (q.to) query = query.where('game_day', '<=', q.to);
  if (q.status) query = query.where('status', '=', q.status);
  if (q.payer !== undefined) query = query.where('payer_member_id', '=', q.payer);
  if (q.outcome) {
    query = query.where('status', 'in', ['won', 'lost', 'void']);
    if (q.outcome === 'with_void') query = query.where('voids', '>', 0);
    else query = query.where('voids', '=', 0).where('hits', '=', Number(q.outcome[0]));
  }
  const rounds = await query.orderBy('number', 'desc').execute();

  const needPicks =
    q.member !== undefined || q.player !== undefined || q.club !== undefined || q.direction !== undefined || q.teamPick !== undefined;
  const derived = await deps.derived.get();
  let filtered = rounds;
  if (needPicks && rounds.length > 0) {
    const picks = await deps.db
      .selectFrom('picks')
      .leftJoin('players', 'players.id', 'picks.player_id')
      .select([
        'picks.round_id',
        'picks.kind',
        'picks.member_id',
        'picks.cooldown_for_member_id',
        'picks.player_id',
        'picks.direction',
        'picks.result',
        'players.club_code',
      ])
      .where('picks.round_id', 'in', rounds.map((r) => r.id))
      .execute();
    const byRound = new Map<number, typeof picks>();
    for (const p of picks) {
      const list = byRound.get(p.round_id) ?? [];
      list.push(p);
      byRound.set(p.round_id, list);
    }
    filtered = rounds.filter((r) => {
      const ps = byRound.get(r.id) ?? [];
      if (q.player !== undefined && !ps.some((p) => p.player_id === q.player)) return false;
      if (q.club !== undefined && !ps.some((p) => p.club_code === q.club)) return false;
      if (q.direction !== undefined && !ps.some((p) => p.direction === q.direction)) return false;
      if (q.teamPick === true && !ps.some((p) => p.kind === 'team')) return false;
      if (q.teamPick === false && ps.some((p) => p.kind === 'team')) return false;
      if (q.member !== undefined) {
        const own = ps.find((p) => p.kind === 'personal' && p.member_id === q.member);
        const rd = derived.rounds.get(r.id);
        switch (q.memberFilter) {
          case 'hit':
            return own?.result === 'hit';
          case 'miss':
            return own?.result === 'miss';
          case 'blame':
            return rd?.blame === q.member;
          case 'cooldown':
            return ps.some((p) => p.kind === 'team' && p.cooldown_for_member_id === q.member);
          default:
            return own !== undefined;
        }
      }
      return true;
    });
  }
  const page = Math.max(1, q.page ?? 1);
  const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return {
    items: await buildRoundSummaries(deps, slice, derived),
    page,
    pageSize: PAGE_SIZE,
    total: filtered.length,
  };
}
