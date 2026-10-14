import { describe, expect, it } from 'vitest';
import {
  directionLabel,
  formatCountdown,
  formatDate,
  formatDateTime,
  formatLine,
  formatMoney,
  formatOdds,
  formatPercent,
  formatTime,
  isValidLine,
  LINE_ERROR,
  lineLabel,
  parseDecimal,
  parseLine,
  plural,
  resultIcon,
  streakText,
  toInputText,
} from './format';

describe('format helpers', () => {
  it('formats money in RSD with Serbian separators', () => {
    expect(formatMoney(1250)).toBe('1.250,00 RSD');
    expect(formatMoney(0)).toBe('0,00 RSD');
    expect(formatMoney(1234567.891)).toBe('1.234.567,89 RSD');
    expect(formatMoney(-500)).toBe('-500,00 RSD');
    expect(formatMoney(null)).toBe('—');
  });

  it('formats days as dd.MM.yyyy.', () => {
    expect(formatDate('2026-10-15')).toBe('15.10.2026.');
    expect(formatDate('2026-01-05')).toBe('05.01.2026.');
    expect(formatDate(null)).toBe('—');
  });

  it('formats instants in Europe/Belgrade, 24h', () => {
    // 18:30 UTC in October (CEST, UTC+2) → 20:30
    expect(formatDateTime('2026-10-15T18:30:00Z')).toBe('15.10.2026. 20:30');
    expect(formatTime('2026-10-15T18:30:00Z')).toBe('20:30');
    // Winter time (CET, UTC+1), crossing midnight
    expect(formatDateTime('2026-12-31T23:15:00Z')).toBe('01.01.2027. 00:15');
    // ISO instant passed to formatDate uses the Belgrade day
    expect(formatDate('2026-10-15T22:30:00Z')).toBe('16.10.2026.');
  });

  it('formats lines, odds and percents with a decimal comma', () => {
    expect(formatLine(14.5)).toBe('14,5');
    expect(formatOdds(2.3)).toBe('2,30');
    expect(formatPercent(45.55)).toBe('45,6%');
    expect(formatPercent(50)).toBe('50%');
    expect(formatPercent(null)).toBe('—');
  });

  it('labels directions and results', () => {
    expect(directionLabel('over')).toBe('Više');
    expect(directionLabel('under')).toBe('Manje');
    expect(lineLabel('over', 14.5)).toBe('više 14,5');
    expect(resultIcon('hit')).toBe('✔');
    expect(resultIcon('miss')).toBe('✘');
    expect(resultIcon('void')).toBe('–');
  });

  it('applies Serbian plural rules', () => {
    const p = (n: number) => plural(n, 'poen', 'poena', 'poena');
    expect(plural(1, 'kolo', 'kola', 'kola')).toBe('kolo');
    expect(plural(21, 'pogodak', 'pogotka', 'pogodaka')).toBe('pogodak');
    expect(plural(11, 'pogodak', 'pogotka', 'pogodaka')).toBe('pogodaka');
    expect(plural(3, 'pogodak', 'pogotka', 'pogodaka')).toBe('pogotka');
    expect(plural(13, 'pogodak', 'pogotka', 'pogodaka')).toBe('pogodaka');
    expect(plural(5, 'pogodak', 'pogotka', 'pogodaka')).toBe('pogodaka');
    expect(p(1)).toBe('poen');
    expect(streakText(3)).toBe('3 pogotka zaredom');
    expect(streakText(-5)).toBe('5 promašaja zaredom');
    expect(streakText(0)).toBe('bez niza');
  });

  it('formats countdowns', () => {
    expect(formatCountdown(45_000)).toBe('45 s');
    expect(formatCountdown(12 * 60_000)).toBe('12 min');
    expect(formatCountdown(65 * 60_000)).toBe('1 h 05 min');
    expect(formatCountdown(26 * 3600_000)).toBe('1 d 2 h');
  });
});

describe('decimal parsing', () => {
  it('accepts comma and dot decimals', () => {
    expect(parseDecimal('14,5')).toBe(14.5);
    expect(parseDecimal('14.5')).toBe(14.5);
    expect(parseDecimal(' 2,35 ')).toBe(2.35);
    expect(parseDecimal('500')).toBe(500);
  });

  it('handles thousands separators', () => {
    expect(parseDecimal('1.250,50')).toBe(1250.5);
    expect(parseDecimal('1.250.000')).toBe(1250000);
    expect(parseDecimal('1 250,00')).toBe(1250);
  });

  it('rejects garbage', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal('14,5x')).toBeNull();
  });

  it('validates x,5 lines with the server message', () => {
    expect(isValidLine(14.5)).toBe(true);
    expect(isValidLine(0.5)).toBe(true);
    expect(isValidLine(15)).toBe(false);
    expect(isValidLine(-1.5)).toBe(false);
    expect(parseLine('14,5')).toEqual({ value: 14.5 });
    expect(parseLine('15')).toEqual({ error: LINE_ERROR });
    expect(LINE_ERROR).toBe('Dozvoljene su samo granice x,5');
    expect(toInputText(14.5)).toBe('14,5');
    expect(toInputText(2.3, 2)).toBe('2,30');
  });
});
