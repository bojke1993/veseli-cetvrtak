import { DateTime } from 'luxon';
import type { CreateGameRequest, GameDayDto, GameDto } from '../api-types.js';
import type { Deps } from '../deps.js';
import { dayInBelgrade, seasonForDate, TIMEZONE, todayInBelgrade } from '../domain/season.js';
import { notFound, unprocessable } from '../http/errors.js';
import { gameDto, loadClubs } from './dto.js';

export const GAME_DAYS_AHEAD = 14;

/** REQ-06.2: upcoming days (≤ 14 days ahead) with at least one not-started game. */
export async function listGameDays(deps: Deps): Promise<GameDayDto[]> {
  const now = deps.now();
  const today = todayInBelgrade(now);
  const until = DateTime.fromISO(today, { zone: TIMEZONE }).plus({ days: GAME_DAYS_AHEAD }).toISODate()!;
  const games = await deps.db
    .selectFrom('games')
    .selectAll()
    .where('game_day', '>=', today)
    .where('game_day', '<=', until)
    .orderBy('scheduled_at')
    .execute();
  const clubs = await loadClubs(deps.db, games.flatMap((g) => [g.home_club_code, g.away_club_code]));
  const byDay = new Map<string, GameDto[]>();
  const openDays = new Set<string>();
  for (const g of games) {
    const list = byDay.get(g.game_day) ?? [];
    list.push(gameDto(g, clubs));
    byDay.set(g.game_day, list);
    if (g.status === 'scheduled' && g.scheduled_at.getTime() > now.getTime()) openDays.add(g.game_day);
  }
  return [...byDay.entries()]
    .filter(([day]) => openDays.has(day))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({ day, games: list }));
}

export async function listGames(deps: Deps, day: string): Promise<GameDto[]> {
  const games = await deps.db.selectFrom('games').selectAll().where('game_day', '=', day).orderBy('scheduled_at').execute();
  const clubs = await loadClubs(deps.db, games.flatMap((g) => [g.home_club_code, g.away_club_code]));
  return games.map((g) => gameDto(g, clubs));
}

/** REQ-33.2: manual game; gets a negative, unique game_code. */
export async function createGame(deps: Deps, input: CreateGameRequest): Promise<GameDto> {
  if (input.homeClubCode === input.awayClubCode) throw unprocessable('Domaćin i gost moraju biti različiti klubovi.');
  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) throw unprocessable('Neispravno vreme početka utakmice.');
  const clubs = await deps.db
    .selectFrom('clubs')
    .select('code')
    .where('code', 'in', [input.homeClubCode, input.awayClubCode])
    .execute();
  if (clubs.length !== 2) throw unprocessable('Nepoznat klub.');
  const day = dayInBelgrade(scheduledAt);
  const season = seasonForDate(day);
  const id = await deps.db.transaction().execute(async (trx) => {
    const min = await trx
      .selectFrom('games')
      .select((eb) => eb.fn.min('game_code').as('min'))
      .where('season_code', '=', season)
      .executeTakeFirst();
    const code = Math.min(0, Number(min?.min ?? 0)) - 1;
    const res = await trx
      .insertInto('games')
      .values({
        season_code: season,
        game_code: code,
        euroleague_round: null,
        home_club_code: input.homeClubCode,
        away_club_code: input.awayClubCode,
        scheduled_at: scheduledAt,
        game_day: day,
        status: 'scheduled',
        home_score: null,
        away_score: null,
        live_quarter: null,
        live_clock: null,
        started_at: null,
        final_at: null,
        recheck_done_at: null,
        last_polled_at: null,
        is_manual: 1,
      })
      .executeTakeFirstOrThrow();
    return Number(res.insertId);
  });
  const g = await deps.db.selectFrom('games').selectAll().where('id', '=', id).executeTakeFirst();
  if (!g) throw notFound();
  return gameDto(g, await loadClubs(deps.db, [g.home_club_code, g.away_club_code]));
}
