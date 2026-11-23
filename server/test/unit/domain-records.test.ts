import { describe, expect, it } from 'vitest';
import { computeDerived } from '../../src/domain/derived.js';
import type { DerivedRoundInput } from '../../src/domain/derived-types.js';
import { computeBadges, computeRecords, isNearMiss, nearMisses, type RecordPick, type RecordRound } from '../../src/domain/records.js';

/** Pick spec per member 1..4: [result, finalPoints?, odds?] on an "over 10.5" line; 'team' replaces the member. */
type Spec = ['hit' | 'miss' | 'void', number?, number?] | ['team', 'hit' | 'miss'];

let nextId = 1;
function mk(number: number, specs: [Spec, Spec, Spec, Spec], opts: { day?: string; season?: string; stake?: number; odds?: number } = {}): RecordRound {
  const picks: RecordPick[] = specs.map((s, i) => {
    if (s[0] === 'team') {
      return { kind: 'team', memberId: null, playerName: `T${i}`, line: 10.5, odds: 1.8, finalPoints: s[1] === 'hit' ? 12 : 8, result: s[1] };
    }
    const [result, points, odds] = s;
    return {
      kind: 'personal',
      memberId: i + 1,
      playerName: `P${i + 1}`,
      line: 10.5,
      odds: odds ?? 1.8,
      finalPoints: points ?? (result === 'hit' ? 12 : result === 'miss' ? 8 : null),
      result,
    };
  });
  const results = picks.map((p) => p.result);
  const status = results.includes('miss') ? 'lost' : results.every((r) => r === 'void') ? 'void' : 'won';
  const stake = opts.stake ?? 1000;
  const totalOdds = opts.odds ?? 10;
  return {
    id: nextId++,
    number,
    gameDay: opts.day ?? `2026-10-${String(number).padStart(2, '0')}`,
    seasonCode: opts.season ?? 'E2026',
    status,
    stake,
    totalOdds,
    won: status === 'won' ? stake * totalOdds : status === 'void' ? stake : 0,
    picks,
  };
}

function derive(rounds: RecordRound[]) {
  const input: DerivedRoundInput[] = rounds.map((r) => ({
    roundId: r.id,
    number: r.number,
    seasonCode: r.seasonCode,
    status: r.status,
    picks: r.picks.map((p, i) => ({
      slot: i + 1,
      kind: p.kind,
      memberId: p.memberId,
      cooldownForMemberId: p.kind === 'team' ? i + 1 : null,
      result: p.result,
    })),
  }));
  return computeDerived(input);
}

const IDS = [1, 2, 3, 4];

describe('isNearMiss', () => {
  it('only a miss by exactly half a point', () => {
    expect(isNearMiss({ result: 'miss', line: 14.5, finalPoints: 14 })).toBe(true);
    expect(isNearMiss({ result: 'miss', line: 9.5, finalPoints: 10 })).toBe(true);
    expect(isNearMiss({ result: 'miss', line: 14.5, finalPoints: 13 })).toBe(false);
    expect(isNearMiss({ result: 'hit', line: 14.5, finalPoints: 15 })).toBe(false);
    expect(isNearMiss({ result: 'miss', line: 14.5, finalPoints: null })).toBe(false);
  });
});

