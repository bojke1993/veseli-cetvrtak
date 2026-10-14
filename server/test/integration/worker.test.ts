import { afterEach, describe, expect, it } from 'vitest';
import type { BusEvent } from '../../src/live/bus.js';
import type { ProviderBoxscoreLine, ProviderClub, ProviderGame, ProviderPlayer } from '../../src/provider/types.js';
import { syncPlayers, syncSchedule } from '../../src/services/sync.js';
import { runAutoLock, runLivePoll, runNotPlayed, runRecheck, runResolvePending, runSchedule } from '../../src/worker/jobs.js';
import { startScheduler } from '../../src/worker/scheduler.js';
import { createTestDeps, type TestDeps } from '../helpers/deps.js';

const SEASON = 'E2026';
const PAR: ProviderClub = { code: 'PAR', name: 'Partizan Mozzart Bet Belgrade', shortName: 'Partizan', crestUrl: null };
const MIL: ProviderClub = { code: 'MIL', name: 'Armani Olimpia Milan', shortName: 'Milan', crestUrl: null };
const MAD: ProviderClub = { code: 'MAD', name: 'Real Madrid', shortName: 'Real Madrid', crestUrl: null };
const BAR: ProviderClub = { code: 'BAR', name: 'FC Barcelona', shortName: 'Barcelona', crestUrl: null };

let deps: TestDeps | null = null;
afterEach(async () => {
  await deps?.t.destroy();
  deps = null;
});

interface Fixture {
  deps: TestDeps;
  roundId: number;
  game1: number;
  game2: number;
  players: number[];
  pickIds: number[];
  events: BusEvent[];
}

/**
 * Round on Thursday 2026-10-15 with two games (PAR-MIL 18:00Z, MAD-BAR 19:00Z) and 4 picks:
 *  slot1: P1 (PAR) over 10.5, slot2: P2 (MIL) under 8.5, slot3: P3 (PAR) over 5.5, slot4: P4 (MAD) over 12.5
 */
