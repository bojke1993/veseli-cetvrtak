import { describe, expect, it } from 'vitest';
import { chancePercent, normalCdf, pickChance, remainingGameShare, ticketChance, type ChanceInput } from '../../src/domain/chance.js';

const base: ChanceInput = {
  direction: 'over',
  line: 12.5,
  status: 'not_started',
  gameStatus: 'scheduled',
  points: null,
  secondsPlayed: null,
  quarter: null,
  clock: null,
  formAveragePoints: 12.5,
  formAverageMinutes: 25,
};

describe('normalCdf', () => {
  it('matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });
});

describe('remainingGameShare', () => {
  it('reads quarter and clock', () => {
    expect(remainingGameShare('1', '10:00')).toBe(1);
    expect(remainingGameShare('2', '05:00')).toBeCloseTo(25 / 40);
    expect(remainingGameShare('4', '00:00')).toBe(0);
    expect(remainingGameShare('OT', '03:00')).toBe(0);
    expect(remainingGameShare(null, null)).toBeNull();
    expect(remainingGameShare('', '00:00')).toBeNull();
  });
});

describe('pickChance (BR-39)', () => {
  it('certain statuses are 0/1, void does not count', () => {
    expect(pickChance({ ...base, status: 'sure_hit' })).toBe(1);
    expect(pickChance({ ...base, status: 'final_hit' })).toBe(1);
    expect(pickChance({ ...base, status: 'sure_miss' })).toBe(0);
    expect(pickChance({ ...base, status: 'final_miss' })).toBe(0);
    expect(pickChance({ ...base, status: 'void' })).toBeNull();
  });

  it('before tip-off: line at the average ≈ 50 %, needs a form', () => {
    expect(pickChance(base)).toBeCloseTo(0.5, 2);
    expect(pickChance({ ...base, line: 8.5 })!).toBeGreaterThan(0.75);
    expect(pickChance({ ...base, direction: 'under', line: 8.5 })!).toBeLessThan(0.25);
    expect(pickChance({ ...base, formAveragePoints: null, formAverageMinutes: null })).toBeNull();
  });

  it('live: more points and less time left move the chance the right way', () => {
    const live = { ...base, status: 'passing' as const, gameStatus: 'live' as const, quarter: '3', clock: '05:00' };
    const behind = pickChance({ ...live, status: 'failing', points: 4, secondsPlayed: 900 })!;
    const ahead = pickChance({ ...live, points: 11, secondsPlayed: 900 })!;
    expect(ahead).toBeGreaterThan(behind);
    const late = pickChance({ ...live, status: 'failing', points: 4, secondsPlayed: 1500, quarter: '4', clock: '01:00' })!;
    expect(late).toBeLessThan(behind);
    expect(late).toBeGreaterThanOrEqual(0.01); // never shows 0 % while undecided
    // under pick that is far below the line late in the game
    expect(pickChance({ ...live, direction: 'under', status: 'passing', points: 4, quarter: '4', clock: '01:00' })!).toBeGreaterThan(0.95);
  });

  it('without a form uses the live rate or a default', () => {
    const c = pickChance({ ...base, formAveragePoints: null, formAverageMinutes: null, status: 'failing', gameStatus: 'live', points: 6, secondsPlayed: 600, quarter: '2', clock: '00:00' });
    expect(c).not.toBeNull();
  });
});

describe('ticketChance', () => {
  it('multiplies the counted picks and skips void ones', () => {
    expect(ticketChance([0.5, 1, 0.5, null], ['passing', 'sure_hit', 'failing', 'void'])).toBeCloseTo(0.25);
    expect(ticketChance([0.5, null], ['passing', 'not_started'])).toBeNull();
    expect(ticketChance([1, 0], ['final_hit', 'sure_miss'])).toBe(0);
  });

  it('percent rounding keeps 0/100 for certain outcomes only', () => {
    expect(chancePercent(1)).toBe(100);
    expect(chancePercent(0)).toBe(0);
    expect(chancePercent(0.999)).toBe(99);
    expect(chancePercent(0.001)).toBe(1);
    expect(chancePercent(0.347)).toBe(35);
    expect(chancePercent(null)).toBeNull();
  });
});
