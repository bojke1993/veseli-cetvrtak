import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Direction, PickResult, RoundStatus } from '../../src/db/schema.js';
import { getBlame, getMemberStats, getMembersStats, getOverview, listSeasons } from '../../src/services/stats.js';
import { createTestDeps, type TestDeps } from '../helpers/deps.js';

/** Personal pick for member m, or team pick replacing member m. */
interface PickSpec {
  m: number;
  team?: boolean;
  result: PickResult | null;
  direction?: Direction;
  player?: number | null;
  importName?: string;
}

let deps: TestDeps;
const players: number[] = [];
const roundIds: Record<number, number> = {};

async function addRound(o: {
  number: number;
  day: string;
  season: string;
  status: RoundStatus;
  stake: number;
  odds: number;
  payer: number;
  actualWin: number | null;
  provisional?: boolean;
  picks: PickSpec[];
}) {
  const res = await deps.db
    .insertInto('rounds')
    .values({
      number: o.number,
      opened_at: new Date(`${o.day}T08:00:00Z`),
      game_day: o.day,
      season_code: o.season,
      source: 'app',
      status: o.status,
      stake: o.stake,
      total_odds: o.odds,
      payer_member_id: o.payer,
      actual_win: o.actualWin,
      actual_win_provisional: o.provisional ?? false,
      actual_win_manual: false,
      hits: o.picks.filter((p) => p.result === 'hit').length,
      misses: o.picks.filter((p) => p.result === 'miss').length,
      voids: o.picks.filter((p) => p.result === 'void').length,
      has_corrections: false,
    })
    .executeTakeFirstOrThrow();
  const roundId = Number(res.insertId);
  roundIds[o.number] = roundId;
  await deps.db
    .insertInto('picks')
    .values(
      o.picks.map((p, i) => ({
        round_id: roundId,
        slot: i + 1,
        kind: p.team ? ('team' as const) : ('personal' as const),
        member_id: p.team ? null : p.m,
        cooldown_for_member_id: p.team ? p.m : null,
        player_id: p.player === undefined ? players[p.m - 1]! : p.player,
        import_player_name: p.importName ?? null,
        line: 14.5,
        direction: p.direction ?? 'over',
        result: p.result,
      })),
    )
    .execute();
}

const all = (result: PickResult): PickSpec[] => [1, 2, 3, 4].map((m) => ({ m, result }));

beforeAll(async () => {
  deps = await createTestDeps({ now: '2026-10-15T10:00:00Z' });
  for (const [first, last] of [['Shane', 'Larkin'], ['Kendrick', 'Nunn'], ['Nikola', 'Mirotić'], ['Mike', 'James']] as const) {
    const r = await deps.db
      .insertInto('players')
      .values({
        first_name: first,
        last_name: last,
        full_name: `${first} ${last}`,
        search_name: `${first} ${last}`.toLowerCase(),
        is_active: true,
        is_manual: false,
      })
      .executeTakeFirstOrThrow();
    players.push(Number(r.insertId));
  }

  // Previous season: 0/4.
  await addRound({ number: 1, day: '2026-03-05', season: 'E2025', status: 'lost', stake: 1000, odds: 20, payer: 4, actualWin: 0, picks: all('miss') });
  // Current season (E2026).
  await addRound({ number: 2, day: '2026-10-01', season: 'E2026', status: 'won', stake: 1000, odds: 10, payer: 1, actualWin: 10000, picks: all('hit') });
  await addRound({
    number: 3, day: '2026-10-08', season: 'E2026', status: 'lost', stake: 1000, odds: 12, payer: 2, actualWin: 0,
    picks: [{ m: 1, result: 'hit' }, { m: 2, result: 'miss', direction: 'under' }, { m: 3, result: 'hit' }, { m: 4, result: 'hit' }],
  });
  await addRound({
    number: 4, day: '2026-10-09', season: 'E2026', status: 'lost', stake: 500, odds: 8, payer: 1, actualWin: 0,
    picks: [{ m: 1, result: 'hit' }, { m: 2, result: 'hit' }, { m: 3, result: 'hit' }, { m: 4, team: true, result: 'miss' }],
  });
  await addRound({
    number: 5, day: '2026-10-10', season: 'E2026', status: 'void', stake: 500, odds: 9, payer: 3, actualWin: 500,
    picks: [{ m: 1, result: 'void', player: null, importName: 'Đorđe Test' }, { m: 2, result: 'void' }, { m: 3, result: 'void' }, { m: 4, result: 'void' }],
  });
  await addRound({
    number: 6, day: '2026-10-11', season: 'E2026', status: 'won', stake: 1000, odds: 9, payer: 1, actualWin: 5000, provisional: true,
    picks: [{ m: 1, result: 'hit' }, { m: 2, result: 'hit' }, { m: 3, result: 'void' }, { m: 4, result: 'hit' }],
  });
  // Open round: member 3 put on cooldown (team slot), nothing resolved yet.
  await addRound({
    number: 7, day: '2026-10-15', season: 'E2026', status: 'open', stake: 1000, odds: 10, payer: 1, actualWin: null,
    picks: [{ m: 1, result: null }, { m: 2, result: null }, { m: 3, team: true, result: null }, { m: 4, result: null }],
  });
});