async function setup(opts: { status?: 'open' | 'locked'; odds?: Array<number | null> } = {}): Promise<Fixture> {
  const d = await createTestDeps({ now: '2026-10-15T10:00:00Z' });
  deps = d;
  const db = d.db;
  for (const c of [PAR, MIL, MAD, BAR]) {
    await db.insertInto('clubs').values({ code: c.code, name: c.name, short_name: c.shortName, crest_url: null }).execute();
  }
  const players: number[] = [];
  for (const [code, name, club] of [
    ['000001', 'Player One', 'PAR'],
    ['000002', 'Player Two', 'MIL'],
    ['000003', 'Player Three', 'PAR'],
    ['000004', 'Player Four', 'MAD'],
  ] as const) {
    const [first, last] = name.split(' ');
    const r = await db
      .insertInto('players')
      .values({
        external_code: code,
        first_name: first!,
        last_name: last!,
        full_name: name,
        search_name: name.toLowerCase(),
        club_code: club,
        position: null,
        jersey: null,
        photo_url: null,
        is_active: 1,
        is_manual: 0,
        last_synced_at: null,
      })
      .executeTakeFirstOrThrow();
    players.push(Number(r.insertId));
  }
  const game = async (code: number, home: string, away: string, at: string): Promise<number> => {
    const r = await db
      .insertInto('games')
      .values({
        season_code: SEASON,
        game_code: code,
        euroleague_round: 5,
        home_club_code: home,
        away_club_code: away,
        scheduled_at: new Date(at),
        game_day: '2026-10-15',
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
  const game1 = await game(41, 'PAR', 'MIL', '2026-10-15T18:00:00Z');
  const game2 = await game(42, 'MAD', 'BAR', '2026-10-15T19:00:00Z');

  const status = opts.status ?? 'locked';
  const round = await db
    .insertInto('rounds')
    .values({
      number: 1,
      opened_at: new Date('2026-10-13T10:00:00Z'),
      game_day: '2026-10-15',
      season_code: SEASON,
      euroleague_round: 5,
      source: 'app',
      status,
      stake: '1000.00',
      total_odds: '10.00',
      payer_member_id: 1,
      actual_win: null,
      actual_win_provisional: 0,
      actual_win_manual: 0,
      hits: 0,
      misses: 0,
      voids: 0,
      locked_at: status === 'locked' ? new Date('2026-10-15T09:00:00Z') : null,
      locked_by: status === 'locked' ? 1 : null,
      resolved_at: null,
      has_corrections: 0,
    })
    .executeTakeFirstOrThrow();
  const roundId = Number(round.insertId);
  const spec = [
    { player: players[0]!, game: game1, line: '10.5', direction: 'over' as const },
    { player: players[1]!, game: game1, line: '8.5', direction: 'under' as const },
    { player: players[2]!, game: game1, line: '5.5', direction: 'over' as const },
    { player: players[3]!, game: game2, line: '12.5', direction: 'over' as const },
  ];
  const pickIds: number[] = [];
  for (const [i, s] of spec.entries()) {
    const odds = opts.odds?.[i];
    const r = await db
      .insertInto('picks')
      .values({
        round_id: roundId,
        slot: i + 1,
        kind: 'personal',
        member_id: i + 1,
        cooldown_for_member_id: null,
        player_id: s.player,
        game_id: s.game,
        line: s.line,
        direction: s.direction,
        odds: odds === undefined || odds === null ? null : odds,
        final_points: null,
        result: null,
        void_reason: null,
        resolution: null,
        resolved_at: null,
        import_player_name: null,
      })
      .executeTakeFirstOrThrow();
    pickIds.push(Number(r.insertId));
  }
  const events: BusEvent[] = [];
  d.bus.subscribe((e) => events.push(e));
  return { deps: d, roundId, game1, game2, players, pickIds, events };
}

const line = (code: string, points: number, seconds: number, club = 'PAR'): ProviderBoxscoreLine => ({
  playerCode: code,
  name: 'X, Y',
  clubCode: club,
  points,
  secondsPlayed: seconds,
  fouls: 1,
});

async function picks(d: TestDeps, roundId: number) {
  return d.db.selectFrom('picks').selectAll().where('round_id', '=', roundId).orderBy('slot').execute();
}
async function round(d: TestDeps, roundId: number) {
  return d.db.selectFrom('rounds').selectAll().where('id', '=', roundId).executeTakeFirstOrThrow();
}
async function game(d: TestDeps, id: number) {
  return d.db.selectFrom('games').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
}

describe('livePoll', () => {
  it('ignores games outside the window, then tracks live points and publishes SSE events', async () => {
    const f = await setup();
    const d = f.deps;
    let r = await runLivePoll(d);
    expect(r.polled).toEqual([]);
    expect(d.provider.calls).toEqual([]);

    // 10 min before tip-off: header only.
    d.setNow('2026-10-15T17:52:00Z');
    r = await runLivePoll(d);
    expect(r.polled).toEqual([f.game1]);
    expect(d.provider.calls).toEqual(['getHeader:E2026:41']);
    expect((await game(d, f.game1)).status).toBe('scheduled');

    d.setNow('2026-10-15T18:20:00Z');
    d.provider.headers.set(41, { live: true, homeScore: 30, awayScore: 28, quarter: '2', clock: '05:12' });
    d.provider.boxscores.set(41, {
      live: true,
      lines: [line('000001', 12, 600), line('000002', 4, 300, 'MIL'), line('000003', 0, 0), line('999999', 20, 900)],
    });
    r = await runLivePoll(d);
    expect(r.errors).toBe(0);
    const g1 = await game(d, f.game1);
    expect(g1).toMatchObject({ status: 'live', home_score: 30, away_score: 28, live_quarter: '2', live_clock: '05:12' });
    expect(g1.started_at?.toISOString()).toBe('2026-10-15T18:20:00.000Z');
    const stats = await d.db.selectFrom('player_game_stats').selectAll().where('game_id', '=', f.game1).execute();
    expect(stats).toHaveLength(3); // only picked players
    expect(stats.find((s) => s.player_id === f.players[0])).toMatchObject({ points: 12, seconds_played: 600, is_final: 0 });

    expect((await round(d, f.roundId)).status).toBe('in_progress');
    const live = f.events.filter((e) => e.type === 'live');
    expect(live.length).toBeGreaterThan(0);
    const last = live.at(-1)!;
    if (last.type !== 'live') throw new Error('unreachable');
    expect(last.data.roundId).toBe(f.roundId);
    const bySlot = new Map(last.data.picks.map((p) => [p.slot, p.live]));
    expect(bySlot.get(1)).toMatchObject({ points: 12, status: 'sure_hit', secondsPlayed: 600 });
    expect(bySlot.get(2)).toMatchObject({ points: 4, status: 'passing' });
    expect(bySlot.get(3)).toMatchObject({ points: 0, status: 'not_entered', pointsNeeded: 6 });
    expect(bySlot.get(4)).toMatchObject({ points: null, status: 'not_started' });
    expect(f.events.some((e) => e.type === 'round' && e.data.roundId === f.roundId)).toBe(true);
    // no picks resolved yet
    expect((await picks(d, f.roundId)).every((p) => p.result === null)).toBe(true);
  });

  it('finalizes games: hit, miss, DNP void, early lost, then fully resolved', async () => {
    const f = await setup();
    const d = f.deps;
    d.setNow('2026-10-15T18:30:00Z');
    d.provider.headers.set(41, { live: true, homeScore: 40, awayScore: 38, quarter: '2', clock: '01:00' });
    d.provider.boxscores.set(41, { live: true, lines: [line('000001', 9, 600), line('000002', 6, 600, 'MIL')] });
    await runLivePoll(d);

    // Live=false but less than 90 minutes after start: not final yet.
    d.setNow('2026-10-15T19:20:00Z');
    d.provider.headers.set(41, { live: false, homeScore: 60, awayScore: 58, quarter: '3', clock: '00:00' });
    d.provider.boxscores.set(41, { live: false, lines: [line('000001', 11, 900), line('000002', 9, 900, 'MIL')] });
    await runLivePoll(d);
    expect((await game(d, f.game1)).status).toBe('live');

    d.setNow('2026-10-15T19:50:00Z');
    d.provider.headers.set(41, { live: false, homeScore: 88, awayScore: 80, quarter: '4', clock: '00:00' });
    d.provider.boxscores.set(41, {
      live: false,
      // P1 13 > 10.5 -> hit; P2 9 > 8.5 under -> miss; P3 absent -> DNP void
      lines: [line('000001', 13, 1500), line('000002', 9, 1400, 'MIL')],
    });
    const r = await runLivePoll(d);
    expect(r.finalized).toEqual([f.game1]);
    const g1 = await game(d, f.game1);
    expect(g1.status).toBe('final');
    expect(g1.final_at?.toISOString()).toBe('2026-10-15T19:50:00.000Z');
    let ps = await picks(d, f.roundId);
    expect(ps.map((p) => p.result)).toEqual(['hit', 'miss', 'void', null]);
    expect(ps[0]).toMatchObject({ final_points: 13, resolution: 'auto' });
    expect(ps[2]).toMatchObject({ void_reason: 'dnp' });
    let rd = await round(d, f.roundId);
    expect(rd).toMatchObject({ status: 'lost', hits: 1, misses: 1, voids: 1, resolved_at: null });
    const stats = await d.db.selectFrom('player_game_stats').selectAll().where('game_id', '=', f.game1).execute();
    expect(stats.every((s) => s.is_final === 1)).toBe(true);

    // Second game.
    d.setNow('2026-10-15T20:55:00Z');
    d.provider.headers.set(42, { live: false, homeScore: 90, awayScore: 70, quarter: '4', clock: '00:00' });
    d.provider.boxscores.set(42, { live: false, lines: [line('000004', 20, 1800, 'MAD')] });
    await runLivePoll(d);
    ps = await picks(d, f.roundId);
    expect(ps.map((p) => p.result)).toEqual(['hit', 'miss', 'void', 'hit']);
    rd = await round(d, f.roundId);
    expect(rd).toMatchObject({ status: 'lost', hits: 2, misses: 1, voids: 1, actual_win: '0.00' });
    expect(rd.resolved_at?.toISOString()).toBe('2026-10-15T20:55:00.000Z');

    // Idempotent: further polls do nothing for final games.
    d.provider.calls.length = 0;
    d.setNow('2026-10-15T21:10:00Z');
    await runLivePoll(d);
    expect(d.provider.calls).toEqual([]);
  });

  it('resolves a won ticket with a void pick using individual odds', async () => {
    const f = await setup({ odds: [2, 2, 1.5, 1.6] });
    const d = f.deps;
    d.setNow('2026-10-15T21:00:00Z');
    d.provider.headers.set(41, { live: false, homeScore: 88, awayScore: 80, quarter: '4', clock: '00:00' });
    d.provider.boxscores.set(41, { live: false, lines: [line('000001', 13, 1500), line('000002', 2, 1400, 'MIL')] });
    d.provider.headers.set(42, { live: false, homeScore: 90, awayScore: 70, quarter: '4', clock: '00:00' });
    d.provider.boxscores.set(42, { live: false, lines: [line('000004', 20, 1800, 'MAD')] });
    await runLivePoll(d);
    const rd = await round(d, f.roundId);
    expect(rd).toMatchObject({ status: 'won', hits: 3, misses: 0, voids: 1, actual_win_provisional: 0 });
    // 1000 * 10 / 1.5
    expect(rd.actual_win).toBe('6666.67');
  });

  it('records errors and backs off', async () => {
    const f = await setup();
    const d = f.deps;
    d.setNow('2026-10-15T19:05:00Z');
    d.provider.failWith = new Error('HTTP 503');
    const r = await runLivePoll(d);
    expect(r.errors).toBe(2);
    const runs = await d.db.selectFrom('sync_runs').selectAll().where('type', '=', 'live').execute();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'error' });
    expect(runs[0]!.error_message).toContain('HTTP 503');

    d.provider.calls.length = 0;
    d.setNow('2026-10-15T19:05:20Z');
    await runLivePoll(d); // within 30 s backoff
    expect(d.provider.calls).toEqual([]);

    d.provider.failWith = null;
    d.setNow('2026-10-15T19:06:05Z');
    const ok = await runLivePoll(d);
    expect(ok.errors).toBe(0);
    expect(ok.polled.length).toBe(2);
  });
});

describe('notPlayed', () => {
  it('voids picks whose game did not start by 06:00 the next day', async () => {
    const f = await setup();
    const d = f.deps;
    // game2 played normally, game1 never started
    d.setNow('2026-10-16T03:59:00Z'); // 05:59 Belgrade
    expect(await runNotPlayed(d)).toBe(0);
    d.setNow('2026-10-16T04:00:00Z'); // 06:00 Belgrade
    await d.db.updateTable('games').set({ status: 'final', started_at: new Date('2026-10-15T19:00:00Z') }).where('id', '=', f.game2).execute();
    expect(await runNotPlayed(d)).toBe(3);
    const ps = await picks(d, f.roundId);
    expect(ps.slice(0, 3).every((p) => p.result === 'void' && p.void_reason === 'game_not_played')).toBe(true);
    expect(ps[3]!.result).toBeNull();
    expect((await round(d, f.roundId)).voids).toBe(3);
  });

  it('voids picks on postponed games immediately', async () => {
    const f = await setup();
    const d = f.deps;
    await d.db.updateTable('games').set({ status: 'postponed' }).where('id', '=', f.game2).execute();
    expect(await runNotPlayed(d)).toBe(1);
    expect((await picks(d, f.roundId))[3]).toMatchObject({ result: 'void', void_reason: 'game_not_played', resolution: 'auto' });
  });
});

describe('recheck', () => {
  it('corrects an auto-resolved pick after 12 h and writes audit', async () => {
    const f = await setup();
    const d = f.deps;
    d.setNow('2026-10-15T21:00:00Z');
    d.provider.headers.set(41, { live: false, homeScore: 88, awayScore: 80, quarter: '4', clock: '00:00' });
    d.provider.boxscores.set(41, {
      live: false,
      lines: [line('000001', 11, 1500), line('000002', 2, 1400, 'MIL'), line('000003', 7, 600)],
    });
    await runLivePoll(d);
    expect((await picks(d, f.roundId)).slice(0, 3).map((p) => p.result)).toEqual(['hit', 'hit', 'hit']);

    d.setNow('2026-10-16T08:00:00Z'); // 11 h later: too early
    expect((await runRecheck(d)).checked).toBe(0);

    // Statistical correction: P1 10 points (miss), P3 changes points only (8, still hit).
    d.provider.boxscores.set(41, {
      live: false,
      lines: [line('000001', 10, 1500), line('000002', 2, 1400, 'MIL'), line('000003', 8, 600)],
    });
    d.setNow('2026-10-16T09:01:00Z');
    const r = await runRecheck(d);
    expect(r).toEqual({ checked: 1, fixed: 1 });
    const ps = await picks(d, f.roundId);
    expect(ps[0]).toMatchObject({ result: 'miss', final_points: 10, resolution: 'auto' });
    expect(ps[2]).toMatchObject({ result: 'hit', final_points: 8 });
    const rd = await round(d, f.roundId);
    expect(rd).toMatchObject({ status: 'lost', has_corrections: 1, misses: 1 });
    const audit = await d.db.selectFrom('audit_log').selectAll().where('action', '=', 'auto_recheck_fix').execute();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_member_id: null, round_id: f.roundId, reason: 'Ponovna provera boxscore-a' });
    expect((await game(d, f.game1)).recheck_done_at).not.toBeNull();
    expect((await runRecheck(d)).checked).toBe(0);
  });
});

