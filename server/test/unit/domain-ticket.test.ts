import { describe, expect, it } from 'vitest';
import { computeActualWin, potentialWin, ticketOutcome } from '../../src/domain/ticket.js';

describe('ticketOutcome', () => {
  it('4/4 won', () => {
    expect(ticketOutcome(['hit', 'hit', 'hit', 'hit'])).toEqual({
      status: 'won', hits: 4, misses: 0, voids: 0, resolved: true, label: '4/4',
    });
  });
  it('3/4 lost', () => {
    expect(ticketOutcome(['hit', 'miss', 'hit', 'hit'])).toMatchObject({ status: 'lost', label: '3/4' });
  });
  it('lost early while others pending, no label', () => {
    expect(ticketOutcome(['miss', null, null, 'hit'])).toEqual({
      status: 'lost', hits: 1, misses: 1, voids: 0, resolved: false, label: null,
    });
  });
  it('pending without a miss', () => {
    expect(ticketOutcome(['hit', null, 'hit', 'hit'])).toMatchObject({ status: 'pending', label: null, resolved: false });
  });
  it('voids in label', () => {
    expect(ticketOutcome(['hit', 'void', 'hit', 'hit'])).toMatchObject({ status: 'won', label: '3/3 (+1 poništen)' });
    expect(ticketOutcome(['hit', 'void', 'void', 'hit'])).toMatchObject({ status: 'won', label: '2/2 (+2 poništena)' });
    expect(ticketOutcome(['miss', 'void', 'hit', 'hit'])).toMatchObject({ status: 'lost', label: '2/3 (+1 poništen)' });
  });
  it('all void', () => {
    expect(ticketOutcome(['void', 'void', 'void', 'void'])).toMatchObject({ status: 'void', label: '0/0 (+4 poništena)' });
  });
  it('0/4', () => {
    expect(ticketOutcome(['miss', 'miss', 'miss', 'miss'])).toMatchObject({ status: 'lost', label: '0/4', misses: 4 });
  });
  it('empty is pending', () => {
    expect(ticketOutcome([]).status).toBe('pending');
  });
});

describe('potentialWin', () => {
  it('rounds to 2 decimals', () => {
    expect(potentialWin(1000, 12.37)).toBe(12370);
    expect(potentialWin(333.33, 3.33)).toBe(1109.99);
  });
});

describe('computeActualWin', () => {
  type R = 'hit' | 'miss' | 'void' | null;
  const picks = (r: R[], odds: Array<number | null>) => r.map((result, i) => ({ result, odds: odds[i] ?? null }));
  it('lost → 0, void → stake, pending → null', () => {
    expect(computeActualWin({ status: 'lost', stake: 1000, totalOdds: 10, picks: [] })).toEqual({ amount: 0, provisional: false });
    expect(computeActualWin({ status: 'void', stake: 1000, totalOdds: 10, picks: [] })).toEqual({ amount: 1000, provisional: false });
    expect(computeActualWin({ status: 'pending', stake: 1000, totalOdds: 10, picks: [] })).toEqual({ amount: null, provisional: false });
  });
  it('won without voids = potential win', () => {
    expect(
      computeActualWin({ status: 'won', stake: 1000, totalOdds: 12.5, picks: picks(['hit', 'hit', 'hit', 'hit'], []) }),
    ).toEqual({ amount: 12500, provisional: false });
  });
  it('won with voids and known odds divides by the void odds', () => {
    const r = computeActualWin({
      status: 'won', stake: 1000, totalOdds: 12, picks: picks(['hit', 'void', 'hit', 'void'], [1.8, 1.9, 1.85, 2]),
    });
    expect(r).toEqual({ amount: 3157.89, provisional: false });
  });
  it('won with a void lacking odds is provisional', () => {
    const r = computeActualWin({
      status: 'won', stake: 1000, totalOdds: 12, picks: picks(['hit', 'void', 'hit', 'hit'], [1.8, null, 1.85, 2]),
    });
    expect(r).toEqual({ amount: 12000, provisional: true });
  });
});