afterAll(async () => {
  await deps?.t.destroy();
});

describe('stats service', () => {
  it('lists seasons from rounds and the seasons table', async () => {
    expect(await listSeasons(deps)).toEqual({
      seasons: [{ code: 'E2026', name: '2026/27' }, { code: 'E2025', name: '2025/26' }],
      current: 'E2026',
    });
  });

  it('overview defaults to the current season', async () => {
    const o = await getOverview(deps, {});
    expect(o).toMatchObject({
      totalStaked: 4000,
      totalWon: 15500,
      balance: 11500,
      roiPercent: 287.5,
      rounds: 5,
      wonRounds: 2,
      wonPercent: 40,
      biggestWin: { roundId: roundIds[2], number: 2, amount: 10000 },
      longestLosingRun: 2,
      team: { picks: 1, hits: 0, misses: 1, voids: 0, hitPercent: 0, blames: 1 },
      hasProvisional: true,
    });
    expect(o.distribution).toEqual([
      { key: '4/4', count: 1, percent: 20 },
      { key: '3/4', count: 2, percent: 40 },
      { key: '2/4', count: 0, percent: 0 },
      { key: '1/4', count: 0, percent: 0 },
      { key: '0/4', count: 0, percent: 0 },
      { key: 'with_void', count: 2, percent: 40 },
    ]);
    expect(o.balanceSeries.map((b) => b.balance)).toEqual([9000, 8000, 7500, 7500, 11500]);
  });

  it('overview for all seasons and for a period', async () => {
    const a = await getOverview(deps, { season: 'all' });
    expect(a.rounds).toBe(6);
    expect(a.distribution.find((b) => b.key === '0/4')!.count).toBe(1);
    expect(a.distribution.reduce((s, b) => s + b.percent, 0)).toBeCloseTo(100, 5);
    expect(a.balance).toBe(10500);

    const p = await getOverview(deps, { season: 'all', from: '2026-10-08', to: '2026-10-09' });
    expect(p.rounds).toBe(2);
    expect(p.wonPercent).toBe(0);
    expect(p.longestLosingRun).toBe(2);

    const empty = await getOverview(deps, { season: 'E2019' });
    expect(empty).toMatchObject({ rounds: 0, roiPercent: null, wonPercent: null, biggestWin: null, hasProvisional: false });
    expect(empty.distribution.every((b) => b.percent === 0)).toBe(true);
  });

  it('member stats: personal picks only, current status from derived state', async () => {
    const list = await getMembersStats(deps, {});
    expect(list.map((m) => m.memberId)).toEqual([1, 2, 3, 4]);
    const [m1, m2, m3, m4] = list;
    expect(m1).toMatchObject({
      hits: 4, misses: 0, voids: 1, hitPercent: 100, blames: 0, payments: 3, paidTotal: 2500,
      currentStreak: 4, longestHitStreak: 4, longestMissStreak: 0, fires: 1, hasFire: true, onCooldown: false,
      overPercent: 100, underPercent: null,
    });
    expect(m1!.last10).toEqual(['hit', 'void', 'hit', 'hit', 'hit']);
    expect(m1!.favoritePlayers).toEqual([
      { playerId: players[0], name: 'Shane Larkin', picks: 4, hits: 4 },
      { playerId: null, name: 'Đorđe Test', picks: 1, hits: 0 },
    ]);
    expect(m2).toMatchObject({
      hits: 3, misses: 1, voids: 1, hitPercent: 75, blames: 1, payments: 1, paidTotal: 1000,
      currentStreak: 2, longestHitStreak: 2, longestMissStreak: 1, fires: 0, hasFire: false,
      overPercent: 100, underPercent: 0,
    });
    expect(m3).toMatchObject({ onCooldown: true, cooldowns: 0, payments: 1 });
    // Member 4: team pick in round 4 (cooldown) is not personal; fire on 3rd hit in round 6.
    expect(m4).toMatchObject({ hits: 3, misses: 0, voids: 1, cooldowns: 1, fires: 1, hasFire: true, currentStreak: 3 });
  });

  it('member stats across all seasons keep current-season status', async () => {
    const res = await getMemberStats(deps, 2, { season: 'all' });
    expect(res.stats).toMatchObject({ hits: 3, misses: 2, longestMissStreak: 1, currentStreak: 2 });
    expect(res.picks.map((p) => p.number)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(res.picks[0]).toMatchObject({ roundId: roundIds[6], playerName: 'Kendrick Nunn', line: 14.5, direction: 'over', result: 'hit' });
    await expect(getMemberStats(deps, 9, {})).rejects.toMatchObject({ statusCode: 404 });
  });

  it('blame ranking with the team row last', async () => {
    const rows = await getBlame(deps, {});
    expect(rows.map((r) => [r.rank, r.memberId, r.blames])).toEqual([
      [1, 2, 1], [2, 1, 0], [3, 3, 0], [4, 4, 0], [5, 'team', 1],
    ]);
    expect(rows[0]).toMatchObject({ blamePercent: 20, lostPotentialWin: 12000, rounds: [{ roundId: roundIds[3], number: 3, gameDay: '2026-10-08' }] });
    expect(rows[4]).toMatchObject({ lostPotentialWin: 4000, blamePercent: 100 });
    // no team blames in the previous season → no team row
    const prev = await getBlame(deps, { season: 'E2025' });
    expect(prev.map((r) => r.memberId)).toEqual([1, 2, 3, 4]);
    expect(prev.every((r) => r.blames === 0)).toBe(true);
  });

  it('blame tie-break by lost potential win', async () => {
    // Two extra lost rounds next season: member 3 blamed once (big), member 1 once (small).
    await addRound({
      number: 8, day: '2027-10-01', season: 'E2027', status: 'lost', stake: 100, odds: 5, payer: 1, actualWin: 0,
      picks: [{ m: 1, result: 'miss' }, { m: 2, result: 'hit' }, { m: 3, result: 'hit' }, { m: 4, result: 'hit' }],
    });
    await addRound({
      number: 9, day: '2027-10-08', season: 'E2027', status: 'lost', stake: 1000, odds: 5, payer: 1, actualWin: 0,
      picks: [{ m: 1, result: 'hit' }, { m: 2, result: 'hit' }, { m: 3, result: 'miss' }, { m: 4, result: 'hit' }],
    });
    deps.derived.invalidate();
    const rows = await getBlame(deps, { season: 'E2027' });
    expect(rows.map((r) => [r.memberId, r.blames, r.lostPotentialWin])).toEqual([
      [3, 1, 5000], [1, 1, 500], [2, 0, 0], [4, 0, 0],
    ]);
  });
});
