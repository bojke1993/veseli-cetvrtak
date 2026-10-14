import { describe, expect, it } from 'vitest';
import { computeDerived } from '../../src/domain/derived.js';
import type { DerivedRoundInput } from '../../src/domain/derived-types.js';
import type { PickResult, RoundStatus } from '../../src/db/schema.js';

type R = PickResult | null;
/** Slot spec per member 1..4: a result for a personal pick, or ['team', result] for a team pick replacing that member. */
type Slot = R | ['team', R];

let nextId = 100;
function round(number: number, slots: [Slot, Slot, Slot, Slot], opts: { season?: string; status?: RoundStatus } = {}): DerivedRoundInput {
  const picks = slots.map((s, i) => {
    const memberId = i + 1;
    if (Array.isArray(s)) {
      return { slot: memberId, kind: 'team' as const, memberId: null, cooldownForMemberId: memberId, result: s[1] };
    }
    return { slot: memberId, kind: 'personal' as const, memberId, cooldownForMemberId: null, result: s };
  });
  const results = picks.map((p) => p.result);
  const status: RoundStatus =
    opts.status ??
    (results.includes('miss') ? 'lost' : results.every((r) => r === 'void') ? 'void' : 'won');
  return { roundId: nextId++, number, seasonCode: opts.season ?? 'E2026', status, picks };
}