describe('autoLock', () => {
  it('locks a complete open round when its first game starts', async () => {
    const f = await setup({ status: 'open' });
    const d = f.deps;
    d.setNow('2026-10-15T17:59:00Z');
    expect(await runAutoLock(d)).toEqual([]);
    d.setNow('2026-10-15T18:00:00Z');
    expect(await runAutoLock(d)).toEqual([f.roundId]);
    const rd = await round(d, f.roundId);
    expect(rd.status).toBe('locked');
    expect(rd.locked_by).toBeNull();
    expect(rd.locked_at).not.toBeNull();
  });

  it('does nothing for an incomplete round', async () => {
    const f = await setup({ status: 'open' });
    const d = f.deps;
    await d.db.updateTable('rounds').set({ stake: null }).where('id', '=', f.roundId).execute();
    d.setNow('2026-10-15T18:05:00Z');
    expect(await runAutoLock(d)).toEqual([]);
    expect((await round(d, f.roundId)).status).toBe('open');
  });
});

const providerGame = (code: number, home: ProviderClub, away: ProviderClub, at: string, played = false): ProviderGame => ({
  seasonCode: SEASON,
  gameCode: code,
  round: 5,
  home,
  away,
  scheduledAt: new Date(at),
  played,
  homeScore: played ? 80 : null,
  awayScore: played ? 70 : null,
});

