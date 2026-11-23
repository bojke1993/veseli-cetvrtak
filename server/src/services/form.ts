import type { PlayerFormDto } from '../api-types.js';
import type { Deps } from '../deps.js';
import { round1 } from '../domain/money.js';
import { loadClubs } from './dto.js';

/** FR-29 / BR-40: number of finished games in the player form. */
export const FORM_GAMES = 5;

/**
 * Player form for several players at once: last FORM_GAMES finished games with a final box score
 * row, ordered chronologically (oldest first, newest last), plus the team's pick history.
 */
export async function loadPlayerForms(deps: Pick<Deps, 'db'>, playerIds: number[]): Promise<Map<number, PlayerFormDto>> {
  const ids = [...new Set(playerIds)];
  const out = new Map<number, PlayerFormDto>();
  if (ids.length === 0) return out;

  const [players, stats, history] = await Promise.all([
    deps.db.selectFrom('players').select(['id', 'club_code']).where('id', 'in', ids).execute(),
    deps.db
      .selectFrom('player_game_stats as s')
      .innerJoin('games as g', 'g.id', 's.game_id')
      .select(['s.player_id', 's.points', 's.seconds_played', 'g.id as game_id', 'g.game_day', 'g.scheduled_at', 'g.home_club_code', 'g.away_club_code'])
      .where('s.player_id', 'in', ids)
      .where('s.is_final', '=', 1)
      .where('g.status', '=', 'final')
      .orderBy('g.scheduled_at', 'desc')
      .execute(),
    deps.db
      .selectFrom('picks')
      .select(['player_id', 'result'])
      .where('player_id', 'in', ids)
      .where('result', 'in', ['hit', 'miss'])
      .execute(),
  ]);

  const clubOf = new Map(players.map((p) => [p.id, p.club_code]));
  const seconds = new Map<number, number>(); // per player: seconds over the form games played
  const clubs = await loadClubs(deps.db, stats.flatMap((r) => [r.home_club_code, r.away_club_code]));
  const short = (code: string) => clubs.get(code)?.shortName ?? code;

  for (const id of ids) out.set(id, { playerId: id, games: [], average: null, averageMinutes: null, ourPicks: 0, ourHits: 0 });
  for (const r of stats) {
    const form = out.get(r.player_id)!;
    if (form.games.length >= FORM_GAMES) continue;
    const club = clubOf.get(r.player_id) ?? null;
    const home = club === r.home_club_code ? true : club === r.away_club_code ? false : null;
    seconds.set(r.player_id, (seconds.get(r.player_id) ?? 0) + r.seconds_played);
    form.games.push({
      gameId: r.game_id,
      gameDay: r.game_day,
      opponent: home === null ? null : short(home ? r.away_club_code : r.home_club_code),
      home,
      points: r.points,
      dnp: r.seconds_played === 0,
    });
  }
  for (const form of out.values()) {
    form.games.reverse(); // BR-40: oldest on the left
    const played = form.games.filter((g) => !g.dnp);
    form.average = played.length > 0 ? round1(played.reduce((a, g) => a + g.points, 0) / played.length) : null;
    form.averageMinutes = played.length > 0 ? round1((seconds.get(form.playerId) ?? 0) / 60 / played.length) : null;
  }
  for (const h of history) {
    const form = out.get(h.player_id!)!;
    form.ourPicks++;
    if (h.result === 'hit') form.ourHits++;
  }
  return out;
}

export async function getPlayerForm(deps: Pick<Deps, 'db'>, playerId: number): Promise<PlayerFormDto> {
  return (await loadPlayerForms(deps, [playerId])).get(playerId)!;
}
