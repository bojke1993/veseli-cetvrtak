import { describe, expect, it } from 'vitest';
import { isValidLine, liveStatus, resolvePick } from '../../src/domain/pick.js';

describe('isValidLine', () => {
  it('accepts x.5 only', () => {
    expect(isValidLine(0.5)).toBe(true);
    expect(isValidLine(14.5)).toBe(true);
    expect(isValidLine(14)).toBe(false);
    expect(isValidLine(14.4)).toBe(false);
    expect(isValidLine(0)).toBe(false);
    expect(isValidLine(-0.5)).toBe(false);
    expect(isValidLine(Number.NaN)).toBe(false);
  });
});

describe('resolvePick', () => {
  it('over / under', () => {
    expect(resolvePick({ direction: 'over', line: 14.5, points: 15, secondsPlayed: 600 })).toEqual({ result: 'hit', voidReason: null });
    expect(resolvePick({ direction: 'over', line: 14.5, points: 14, secondsPlayed: 600 })).toEqual({ result: 'miss', voidReason: null });
    expect(resolvePick({ direction: 'under', line: 9.5, points: 9, secondsPlayed: 600 })).toEqual({ result: 'hit', voidReason: null });
    expect(resolvePick({ direction: 'under', line: 9.5, points: 10, secondsPlayed: 600 })).toEqual({ result: 'miss', voidReason: null });
  });
  it('DNP is void; one second played resolves normally even with 0 points', () => {
    expect(resolvePick({ direction: 'over', line: 0.5, points: 0, secondsPlayed: 0 })).toEqual({ result: 'void', voidReason: 'dnp' });
    expect(resolvePick({ direction: 'under', line: 0.5, points: 0, secondsPlayed: 1 })).toEqual({ result: 'hit', voidReason: null });
    expect(resolvePick({ direction: 'over', line: 0.5, points: 0, secondsPlayed: 1 })).toEqual({ result: 'miss', voidReason: null });
  });
});

describe('liveStatus', () => {
  const base = {
    direction: 'over' as const,
    line: 14.5,
    gameStatus: 'live' as const,
    points: 12 as number | null,
    secondsPlayed: 300 as number | null,
    result: null,
  };
  it('final results take precedence', () => {
    expect(liveStatus({ ...base, result: 'hit' }).status).toBe('final_hit');
    expect(liveStatus({ ...base, result: 'miss' }).status).toBe('final_miss');
    expect(liveStatus({ ...base, result: 'void' })).toEqual({ status: 'void', pointsNeeded: null });
  });
  it('scheduled game is not started', () => {
    expect(liveStatus({ ...base, gameStatus: 'scheduled', points: null, secondsPlayed: null })).toEqual({ status: 'not_started', pointsNeeded: 15 });
  });
  it('not entered while live with no seconds', () => {
    expect(liveStatus({ ...base, points: 0, secondsPlayed: 0 }).status).toBe('not_entered');
    expect(liveStatus({ ...base, points: null, secondsPlayed: null }).status).toBe('not_entered');
  });
  it('over: failing with points needed, then sure hit', () => {
    expect(liveStatus(base)).toEqual({ status: 'failing', pointsNeeded: 3 });
    expect(liveStatus({ ...base, points: 14 })).toEqual({ status: 'failing', pointsNeeded: 1 });
    expect(liveStatus({ ...base, points: 15 })).toEqual({ status: 'sure_hit', pointsNeeded: null });
  });
  it('under: passing, then sure miss', () => {
    expect(liveStatus({ ...base, direction: 'under' })).toEqual({ status: 'passing', pointsNeeded: null });
    expect(liveStatus({ ...base, direction: 'under', points: 15 })).toEqual({ status: 'sure_miss', pointsNeeded: null });
  });
});