describe('syncSchedule', () => {
  it('upserts games and voids picks of a game moved off the round day', async () => {
    const f = await setup();
    const d = f.deps;
    d.provider.games = [
      providerGame(41, PAR, MIL, '2026-10-15T18:00:00Z'),
      providerGame(42, MAD, BAR, '2026-10-16T19:00:00Z'), // moved to Friday
      providerGame(43, MAD, PAR, '2026-10-22T18:00:00Z'),
      providerGame(1, BAR, MIL, '2026-10-01T18:00:00Z', true),
    ];
    const res = await syncSchedule(d);
    expect(res.changed).toBe(4); // moved, two new, one voided pick
    const g2 = await game(d, f.game2);
    expect(g2.game_day).toBe('2026-10-16');
    const ps = await picks(d, f.roundId);
    expect(ps[3]).toMatchObject({ result: 'void', void_reason: 'game_not_played', resolution: 'auto' });
    expect(ps.slice(0, 3).every((p) => p.result === null)).toBe(true);
    const g43 = await d.db.selectFrom('games').selectAll().where('game_code', '=', 43).executeTakeFirstOrThrow();
    expect(g43).toMatchObject({ status: 'scheduled', game_day: '2026-10-22', home_club_code: 'MAD' });
    const g1 = await d.db.selectFrom('games').selectAll().where('game_code', '=', 1).executeTakeFirstOrThrow();
    expect(g1).toMatchObject({ status: 'final', home_score: 80, away_score: 70 });
    const runs = await d.db.selectFrom('sync_runs').selectAll().where('type', '=', 'schedule').execute();
    expect(runs).toMatchObject([{ status: 'ok', items_changed: 4 }]);
    // idempotent
    expect((await syncSchedule(d)).changed).toBe(0);
  });

  it('runSchedule is due daily after 04:00 and every 15 min on a round day', async () => {
    const f = await setup();
    const d = f.deps;
    d.provider.games = [providerGame(41, PAR, MIL, '2026-10-15T18:00:00Z')];
    expect(await runSchedule(d)).toBe(true); // never synced
    d.setNow('2026-10-15T10:10:00Z');
    expect(await runSchedule(d)).toBe(false);
    d.setNow('2026-10-15T10:16:00Z');
    expect(await runSchedule(d)).toBe(true); // round day
    await d.db.updateTable('rounds').set({ status: 'won' }).where('id', '=', f.roundId).execute();
    d.setNow('2026-10-15T11:00:00Z');
    expect(await runSchedule(d)).toBe(false);
    d.setNow('2026-10-16T01:30:00Z'); // 03:30 Belgrade
    expect(await runSchedule(d)).toBe(false);
    d.setNow('2026-10-16T02:01:00Z'); // 04:01 Belgrade
    expect(await runSchedule(d)).toBe(true);
  });

  it('records a failed sync without touching data', async () => {
    const f = await setup();
    const d = f.deps;
    d.provider.failWith = new Error('boom');
    await expect(syncSchedule(d)).rejects.toThrow('boom');
    const runs = await d.db.selectFrom('sync_runs').selectAll().execute();
    expect(runs).toMatchObject([{ type: 'schedule', status: 'error' }]);
    expect((await game(d, f.game1)).status).toBe('scheduled');
  });
});

