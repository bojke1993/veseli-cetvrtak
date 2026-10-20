import { sql } from 'kysely';
import type { CreatePlayerRequest, PlayerDto, PlayerSearchItem } from '../api-types.js';
import type { Deps } from '../deps.js';
import type { Game } from '../db/schema.js';
import { normalizeName } from '../domain/text.js';
import { notFound, unprocessable } from '../http/errors.js';
import { gameDto, gameNotStarted, loadClubs, playerDto, shortDay } from './dto.js';

export const SEARCH_LIMIT = 10;

function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** REQ-07: autocomplete over the local players table. */
export async function searchPlayers(
  deps: Deps,
  q: { q: string; day?: string; roundId?: number },
): Promise<PlayerSearchItem[]> {
  const tokens = normalizeName(q.q).split(' ').filter(Boolean);
  if (normalizeName(q.q).length < 2 || tokens.length === 0) return [];

  let day = q.day ?? null;
  const usedPlayerIds = new Set<number>();
  if (q.roundId !== undefined) {
    const round = await deps.db.selectFrom('rounds').select(['id', 'game_day']).where('id', '=', q.roundId).executeTakeFirst();
    if (round) {
      day ??= round.game_day;
      const picks = await deps.db
        .selectFrom('picks')
        .select('player_id')
        .where('round_id', '=', round.id)
        .where('player_id', 'is not', null)
        .execute();
      for (const p of picks) usedPlayerIds.add(p.player_id!);
    }
  }

  let query = deps.db
    .selectFrom('players')
    .leftJoin('clubs', 'clubs.code', 'players.club_code')
    .selectAll('players')
    .where('players.is_active', '=', 1);
  for (const t of tokens) {
    const pattern = `%${likeEscape(t)}%`;
    query = query.where((eb) =>
      eb.or([
        eb('players.search_name', 'like', pattern),
        eb('clubs.name', 'like', pattern),
        eb('clubs.short_name', 'like', pattern),
        eb('players.club_code', 'like', pattern),
      ]),
    );
  }
  const rows = await query.orderBy('players.full_name').limit(200).execute();

  const games: Game[] = day ? await deps.db.selectFrom('games').selectAll().where('game_day', '=', day).execute() : [];
  const clubs = await loadClubs(deps.db, [
    ...rows.map((r) => r.club_code),
    ...games.flatMap((g) => [g.home_club_code, g.away_club_code]),
  ]);
  const now = deps.now();

  const items = rows.map((p): PlayerSearchItem & { rank: number } => {
    const base = playerDto(p, clubs);
    if (!day) {
      const used = usedPlayerIds.has(p.id);
      return { ...base, game: null, selectable: !used, note: used ? 'Već izabran u ovom kolu' : null, rank: used ? 1 : 0 };
    }
    const game = p.club_code
      ? games.find((g) => g.home_club_code === p.club_code || g.away_club_code === p.club_code) ?? null
      : null;
    let note: string | null = null;
    if (!game) note = `Ne igra ${shortDay(day)}`;
    else if (game.status === 'postponed' || game.status === 'cancelled') note = 'Utakmica je odložena ili otkazana';
    else if (!gameNotStarted(game, now)) note = 'Utakmica je počela';
    else if (usedPlayerIds.has(p.id)) note = 'Već izabran u ovom kolu';
    return { ...base, game: game ? gameDto(game, clubs) : null, selectable: note === null, note, rank: note === null ? 0 : 1 };
  });
  // Exact prefix matches first, then selectable ones.
  const first = tokens[0]!;
  items.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const an = normalizeName(a.fullName);
    const bn = normalizeName(b.fullName);
    const ap = an.startsWith(first) || an.includes(` ${first}`) ? 0 : 1;
    const bp = bn.startsWith(first) || bn.includes(` ${first}`) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.fullName.localeCompare(b.fullName);
  });
  // A query naming a club (e.g. "partizan") lists its whole roster, not just the first page.
  // Needs 3+ letters so that e.g. "ma" (Madrid, Maccabi) does not dump hundreds of players.
  const clubQuery = tokens.join('').length >= 3 && [...clubs.values()].some((c) => {
    const text = normalizeName(`${c.name} ${c.shortName} ${c.code}`);
    return tokens.every((t) => text.includes(t));
  });
  const result = clubQuery ? items : items.slice(0, SEARCH_LIMIT);
  return result.map(({ rank: _rank, ...rest }) => rest);
}

/** REQ-04.5: manual player ("ručno dodat"). */
export async function createPlayer(deps: Deps, input: CreatePlayerRequest): Promise<PlayerDto> {
  const first = input.firstName.trim();
  const last = input.lastName.trim();
  if (!first && !last) throw unprocessable('Ime ili prezime igrača je obavezno.');
  if (input.clubCode) {
    const club = await deps.db.selectFrom('clubs').select('code').where('code', '=', input.clubCode).executeTakeFirst();
    if (!club) throw unprocessable('Nepoznat klub.');
  }
  const fullName = [first, last].filter(Boolean).join(' ');
  const res = await deps.db
    .insertInto('players')
    .values({
      external_code: null,
      first_name: first,
      last_name: last,
      full_name: fullName,
      search_name: normalizeName(fullName),
      club_code: input.clubCode ?? null,
      position: input.position ?? null,
      jersey: null,
      photo_url: null,
      is_active: 1,
      is_manual: 1,
      last_synced_at: null,
    })
    .executeTakeFirstOrThrow();
  return getPlayer(deps, Number(res.insertId));
}

export async function getPlayer(deps: Deps, id: number): Promise<PlayerDto> {
  const p = await deps.db.selectFrom('players').selectAll().where('id', '=', id).executeTakeFirst();
  if (!p) throw notFound('Igrač nije pronađen.');
  const clubs = await loadClubs(deps.db, [p.club_code]);
  return playerDto(p, clubs);
}

/** Used by the import: best candidates for a free-text name. */
export async function playerCandidates(deps: Deps, name: string, club: string | null, limit = 5): Promise<PlayerDto[]> {
  const tokens = normalizeName(name).split(' ').filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];
  const rows = await deps.db
    .selectFrom('players')
    .selectAll()
    .where((eb) => eb.or(tokens.map((t) => eb('search_name', 'like', `%${likeEscape(t)}%`))))
    .orderBy(sql`is_active`, 'desc')
    .limit(200)
    .execute();
  const clubs = await loadClubs(deps.db, rows.map((r) => r.club_code));
  const clubNorm = club ? normalizeName(club) : null;
  const scored = rows.map((p) => {
    let score = tokens.filter((t) => p.search_name.includes(t)).length * 10;
    const c = p.club_code ? clubs.get(p.club_code) : undefined;
    if (clubNorm && c && (normalizeName(c.name).includes(clubNorm) || normalizeName(c.shortName).includes(clubNorm) || c.code.toLowerCase() === clubNorm)) {
      score += 5;
    }
    if (p.is_active === 1) score += 1;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score || a.p.full_name.localeCompare(b.p.full_name));
  return scored.slice(0, limit).map((s) => playerDto(s.p, clubs));
}
