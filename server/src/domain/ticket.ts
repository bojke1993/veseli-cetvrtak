import type { PickResult } from '../db/schema.js';
import { round2 } from './money.js';

export type TicketStatus = 'won' | 'lost' | 'void' | 'pending';

export interface TicketOutcome {
  status: TicketStatus;
  hits: number;
  misses: number;
  voids: number;
  /** True when every pick has a result. */
  resolved: boolean;
  /** '3/4' or '3/3 (+1 poništen)'; null until all picks are resolved (BR-19). */
  label: string | null;
}

function voidWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'poništen';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'poništena';
  return 'poništenih';
}

/** BR-17, BR-19: ticket status from pick results (null = unresolved). */
export function ticketOutcome(results: Array<PickResult | null>): TicketOutcome {
  let hits = 0;
  let misses = 0;
  let voids = 0;
  let pending = 0;
  for (const r of results) {
    if (r === 'hit') hits++;
    else if (r === 'miss') misses++;
    else if (r === 'void') voids++;
    else pending++;
  }
  const resolved = pending === 0 && results.length > 0;
  let status: TicketStatus;
  if (misses > 0) status = 'lost';
  else if (!resolved) status = 'pending';
  else if (hits === 0) status = 'void';
  else status = 'won';

  let label: string | null = null;
  if (resolved) {
    label = `${hits}/${hits + misses}`;
    if (voids > 0) label += ` (+${voids} ${voidWord(voids)})`;
  }
  return { status, hits, misses, voids, resolved, label };
}

/** BR-11: stake × total odds. */
export function potentialWin(stake: number, totalOdds: number): number {
  return round2(stake * totalOdds);
}

/** BR-18: actual win; `provisional` when voided picks lack individual odds (admin must confirm). */
export function computeActualWin(i: {
  status: TicketStatus;
  stake: number | null;
  totalOdds: number | null;
  picks: Array<{ result: PickResult | null; odds: number | null }>;
}): { amount: number | null; provisional: boolean } {
  switch (i.status) {
    case 'pending':
      return { amount: null, provisional: false };
    case 'lost':
      return { amount: 0, provisional: false };
    case 'void':
      return { amount: i.stake === null ? null : round2(i.stake), provisional: false };
    case 'won': {
      if (i.stake === null || i.totalOdds === null) return { amount: null, provisional: true };
      const full = i.stake * i.totalOdds;
      const voided = i.picks.filter((p) => p.result === 'void');
      if (voided.length === 0) return { amount: round2(full), provisional: false };
      if (voided.every((p) => p.odds !== null && p.odds > 0)) {
        const divisor = voided.reduce((acc, p) => acc * (p.odds as number), 1);
        return { amount: round2(full / divisor), provisional: false };
      }
      return { amount: round2(full), provisional: true };
    }
  }
}