describe('syncPlayers', () => {
  const pp = (code: string, first: string, last: string, club: ProviderClub | null, active = true): ProviderPlayer => ({
    code,
    firstName: first,
    lastName: last,
    club,
    position: 'Guard',
    jersey: '7',
    photoUrl: null,
    active,
  });

  it('upserts players and clubs, deactivates missing ones, keeps manual players', async () => {
    const f = await setup();
    const d = f.deps;
    await d.db
      .insertInto('players')
      .values({
        external_code: null,
        first_name: 'Ručni',
        last_name: 'Igrač',
        full_name: 'Ručni Igrač',
        search_name: 'rucni igrac',
        club_code: 'PAR',
        position: null,
        jersey: null,
        photo_url: null,
        is_active: 1,
        is_manual: 1,
        last_synced_at: null,
      })
      .execute();
    const ZAL: ProviderClub = { code: 'ZAL', name: 'Žalgiris Kaunas', shortName: 'Žalgiris', crestUrl: 'https://x/z.png' };
    d.provider.players = [
      pp('000001', 'Player', 'One', PAR),
      pp('000002', 'Player', 'Two', MAD), // transferred
      pp('000002', 'Player', 'Two', MIL, false), // old inactive entry
      pp('007200', 'Đorđe', 'Šarić', ZAL),
    ];
    const res = await syncPlayers(d);
    // 000001 enriched (position, jersey, club in search name), 000002 changed club, 007200 new, 000003 + 000004 deactivated
    expect(res.changed).toBe(5);
    const all = await d.db.selectFrom('players').selectAll().orderBy('id').execute();
    const by = (code: string | null) => all.find((p) => p.external_code === code)!;
    expect(by('000002')).toMatchObject({ club_code: 'MAD', is_active: 1 });
    expect(by('000003').is_active).toBe(0);
    expect(by('000004').is_active).toBe(0);
    expect(by('007200')).toMatchObject({
      full_name: 'Đorđe Šarić',
      search_name: 'djordje saric zalgiris',
      club_code: 'ZAL',
      is_active: 1,
      is_manual: 0,
    });
    expect(all.find((p) => p.is_manual === 1)!.is_active).toBe(1);
    const zal = await d.db.selectFrom('clubs').selectAll().where('code', '=', 'ZAL').executeTakeFirstOrThrow();
    expect(zal).toMatchObject({ name: 'Žalgiris Kaunas', short_name: 'Žalgiris', crest_url: 'https://x/z.png' });
    expect((await syncPlayers(d)).changed).toBe(0);
  });

  it('refuses an empty feed', async () => {
    const f = await setup();
    const d = f.deps;
    d.provider.players = [];
    await expect(syncPlayers(d)).rejects.toThrow(/Prazan/);
    const active = await d.db.selectFrom('players').select('id').where('is_active', '=', 1).execute();
    expect(active).toHaveLength(4);
  });
});