describe('computeRecords', () => {
  it('finds each record, ties keep the earlier round', () => {
    const rounds = [
      mk(1, [['hit', 20, 2.5], ['hit'], ['hit'], ['hit']], { odds: 12 }),
      mk(2, [['hit'], ['miss', 10], ['hit'], ['hit']], { odds: 8 }), // member 2 near miss, sole miss
      mk(3, [['hit'], ['hit', 30, 1.5], ['hit'], ['hit']], { odds: 12 }), // tie on ticket odds → round 1 stays
      mk(4, [['miss'], ['miss'], ['hit'], ['hit']], { odds: 30 }),
    ];
    const recs = computeRecords(rounds, derive(rounds), IDS);
    const byCode = Object.fromEntries(recs.map((r) => [r.code, r]));
    expect(byCode.biggest_win).toMatchObject({ value: 12000, roundNumber: 1, memberId: null });
    expect(byCode.top_ticket_odds).toMatchObject({ value: 12, roundNumber: 1 });
    expect(byCode.top_pick_odds).toMatchObject({ value: 2.5, memberId: 1, playerName: 'P1', roundNumber: 1 });
    expect(byCode.biggest_margin).toMatchObject({ value: 19.5, memberId: 2, roundNumber: 3 });
    expect(byCode.longest_hit_streak).toMatchObject({ value: 4, memberId: 3, roundNumber: 4 });
    expect(byCode.longest_miss_streak).toMatchObject({ value: 1, memberId: 2, roundNumber: 2 });
    expect(byCode.costliest_blame).toMatchObject({ value: 8000, memberId: 2, roundNumber: 2 });
    expect(byCode.most_painful_near_miss).toMatchObject({ value: 8000, memberId: 2, roundNumber: 2 });
    expect(recs.map((r) => r.code)).toEqual([
      'biggest_win', 'top_ticket_odds', 'top_pick_odds', 'biggest_margin',
      'longest_hit_streak', 'longest_miss_streak', 'costliest_blame', 'most_painful_near_miss',
    ]);
  });

  it('team blame is credited to the team; empty input gives no records', () => {
    const rounds = [mk(1, [['team', 'miss'], ['hit'], ['hit'], ['hit']])];
    const recs = computeRecords(rounds, derive(rounds), IDS);
    expect(recs.find((r) => r.code === 'costliest_blame')).toMatchObject({ memberId: 'team' });
    expect(computeRecords([], derive([]), IDS)).toEqual([]);
  });
});

describe('computeBadges', () => {
  it('sniper counts each streak reaching 5 once; brave, near miss, perfect month', () => {
    const rounds = [
      mk(1, [['hit', 12, 2.1], ['hit'], ['hit'], ['hit']]),
      mk(2, [['hit'], ['hit'], ['hit'], ['hit']]),
      mk(3, [['hit'], ['hit'], ['hit'], ['hit']]),
      mk(4, [['hit'], ['hit'], ['hit'], ['hit']]),
      mk(5, [['hit'], ['hit'], ['hit'], ['hit']]),
      mk(6, [['hit'], ['hit'], ['hit'], ['hit']]), // streak 6: no second sniper
      mk(7, [['miss', 10], ['hit'], ['hit'], ['hit']], { day: '2026-11-01' }),
    ];
    const badges = computeBadges(1, rounds, derive(rounds));
    expect(badges).toEqual([
      { code: 'sniper', count: 1, firstRoundId: rounds[4]!.id, firstRoundNumber: 5 },
      { code: 'brave', count: 1, firstRoundId: rounds[0]!.id, firstRoundNumber: 1 },
      { code: 'perfect_month', count: 1, firstRoundId: rounds[5]!.id, firstRoundNumber: 6 },
      { code: 'near_miss', count: 1, firstRoundId: rounds[6]!.id, firstRoundNumber: 7 },
      { code: 'blame_king', count: 1, firstRoundId: rounds[6]!.id, firstRoundNumber: 7 },
    ]);
  });

  it('ice for a cooldown; blame king only when strictly first', () => {
    const rounds = [
      mk(1, [['miss'], ['hit'], ['hit'], ['hit']]),
      mk(2, [['hit'], ['miss'], ['hit'], ['hit']]),
      mk(3, [['team', 'hit'], ['hit'], ['hit'], ['hit']]),
    ];
    const d = derive(rounds);
    expect(computeBadges(1, rounds, d).map((b) => b.code)).toEqual(['ice']);
    expect(computeBadges(2, rounds, d).map((b) => b.code)).toEqual([]);
  });
});

describe('nearMisses', () => {
  it('counts near misses and the potential win lost when it was the only miss', () => {
    const rounds = [
      mk(1, [['miss', 10], ['hit'], ['hit'], ['hit']], { odds: 10, stake: 500 }),
      mk(2, [['miss', 10], ['miss'], ['hit'], ['hit']]),
      mk(3, [['miss', 5], ['hit'], ['hit'], ['hit']]),
    ];
    expect(nearMisses(1, rounds, derive(rounds))).toEqual({ count: 2, lostPotentialWin: 5000 });
    expect(nearMisses(2, rounds, derive(rounds))).toEqual({ count: 0, lostPotentialWin: 0 });
  });
});
