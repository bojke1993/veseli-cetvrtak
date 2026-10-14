import { DateTime } from 'luxon';

export const TIMEZONE = 'Europe/Belgrade';

/**
 * Euroleague season code for a calendar day (BR-33): a season starts on 1 July,
 * matching the API's `season.startDate` (e.g. E2026 starts 2026-07-01).
 */
export function seasonForDate(day: string): string {
  const d = DateTime.fromISO(day, { zone: TIMEZONE });
  if (!d.isValid) throw new Error(`Invalid day: ${day}`);
  return `E${d.month >= 7 ? d.year : d.year - 1}`;
}

/** '2026/27' for 'E2026'. */
export function seasonName(code: string): string {
  const year = Number.parseInt(code.slice(1), 10);
  return `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
}

export function seasonStartDate(code: string): string {
  return `${code.slice(1)}-07-01`;
}

/** Calendar day (YYYY-MM-DD) in Europe/Belgrade for a UTC instant. */
export function dayInBelgrade(instant: Date): string {
  return DateTime.fromJSDate(instant, { zone: TIMEZONE }).toISODate()!;
}

export function todayInBelgrade(now: Date = new Date()): string {
  return dayInBelgrade(now);
}
