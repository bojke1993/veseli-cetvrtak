import { describe, expect, it } from 'vitest';
import { round1, round2, toNum } from '../../src/domain/money.js';
import { normalizeName } from '../../src/domain/text.js';

describe('normalizeName', () => {
  it('strips Serbian diacritics', () => {
    expect(normalizeName('Đorđević')).toBe('djordjevic');
    expect(normalizeName('Saša')).toBe('sasa');
    expect(normalizeName('Čačak Ćuprija Žarko')).toBe('cacak cuprija zarko');
  });
  it('handles generic diacritics, case and whitespace', () => {
    expect(normalizeName('  Nikola   JOKIĆ ')).toBe('nikola jokic');
    expect(normalizeName('Dončić\tLuka')).toBe('doncic luka');
    expect(normalizeName('Müller Gödel Ñoño')).toBe('muller godel nono');
    expect(normalizeName('')).toBe('');
  });
});

describe('money', () => {
  it('toNum converts decimal strings', () => {
    expect(toNum('1250.50')).toBe(1250.5);
    expect(toNum(3)).toBe(3);
    expect(toNum(null)).toBeNull();
    expect(toNum(undefined)).toBeNull();
    expect(toNum('')).toBeNull();
    expect(toNum('abc')).toBeNull();
  });
  it('round2 / round1', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1000 * 12.37)).toBe(12370);
    expect(round1(33.333)).toBe(33.3);
  });
});
