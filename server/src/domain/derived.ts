import type { DerivedRoundInput, DerivedState, MemberState, RoundDerived } from './derived-types.js';

/** Miss streak that sends a member to cooldown in the next round (BR-21). */
export const COOLDOWN_MISS_STREAK = 5;
/** Hit streak that lights the fire (BR-23, BR-24). */
export const FIRE_HIT_STREAK = 3;
/** The four fixed members (BR-01). */
export const MEMBER_IDS = [1, 2, 3, 4] as const;

const RESOLVED = new Set(['won', 'lost', 'void']);

export function isResolvedStatus(status: string): boolean {
  return RESOLVED.has(status);
}

function sortedNums(ids: Iterable<number>): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

function sameSet(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Derived state over the whole round history (docs/design.md §5, BR-20…BR-26, BR-30, BR-33).
 * Pure: identical input always yields identical output, so a full recalculation equals
 * any incremental one (REQ-23.4).
 */
export function computeDerived(input: DerivedRoundInput[]): DerivedState {
  const rounds = [...input].sort((a, b) => a.number - b.number);

  const memberIds = new Set<number>(MEMBER_IDS);
  for (const r of rounds) {
    for (const p of r.picks) {
      if (p.memberId !== null) memberIds.add(p.memberId);
      if (p.cooldownForMemberId !== null) memberIds.add(p.cooldownForMemberId);
    }
  }
  const ids = sortedNums(memberIds);

  const fresh = (): Record<number, MemberState> => {
    const s: Record<number, MemberState> = {};
    for (const id of ids) s[id] = { hitStreak: 0, missStreak: 0, hasFire: false };
    return s;
  };

  let state = fresh();
  let season: string | null = null;
  const out = new Map<number, RoundDerived>();

  for (const r of rounds) {
    // BR-33: a new season resets streaks, fire and any scheduled cooldown.
    if (season !== r.seasonCode) {
      state = fresh();
      season = r.seasonCode;
    }

    const expected = ids.filter((id) => state[id]!.missStreak >= COOLDOWN_MISS_STREAK);
    const actual = sortedNums(
      r.picks.filter((p) => p.kind === 'team' && p.cooldownForMemberId !== null).map((p) => p.cooldownForMemberId!),
    );
    const cooldownSet = new Set(actual);

    const fireChanges: RoundDerived['fireChanges'] = [];
    const personal = r.picks
      .filter((p) => p.kind === 'personal' && p.memberId !== null && p.result !== null)
      .sort((a, b) => a.slot - b.slot);
    for (const p of personal) {
      const id = p.memberId!;
      if (cooldownSet.has(id)) continue; // a cooldown round never changes streaks (BR-20)
      const m = state[id]!;
      if (p.result === 'hit') {
        m.hitStreak += 1;
        m.missStreak = 0;
        if (m.hitStreak === FIRE_HIT_STREAK) {
          m.hasFire = true;
          fireChanges.push({ memberId: id, change: 'gained' });
        }
      } else if (p.result === 'miss') {
        m.missStreak += 1;
        m.hitStreak = 0;
        if (m.hasFire) {
          m.hasFire = false;
          fireChanges.push({ memberId: id, change: 'lost' });
        }
      }
      // void: no change (BR-20, BR-23)
    }

    const resolved = isResolvedStatus(r.status);
    // BR-22: after a cooldown round ends, the miss streak starts over.
    if (resolved) for (const id of actual) state[id]!.missStreak = 0;

    let blame: RoundDerived['blame'] = null;
    if (resolved && r.picks.length > 0 && r.picks.every((p) => p.result !== null) && r.status === 'lost') {
      const misses = r.picks.filter((p) => p.result === 'miss');
      if (misses.length === 1) {
        const miss = misses[0]!;
        blame = miss.kind === 'team' ? 'team' : miss.memberId;
      }
    }

    const after: Record<number, MemberState> = {};
    for (const id of ids) after[id] = { ...state[id]! };

    out.set(r.roundId, {
      roundId: r.roundId,
      number: r.number,
      seasonCode: r.seasonCode,
      cooldownMemberIds: actual,
      expectedCooldownMemberIds: expected,
      // Imported history is taken as played (the cooldown rule did not exist in 2025/26).
      cooldownInconsistent: r.status !== 'open' && r.source !== 'import' && !sameSet(actual, expected),
      blame,
      fireChanges,
      after,
    });
  }

  const members: DerivedState['members'] = {};
  for (const id of ids) members[id] = { ...state[id]!, seasonCode: season };

  const nextCooldown = ids.filter((id) => state[id]!.missStreak >= COOLDOWN_MISS_STREAK);
  return {
    rounds: out,
    members,
    cooldownForNextRound(seasonCode: string): number[] {
      return season !== null && seasonCode === season ? [...nextCooldown] : [];
    },
  };
}
