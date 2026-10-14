import type { PickKind, PickResult, RoundSource, RoundStatus } from '../db/schema.js';

/** Input to computeDerived(): every round (any status), ordered by `number` ascending. */
export interface DerivedRoundInput {
  roundId: number;
  number: number;
  seasonCode: string;
  status: RoundStatus;
  /** 'import' rounds are never reported as cooldown-inconsistent. Defaults to 'app'. */
  source?: RoundSource;
  picks: Array<{
    slot: number;
    kind: PickKind;
    memberId: number | null;
    cooldownForMemberId: number | null;
    result: PickResult | null;
  }>;
}

export interface MemberState {
  hitStreak: number;
  missStreak: number;
  hasFire: boolean;
}

export interface RoundDerived {
  roundId: number;
  number: number;
  seasonCode: string;
  /** Members whose slot in this round is a team pick (actual composition). */
  cooldownMemberIds: number[];
  /** Members that should be on cooldown according to the rules (BR-21, BR-22, BR-33). */
  expectedCooldownMemberIds: number[];
  /** Actual != expected for a round that is no longer open (BR-30). */
  cooldownInconsistent: boolean;
  /** Only for resolved rounds (won/lost/void): sole miss owner, 'team', or null (BR-25). */
  blame: number | 'team' | null;
  fireChanges: Array<{ memberId: number; change: 'gained' | 'lost' }>;
  /** State of every member after this round's resolved picks are applied. */
  after: Record<number, MemberState>;
}

export interface DerivedState {
  /** Keyed by roundId; contains every round from the input. */
  rounds: Map<number, RoundDerived>;
  /** State after the last processed round (current season only; reset when season changes). */
  members: Record<number, MemberState & { seasonCode: string | null }>;
  /**
   * Members who must be on cooldown in the next round to be opened, given its season.
   * Returns [] when `seasonCode` differs from the last processed round's season (BR-33).
   */
  cooldownForNextRound(seasonCode: string): number[];
}

/** Per-round blame and cooldown info used by stats; see services/stats.ts. */
export type { PickResult };
