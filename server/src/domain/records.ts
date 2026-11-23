/**
 * BR-38 / FR-28: records ("Kuća slavnih"), member badges and "near misses" (za dlaku).
 * Pure functions over resolved rounds (ascending by number) and the derived state.
 */
import type { DerivedState } from './derived-types.js';
import { round2 } from './money.js';

export interface RecordPick {
  kind: 'personal' | 'team';
  memberId: number | null;
  playerName: string | null;
  line: number | null;
  odds: number | null;
  finalPoints: number | null;
  result: 'hit' | 'miss' | 'void' | null;
}

export interface RecordRound {
  id: number;
  number: number;
  gameDay: string;
  seasonCode: string;
  status: 'won' | 'lost' | 'void';
  stake: number;
  totalOdds: number | null;
  /** Amount won (void round = stake). */
  won: number;
  picks: RecordPick[];
}

export type RecordCode =
  | 'biggest_win'
  | 'top_ticket_odds'
  | 'top_pick_odds'
  | 'biggest_margin'
  | 'longest_hit_streak'
  | 'longest_miss_streak'
  | 'costliest_blame'
  | 'most_painful_near_miss';

export interface TeamRecord {
  code: RecordCode;
  value: number;
  memberId: number | 'team' | null;
  roundId: number;
  roundNumber: number;
  playerName: string | null;
}

export type BadgeCode = 'sniper' | 'brave' | 'near_miss' | 'ice' | 'blame_king' | 'perfect_month';

export interface Badge {
  code: BadgeCode;
  count: number;
  firstRoundId: number;
  firstRoundNumber: number;
}

export interface NearMissStats {
  count: number;
  /** Potential win of 3/4 tickets whose only miss was this member's near miss. */
  lostPotentialWin: number;
}

export const SNIPER_STREAK = 5;
export const BRAVE_ODDS = 2;
export const PERFECT_MONTH_MIN_HITS = 3;

/** Missed by exactly half a point (lines are always x,5). */
export function isNearMiss(p: Pick<RecordPick, 'result' | 'line' | 'finalPoints'>): boolean {
  return p.result === 'miss' && p.line !== null && p.finalPoints !== null && Math.abs(p.finalPoints - p.line) === 0.5;
}

function potentialWin(r: RecordRound): number {
  return r.totalOdds !== null ? round2(r.stake * r.totalOdds) : 0;
}

/** The single missed pick of a 3/4 ticket (blame round), if any. */
function soleMiss(r: RecordRound, derived: DerivedState): RecordPick | null {
  const blame = derived.rounds.get(r.id)?.blame ?? null;
  if (blame === null) return null;
  return r.picks.find((p) => p.result === 'miss') ?? null;
}

function owner(p: RecordPick): number | 'team' | null {
  return p.kind === 'team' ? 'team' : p.memberId;
}

/** Records for the given rounds; ties keep the earlier record. */
export function computeRecords(rounds: RecordRound[], derived: DerivedState, memberIds: number[]): TeamRecord[] {
  const best = new Map<RecordCode, TeamRecord>();
  const offer = (rec: TeamRecord): void => {
    const cur = best.get(rec.code);
    if (rec.value > 0 && (!cur || rec.value > cur.value)) best.set(rec.code, rec);
  };
  const at = (r: RecordRound) => ({ roundId: r.id, roundNumber: r.number });

  for (const r of rounds) {
    if (r.status === 'won') {
      offer({ code: 'biggest_win', value: round2(r.won), memberId: null, playerName: null, ...at(r) });
      if (r.totalOdds !== null) offer({ code: 'top_ticket_odds', value: r.totalOdds, memberId: null, playerName: null, ...at(r) });
    }
    for (const p of r.picks) {
      if (p.kind !== 'personal' || p.result !== 'hit') continue;
      if (p.odds !== null) {
        offer({ code: 'top_pick_odds', value: p.odds, memberId: p.memberId, playerName: p.playerName, ...at(r) });
      }
      if (p.finalPoints !== null && p.line !== null) {
        const margin = Math.abs(p.finalPoints - p.line);
        offer({ code: 'biggest_margin', value: margin, memberId: p.memberId, playerName: p.playerName, ...at(r) });
      }
    }
    const d = derived.rounds.get(r.id);
    if (d) {
      for (const id of memberIds) {
        const after = d.after[id];
        if (!after) continue;
        offer({ code: 'longest_hit_streak', value: after.hitStreak, memberId: id, playerName: null, ...at(r) });
        offer({ code: 'longest_miss_streak', value: after.missStreak, memberId: id, playerName: null, ...at(r) });
      }
    }
    const miss = soleMiss(r, derived);
    if (miss) {
      const win = potentialWin(r);
      offer({ code: 'costliest_blame', value: win, memberId: owner(miss), playerName: miss.playerName, ...at(r) });
      if (isNearMiss(miss)) {
        offer({ code: 'most_painful_near_miss', value: win, memberId: owner(miss), playerName: miss.playerName, ...at(r) });
      }
    }
  }

  const order: RecordCode[] = [
    'biggest_win',
    'top_ticket_odds',
    'top_pick_odds',
    'biggest_margin',
    'longest_hit_streak',
    'longest_miss_streak',
    'costliest_blame',
    'most_painful_near_miss',
  ];
  return order.flatMap((code) => (best.has(code) ? [best.get(code)!] : []));
}

