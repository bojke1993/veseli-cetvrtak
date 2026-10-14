import { describe, expect, it } from 'vitest';
import { cellNum } from '../../src/services/import.js';

describe('import cellNum (sr-Latn numbers)', () => {
  it('parses decimals and Serbian thousand separators', () => {
    expect(cellNum('14,5')).toBe(14.5);
    expect(cellNum('14.5')).toBe(14.5);
    expect(cellNum('12.40')).toBe(12.4);
    expect(cellNum('1.250,50')).toBe(1250.5);
    expect(cellNum('1.000')).toBe(1000);
    expect(cellNum('2.500 RSD')).toBe(2500);
    expect(cellNum('2.500.000')).toBe(2_500_000);
    expect(cellNum(500)).toBe(500);
    expect(cellNum('')).toBeNull();
    expect(cellNum('abc')).toBeNull();
  });
});
