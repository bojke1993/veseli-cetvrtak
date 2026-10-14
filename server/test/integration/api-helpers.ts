import type { FastifyInstance, InjectOptions } from 'fastify';
import type { PickResult } from '../../src/db/schema.js';
import { seasonForDate } from '../../src/domain/season.js';
import { buildApp } from '../../src/app.js';
import { TEST_PASSWORD } from '../helpers/db.js';
import { createTestDeps, type TestDeps } from '../helpers/deps.js';

export interface ApiCtx {
  deps: TestDeps;
  app: FastifyInstance;
  /** Session cookie per username. */
  cookies: Map<string, string>;
  close(): Promise<void>;
}

/**
 * Members start with must_change_password = 1 (seed); tests clear it except for
 * usernames listed in `mustChangeFor`, so ordinary API tests can mutate.
 */
export async function createApiCtx(opts: { now?: string; mustChangeFor?: string[] } = {}): Promise<ApiCtx> {
  const deps = await createTestDeps({ now: opts.now });
  const keep = opts.mustChangeFor ?? [];
  let clear = deps.db.updateTable('members').set({ must_change_password: 0 });
  if (keep.length > 0) clear = clear.where('username', 'not in', keep);
  await clear.execute();
  const app = await buildApp(deps);
  return {
    deps,
    app,
    cookies: new Map(),
    async close() {
      await app.close();
      await deps.t.destroy();
    },
  };
}

