/**
 * BR-39 / FR-30: rough chance that a pick (and the ticket) passes. Information only — never used
 * for settlement. Model: expected final points = current points + scoring rate × expected remaining
 * minutes; spread σ = 1.3·√(expected remaining points); normal approximation against the x.5 line.
 */
import type { Direction, GameStatus, LiveStatus } from '../api-types.js';

export const GAME_MINUTES = 40;
const QUARTER_MINUTES = 10;
/** Used when the player has no form yet. */
export const DEFAULT_MINUTES = 25;
export const DEFAULT_POINTS_PER_MINUTE = 0.4;
const SPREAD = 1.3;
/** Uncertain picks never show 0 % or 100 %. */
const MIN_CHANCE = 0.01;
const MAX_CHANCE = 0.99;

export interface ChanceInput {
  direction: Direction;
  line: number;
  status: LiveStatus;
  gameStatus: GameStatus;
  points: number | null;
  secondsPlayed: number | null;
  /** Game clock: quarter ('1'..'4', '5'+ or 'OT' = overtime) and time left in it ('MM:SS'). */
  quarter: string | null;
  clock: string | null;
  /** From the player form (FR-29); null when unknown. */
  formAveragePoints: number | null;
  formAverageMinutes: number | null;
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Share of regulation time still to play, 0..1; null when the clock cannot be read. */
export function remainingGameShare(quarter: string | null, clock: string | null): number | null {
  if (!quarter) return null;
  if (/ot/i.test(quarter)) return 0;
  const q = Number.parseInt(quarter.replace(/\D/g, ''), 10);
  if (!Number.isFinite(q) || q < 1) return null;
  if (q > 4) return 0;
  const m = clock?.match(/^(\d{1,2}):(\d{2})/);
  const left = m ? Number(m[1]) + Number(m[2]) / 60 : QUARTER_MINUTES / 2;
  const remaining = (4 - q) * QUARTER_MINUTES + Math.min(QUARTER_MINUTES, left);
  return Math.max(0, Math.min(1, remaining / GAME_MINUTES));
}

/** Chance 0..1 that the pick passes; null when it does not count (void) or cannot be estimated. */
export function pickChance(i: ChanceInput): number | null {
  switch (i.status) {
    case 'final_hit':
    case 'sure_hit':
      return 1;
    case 'final_miss':
    case 'sure_miss':
      return 0;
    case 'void':
      return null;
    default:
      break;
  }
  if (i.gameStatus === 'postponed' || i.gameStatus === 'cancelled') return null;

  const minutes = i.formAverageMinutes ?? DEFAULT_MINUTES;
  const rate =
    i.formAveragePoints !== null && i.formAverageMinutes
      ? i.formAveragePoints / i.formAverageMinutes
      : i.secondsPlayed && i.secondsPlayed >= 300 && i.points !== null
        ? i.points / (i.secondsPlayed / 60)
        : DEFAULT_POINTS_PER_MINUTE;

  let share: number;
  if (i.status === 'not_started' || i.gameStatus === 'scheduled') {
    if (i.formAveragePoints === null) return null; // nothing to base a guess on
    share = 1;
  } else {
    share = remainingGameShare(i.quarter, i.clock) ?? 0.5;
  }
  const points = i.points ?? 0;
  const expectedRest = Math.max(0, rate * minutes * share);
  const mean = points + expectedRest;
  const sigma = SPREAD * Math.sqrt(Math.max(1, expectedRest));
  const below = normalCdf((i.line - mean) / sigma); // P(final < line)
  const p = i.direction === 'over' ? 1 - below : below;
  return Math.min(MAX_CHANCE, Math.max(MIN_CHANCE, p));
}

/** Product of the pick chances (picks treated as independent); void picks are skipped. */
export function ticketChance(chances: Array<number | null>, statuses: LiveStatus[]): number | null {
  let p = 1;
  for (let k = 0; k < chances.length; k++) {
    if (statuses[k] === 'void') continue;
    const c = chances[k];
    if (c === null || c === undefined) return null;
    p *= c;
  }
  return p;
}

/** Display rounding: whole percent, never 0/100 unless certain. */
export function chancePercent(p: number | null): number | null {
  if (p === null) return null;
  if (p === 0 || p === 1) return p * 100;
  return Math.min(99, Math.max(1, Math.round(p * 100)));
}