describe('computeDerived', () => {
  it('REQ-23.6 #1: five misses → cooldown next round → streak reset → miss again = 1', () => {
    const rounds: DerivedRoundInput[] = [];
    for (let n = 1; n <= 5; n++) rounds.push(round(n, ['miss', 'hit', 'hit', 'hit']));
    rounds.push(round(6, [['team', 'hit'], 'hit', 'hit', 'hit']));
    rounds.push(round(7, ['miss', 'hit', 'hit', 'hit']));
    const d = computeDerived(rounds);
    const r5 = d.rounds.get(rounds[4]!.roundId)!;
    const r6 = d.rounds.get(rounds[5]!.roundId)!;
    const r7 = d.rounds.get(rounds[6]!.roundId)!;
    expect(r5.after[1]!.missStreak).toBe(5);
    expect(r6.expectedCooldownMemberIds).toEqual([1]);
    expect(r6.cooldownMemberIds).toEqual([1]);
    expect(r6.cooldownInconsistent).toBe(false);
    expect(r6.after[1]!.missStreak).toBe(0);
    expect(r7.expectedCooldownMemberIds).toEqual([]);
    expect(r7.after[1]!.missStreak).toBe(1);
    expect(d.members[1]).toMatchObject({ missStreak: 1, hitStreak: 0, seasonCode: 'E2026' });
    // rounds 1-5 are all lost by member 1 alone → blame
    expect(r5.blame).toBe(1);
  });

  it('REQ-23.6 #2: fire gained at 3, kept on void, not re-counted at 4, lost on miss', () => {
    const rounds = [
      round(1, ['hit', 'hit', 'hit', 'hit']),
      round(2, ['hit', 'hit', 'hit', 'hit']),
      round(3, ['hit', 'miss', 'miss', 'hit']),
      round(4, ['void', 'hit', 'hit', 'hit']),
      round(5, ['hit', 'hit', 'hit', 'hit']),
      round(6, ['miss', 'hit', 'hit', 'hit']),
    ];
    const d = computeDerived(rounds);
    const get = (i: number) => d.rounds.get(rounds[i]!.roundId)!;
    expect(get(2).after[1]).toEqual({ hitStreak: 3, missStreak: 0, hasFire: true });
    expect(get(2).fireChanges).toContainEqual({ memberId: 1, change: 'gained' });
    expect(get(3).after[1]).toEqual({ hitStreak: 3, missStreak: 0, hasFire: true });
    expect(get(3).fireChanges.filter((c) => c.memberId === 1)).toEqual([]);
    expect(get(4).after[1]).toEqual({ hitStreak: 4, missStreak: 0, hasFire: true });
    expect(get(4).fireChanges.filter((c) => c.memberId === 1)).toEqual([]);
    expect(get(5).after[1]).toEqual({ hitStreak: 0, missStreak: 1, hasFire: false });
    expect(get(5).fireChanges).toContainEqual({ memberId: 1, change: 'lost' });
    const gains = [...d.rounds.values()].flatMap((r) => r.fireChanges).filter((c) => c.memberId === 1 && c.change === 'gained');
    expect(gains).toHaveLength(1);
  });

  it('REQ-23.6 #3: 3/4 where the only miss is a team pick → blame team', () => {
    const rounds = [round(1, [['team', 'miss'], 'hit', 'hit', 'hit'])];
    const d = computeDerived(rounds);
    const r = d.rounds.get(rounds[0]!.roundId)!;
    expect(r.blame).toBe('team');
    // team pick never touches members
    expect(r.after[1]).toEqual({ hitStreak: 0, missStreak: 0, hasFire: false });
    // member 1 on cooldown without reason → inconsistent
    expect(r.cooldownInconsistent).toBe(true);
  });

  it('REQ-23.6 #4: five misses at season end → no cooldown in the first round of the next season', () => {
    const rounds: DerivedRoundInput[] = [];
    for (let n = 1; n <= 5; n++) rounds.push(round(n, ['miss', 'hit', 'hit', 'hit'], { season: 'E2025' }));
    rounds.push(round(6, ['hit', 'hit', 'hit', 'hit'], { season: 'E2026' }));
    const before = computeDerived(rounds.slice(0, 5));
    expect(before.cooldownForNextRound('E2025')).toEqual([1]);
    expect(before.cooldownForNextRound('E2026')).toEqual([]);
    const d = computeDerived(rounds);
    const r6 = d.rounds.get(rounds[5]!.roundId)!;
    expect(r6.expectedCooldownMemberIds).toEqual([]);
    expect(r6.cooldownInconsistent).toBe(false);
    expect(r6.after[1]).toEqual({ hitStreak: 1, missStreak: 0, hasFire: false });
  });

  it('season change resets fire and streaks', () => {
    const rounds = [
      round(1, ['hit', 'hit', 'hit', 'hit'], { season: 'E2025' }),
      round(2, ['hit', 'hit', 'hit', 'hit'], { season: 'E2025' }),
      round(3, ['hit', 'hit', 'hit', 'hit'], { season: 'E2025' }),
      round(4, ['void', 'void', 'void', 'void'], { season: 'E2026' }),
    ];
    const d = computeDerived(rounds);
    expect(d.rounds.get(rounds[2]!.roundId)!.after[2]!.hasFire).toBe(true);
    expect(d.rounds.get(rounds[3]!.roundId)!.after[2]).toEqual({ hitStreak: 0, missStreak: 0, hasFire: false });
    expect(d.members[2]).toEqual({ hitStreak: 0, missStreak: 0, hasFire: false, seasonCode: 'E2026' });
  });

  it('cooldownForNextRound after the last resolved round', () => {
    const rounds: DerivedRoundInput[] = [];
    for (let n = 1; n <= 5; n++) rounds.push(round(n, ['hit', 'miss', 'miss', 'hit']));
    const d = computeDerived(rounds);
    expect(d.cooldownForNextRound('E2026')).toEqual([2, 3]);
    // two misses → no blame
    expect(d.rounds.get(rounds[0]!.roundId)!.blame).toBeNull();
  });

  it('missing cooldown is inconsistent for a locked round, not for an open one', () => {
    const rounds: DerivedRoundInput[] = [];
    for (let n = 1; n <= 5; n++) rounds.push(round(n, ['miss', 'hit', 'hit', 'hit']));
    const open = round(6, [null, null, null, null], { status: 'open' });
    const locked = { ...open, roundId: 999, status: 'locked' as const };
    expect(computeDerived([...rounds, open]).rounds.get(open.roundId)!).toMatchObject({
      expectedCooldownMemberIds: [1],
      cooldownMemberIds: [],
      cooldownInconsistent: false,
      blame: null,
    });
    expect(computeDerived([...rounds, locked]).rounds.get(999)!.cooldownInconsistent).toBe(true);
  });

  it('in-progress round picks already count for streaks; blame waits for resolution', () => {
    const rounds = [
      round(1, ['hit', 'hit', 'hit', 'hit']),
      round(2, ['miss', 'hit', null, null], { status: 'in_progress' }),
    ];
    const d = computeDerived(rounds);
    const r2 = d.rounds.get(rounds[1]!.roundId)!;
    expect(r2.after[1]).toEqual({ hitStreak: 0, missStreak: 1, hasFire: false });
    expect(r2.after[2]!.hitStreak).toBe(2);
    expect(r2.blame).toBeNull();
  });

  it('a lost round with one miss but unresolved picks has no blame', () => {
    const rounds = [round(1, ['miss', 'hit', 'hit', null], { status: 'lost' })];
    expect(computeDerived(rounds).rounds.get(rounds[0]!.roundId)!.blame).toBeNull();
  });

  it('blame with a void pick (2/3 +1)', () => {
    const rounds = [round(1, ['hit', 'void', 'miss', 'hit'])];
    expect(computeDerived(rounds).rounds.get(rounds[0]!.roundId)!.blame).toBe(3);
  });

  it('processes rounds by number regardless of input order and always includes members 1..4', () => {
    const a = round(2, ['miss', 'hit', 'hit', 'hit']);
    const b = round(1, ['hit', 'hit', 'hit', 'hit']);
    const d = computeDerived([a, b]);
    expect(d.members[1]).toMatchObject({ hitStreak: 0, missStreak: 1 });
    const empty = computeDerived([]);
    expect(Object.keys(empty.members)).toEqual(['1', '2', '3', '4']);
    expect(empty.cooldownForNextRound('E2026')).toEqual([]);
  });

  it('full recalculation is deterministic', () => {
    const rounds = [round(1, ['miss', 'hit', 'void', 'hit']), round(2, ['hit', 'miss', 'hit', 'hit'])];
    const x = computeDerived(rounds);
    const y = computeDerived(rounds.map((r) => ({ ...r, picks: [...r.picks].reverse() })));
    expect([...y.rounds.values()]).toEqual([...x.rounds.values()]);
  });
});