export async function login(ctx: ApiCtx, username: string, password = TEST_PASSWORD): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'x-requested-with': 'vc' },
    payload: { username, password },
  });
  if (res.statusCode !== 200) throw new Error(`login ${username} failed: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'vc_session');
  if (!cookie) throw new Error('no session cookie');
  ctx.cookies.set(username, cookie.value);
  return cookie.value;
}

/** Calls the API as `as` (username, logged in on demand) or as a guest when `as` is null. */
export async function api(
  ctx: ApiCtx,
  as: string | null,
  method: InjectOptions['method'],
  url: string,
  payload?: unknown,
) {
  let cookie: string | undefined;
  if (as) cookie = ctx.cookies.get(as) ?? (await login(ctx, as));
  const res = await ctx.app.inject({
    method,
    url: `/api${url}`,
    headers: { 'x-requested-with': 'vc', ...(cookie ? { cookie: `vc_session=${cookie}` } : {}) },
    ...(payload !== undefined ? { payload: payload as InjectOptions['payload'] } : {}),
  });
  let body: any = null;
  try {
    body = res.json();
  } catch {
    body = res.body;
  }
  return { status: res.statusCode, body, res };
}

export const ADMIN = 'ivanisevic';

/** Seeds clubs, two game days and some players. Returns ids. */
export async function seedFixtures(deps: TestDeps) {
  const db = deps.db;
  await db
    .insertInto('clubs')
    .values([
      { code: 'PAR', name: 'Partizan Mozzart Bet Belgrade', short_name: 'Partizan', crest_url: null },
      { code: 'RED', name: 'Crvena Zvezda Meridianbet Belgrade', short_name: 'Crvena Zvezda', crest_url: null },
      { code: 'OLY', name: 'Olympiacos Piraeus', short_name: 'Olympiacos', crest_url: null },
      { code: 'PAN', name: 'Panathinaikos AKTOR Athens', short_name: 'Panathinaikos', crest_url: null },
      { code: 'MAD', name: 'Real Madrid', short_name: 'Real Madrid', crest_url: null },
      { code: 'BAR', name: 'FC Barcelona', short_name: 'Barcelona', crest_url: null },
    ])
    .execute();
  const game = async (code: number, home: string, away: string, at: string, day: string, round = 5) => {
    const r = await db
      .insertInto('games')
      .values({
        season_code: 'E2026',
        game_code: code,
        euroleague_round: round,
        home_club_code: home,
        away_club_code: away,
        scheduled_at: new Date(at),
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
        is_manual: 0,
      })
      .executeTakeFirstOrThrow();
    return Number(r.insertId);
  };
  // Default clock: 2026-10-15T10:00Z (Thursday). Games that evening and the next day.
  const g1 = await game(41, 'PAR', 'OLY', '2026-10-15T18:00:00Z', '2026-10-15');
  const g2 = await game(42, 'RED', 'PAN', '2026-10-15T18:30:00Z', '2026-10-15');
  const g3 = await game(43, 'MAD', 'BAR', '2026-10-16T19:00:00Z', '2026-10-16');
  const player = async (first: string, last: string, club: string, active = 1) => {
    const full = `${first} ${last}`;
    const r = await db
      .insertInto('players')
      .values({
        external_code: null,
        first_name: first,
        last_name: last,
        full_name: full,
        search_name: full
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .replace(/đ/gi, 'dj')
          .toLowerCase(),
        club_code: club,
        position: 'Guard',
        jersey: '1',
        photo_url: null,
        is_active: active,
        is_manual: 0,
        last_synced_at: null,
      })
      .executeTakeFirstOrThrow();
    return Number(r.insertId);
  };
  const p = {
    vezenkov: await player('Saša', 'Vezenkov', 'OLY'),
    jones: await player('Carlik', 'Jones', 'PAR'),
    nedovic: await player('Nemanja', 'Nedović', 'RED'),
    sloukas: await player('Kostas', 'Sloukas', 'PAN'),
    campazzo: await player('Facundo', 'Campazzo', 'MAD'),
    fournier: await player('Evan', 'Fournier', 'OLY'),
    oldguy: await player('Old', 'Retired', 'PAR', 0),
  };
  return { games: { g1, g2, g3 }, players: p };
}

/** Inserts a resolved historical round directly (results per member id; member on cooldown → team slot). */
export async function insertResolvedRound(
  deps: TestDeps,
  number: number,
  day: string,
  results: Record<number, PickResult>,
  opts: { status?: 'won' | 'lost' | 'void'; stake?: number; odds?: number; payer?: number; cooldown?: number[] } = {},
): Promise<number> {
  const vals = [1, 2, 3, 4].map((m) => results[m] ?? 'hit');
  const misses = vals.filter((r) => r === 'miss').length;
  const hits = vals.filter((r) => r === 'hit').length;
  const status = opts.status ?? (misses > 0 ? 'lost' : hits > 0 ? 'won' : 'void');
  const r = await deps.db
    .insertInto('rounds')
    .values({
      number,
      opened_at: new Date(`${day}T10:00:00Z`),
      game_day: day,
      season_code: seasonForDate(day),
      euroleague_round: null,
      source: 'app',
      status,
      stake: opts.stake ?? 500,
      total_odds: opts.odds ?? 10,
      payer_member_id: opts.payer ?? 1,
      actual_win: status === 'won' ? (opts.stake ?? 500) * (opts.odds ?? 10) : 0,
      actual_win_provisional: 0,
      actual_win_manual: 0,
      hits,
      misses,
      voids: vals.length - hits - misses,
      locked_at: new Date(`${day}T17:00:00Z`),
      locked_by: 1,
      resolved_at: new Date(`${day}T22:00:00Z`),
      has_corrections: 0,
    })
    .executeTakeFirstOrThrow();
  const id = Number(r.insertId);
  const cd = new Set(opts.cooldown ?? []);
  await deps.db
    .insertInto('picks')
    .values(
      [1, 2, 3, 4].map((m) => ({
        round_id: id,
        slot: m,
        kind: cd.has(m) ? ('team' as const) : ('personal' as const),
        member_id: cd.has(m) ? null : m,
        cooldown_for_member_id: cd.has(m) ? m : null,
        player_id: null,
        game_id: null,
        line: 10.5,
        direction: m % 2 ? ('over' as const) : ('under' as const),
        odds: null,
        final_points: null,
        result: results[m] ?? 'hit',
        void_reason: null,
        resolution: 'auto' as const,
        resolved_at: new Date(`${day}T22:00:00Z`),
        import_player_name: `Igrac ${number}-${m}`,
      })),
    )
    .execute();
  deps.derived.invalidate();
  return id;
}

