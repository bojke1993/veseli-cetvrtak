/** DECIMAL columns come back from mysql2 as strings; converts to number (null stays null). */
export function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Rounds to 2 decimals (money), avoiding binary artefacts like 1.005 → 1.00. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Rounds to 1 decimal (percentages). */
export function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}