describe('scheduler', () => {
  it('runs one tick at start (sync, no crash on provider outage) and stops cleanly', async () => {
    const f = await setup();
    const d = f.deps;
    d.setNow('2026-10-15T19:05:00Z');
    d.provider.failWith = new Error('offline');
    const s = startScheduler(d, { tickMs: 60_000 });
    await s.stop();
    const runs = await d.db.selectFrom('sync_runs').select(['type', 'status']).orderBy('id').execute();
    expect(runs).toEqual([
      { type: 'schedule', status: 'error' },
      { type: 'players', status: 'error' },
      { type: 'live', status: 'error' },
    ]);
    expect(d.provider.calls.some((c) => c.startsWith('listGames'))).toBe(true);
  });
});

describe('code review regressions', () => {
  it('notPlayed never voids picks on manual games (admin resolves them)', async () => {
    const f = await setup();
    const d = f.deps;
    await d.db.updateTable('games').set({ is_manual: 1 }).where('id', '=', f.game1).execute();
    d.setNow('2026-10-16T06:30:00Z');
    await runNotPlayed(d);
    const ps = await picks(d, f.roundId);
    expect(ps.slice(0, 3).map((p) => p.result)).toEqual([null, null, null]);
    expect(ps[3]!.result).toBe('void'); // non-manual game2 never started
  });

  it('resolvePending resolves picks of a final game left unresolved (crash between final and resolve)', async () => {
    const f = await setup();
    const d = f.deps;
    const now = new Date('2026-10-15T20:00:00Z');
    d.setNow(now);
    await d.db
      .updateTable('games')
      .set({ status: 'final', home_score: 80, away_score: 70, started_at: now, final_at: now })
      .where('id', '=', f.game1)
      .execute();
    for (const [i, pts] of [12, 4, 6].entries()) {
      await d.db
        .insertInto('player_game_stats')
        .values({ game_id: f.game1, player_id: f.players[i]!, points: pts, seconds_played: 900, fouls: 1, is_final: 1, updated_at: now })
        .execute();
    }
    expect(await runResolvePending(d)).toBe(1);
    const ps = await picks(d, f.roundId);
    expect(ps.slice(0, 3).map((p) => p.result)).toEqual(['hit', 'hit', 'hit']);
    expect(await runResolvePending(d)).toBe(0);
  });

  it('counts the boxscore call against the budget when a game starts early', async () => {
    const f = await setup();
    const d = f.deps;
    d.setNow('2026-10-15T17:55:00Z'); // before scheduled tip-off, header only reserved
    d.provider.headers.set(41, { live: true, homeScore: 2, awayScore: 0, quarter: '1', clock: '09:40' });
    d.provider.boxscores.set(41, { live: true, lines: [line('000001', 2, 20)] });
    const r = await runLivePoll(d);
    expect(r.polled).toEqual([f.game1]);
    expect(d.provider.calls).toEqual(['getHeader:E2026:41', 'getBoxscore:E2026:41']);
  });
});