/** Badges earned by one member in the given rounds (BR-38), in a fixed order. */
export function computeBadges(memberId: number, rounds: RecordRound[], derived: DerivedState): Badge[] {
  const earned = new Map<BadgeCode, Badge>();
  const earn = (code: BadgeCode, r: { id: number; number: number }): void => {
    const cur = earned.get(code);
    if (cur) cur.count++;
    else earned.set(code, { code, count: 1, firstRoundId: r.id, firstRoundNumber: r.number });
  };

  const months = new Map<string, { hits: number; misses: number; last: RecordRound }>();
  const blamesBySeason = new Map<string, { counts: Map<number | 'team', number>; last: Map<number | 'team', RecordRound> }>();

  for (const r of rounds) {
    const d = derived.rounds.get(r.id);
    const mine = r.picks.filter((p) => p.kind === 'personal' && p.memberId === memberId);
    for (const p of mine) {
      if (p.result === 'hit') {
        if (d?.after[memberId]?.hitStreak === SNIPER_STREAK) earn('sniper', r);
        if (p.odds !== null && p.odds >= BRAVE_ODDS) earn('brave', r);
      }
      if (isNearMiss(p)) earn('near_miss', r);
      if (p.result === 'hit' || p.result === 'miss') {
        const key = r.gameDay.slice(0, 7);
        const m = months.get(key) ?? { hits: 0, misses: 0, last: r };
        if (p.result === 'hit') m.hits++;
        else m.misses++;
        m.last = r;
        months.set(key, m);
      }
    }
    if (d?.cooldownMemberIds.includes(memberId)) earn('ice', r);
    if (d && d.blame !== null) {
      const s = blamesBySeason.get(r.seasonCode) ?? { counts: new Map(), last: new Map() };
      s.counts.set(d.blame, (s.counts.get(d.blame) ?? 0) + 1);
      s.last.set(d.blame, r);
      blamesBySeason.set(r.seasonCode, s);
    }
  }

  for (const m of months.values()) {
    if (m.misses === 0 && m.hits >= PERFECT_MONTH_MIN_HITS) earn('perfect_month', m.last);
  }
  for (const s of blamesBySeason.values()) {
    const mineCount = s.counts.get(memberId) ?? 0;
    if (mineCount === 0) continue;
    const others = [...s.counts.entries()].filter(([k]) => k !== memberId && k !== 'team').map(([, v]) => v);
    if (others.every((v) => v < mineCount)) earn('blame_king', s.last.get(memberId)!);
  }

  const order: BadgeCode[] = ['sniper', 'brave', 'perfect_month', 'near_miss', 'ice', 'blame_king'];
  return order.flatMap((code) => (earned.has(code) ? [earned.get(code)!] : []));
}

export function nearMisses(memberId: number, rounds: RecordRound[], derived: DerivedState): NearMissStats {
  let count = 0;
  let lost = 0;
  for (const r of rounds) {
    for (const p of r.picks) {
      if (p.kind === 'personal' && p.memberId === memberId && isNearMiss(p)) count++;
    }
    const miss = soleMiss(r, derived);
    if (miss && miss.kind === 'personal' && miss.memberId === memberId && isNearMiss(miss)) lost += potentialWin(r);
  }
  return { count, lostPotentialWin: round2(lost) };
}
