import type { Direction, GameStatus, LiveStatus, PickResult, RoundStatus } from '@api';

export const LOCALE = 'sr-Latn-RS';
export const TIME_ZONE = 'Europe/Belgrade';

const fmtCache = new Map<string, Intl.NumberFormat>();
function numberFormat(min: number, max: number, grouping = true): Intl.NumberFormat {
  const key = `${min}|${max}|${grouping}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      useGrouping: grouping ? 'always' : false,
    });
    fmtCache.set(key, f);
  }
  return f;
}

const DASH = '—';

function isNum(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** 1250 → "1.250,00 RSD" */
export function formatMoney(n: number | null | undefined): string {
  if (!isNum(n)) return DASH;
  return `${numberFormat(2, 2).format(n)} RSD`;
}

/** Generic number with fixed decimals: formatNumber(2.5, 2) → "2,50". */
export function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (!isNum(n)) return DASH;
  return numberFormat(decimals, decimals).format(n);
}

/** Odds: 2.35 → "2,35" */
export function formatOdds(n: number | null | undefined): string {
  if (!isNum(n)) return DASH;
  return numberFormat(2, 2, false).format(n);
}

/** Line: 14.5 → "14,5" */
export function formatLine(n: number | null | undefined): string {
  if (!isNum(n)) return DASH;
  return numberFormat(1, 1, false).format(n);
}

/** Percent given as 0–100: 45.55 → "45,6%" */
export function formatPercent(n: number | null | undefined, decimals = 1): string {
  if (!isNum(n)) return DASH;
  return `${numberFormat(0, decimals, false).format(n)}%`;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function belgradeParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const out: Record<string, string> = {};
  for (const p of parts) out[p.type] = p.value;
  return out;
}

/** '2026-10-15' (or an ISO instant) → "15.10.2026." */
export function formatDate(value: string | null | undefined): string {
  if (!value) return DASH;
  const m = DAY_RE.exec(value);
  if (m) return `${m[3]}.${m[2]}.${m[1]}.`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  const p = belgradeParts(d);
  return `${p.day}.${p.month}.${p.year}.`;
}

/** '2026-10-15' → "15.10." */
export function formatShortDate(value: string | null | undefined): string {
  if (!value) return DASH;
  const full = formatDate(value);
  return full === DASH ? full : full.slice(0, 6);
}

/** ISO instant → "20:30" (Europe/Belgrade, 24h). */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  const p = belgradeParts(d);
  return `${p.hour}:${p.minute}`;
}

/** ISO instant → "15.10.2026. 20:30" (Europe/Belgrade, 24h). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  const p = belgradeParts(d);
  return `${p.day}.${p.month}.${p.year}. ${p.hour}:${p.minute}`;
}

/** Today's day in Belgrade as 'YYYY-MM-DD'. */
export function todayBelgrade(now = new Date()): string {
  const p = belgradeParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Seconds → "23:05" */
export function formatSecondsPlayed(sec: number | null | undefined): string {
  if (!isNum(sec)) return DASH;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Remaining milliseconds → "2 d 3 h", "1 h 05 min", "12 min", "45 s". */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0 min';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

// ---------- Labels ----------

export function directionLabel(d: Direction | null | undefined): string {
  if (d === 'over') return 'Više';
  if (d === 'under') return 'Manje';
  return DASH;
}

/** "više 14,5" */
export function lineLabel(d: Direction | null | undefined, line: number | null | undefined): string {
  if (!d || !isNum(line)) return DASH;
  return `${directionLabel(d).toLowerCase()} ${formatLine(line)}`;
}

export const RESULT_ICON: Record<PickResult, string> = { hit: '✔', miss: '✘', void: '–' };
export const RESULT_LABEL: Record<PickResult, string> = { hit: 'Pogođen', miss: 'Promašen', void: 'Poništen' };

export function resultIcon(r: PickResult | null | undefined): string {
  return r ? RESULT_ICON[r] : '·';
}
export function resultLabel(r: PickResult | null | undefined): string {
  return r ? RESULT_LABEL[r] : 'Nerazrešen';
}

export const ROUND_STATUS_LABEL: Record<RoundStatus, string> = {
  open: 'Otvoren',
  locked: 'Zaključen',
  in_progress: 'U toku',
  won: 'Dobitan',
  lost: 'Gubitan',
  void: 'Poništen',
};

export const GAME_STATUS_LABEL: Record<GameStatus, string> = {
  scheduled: 'Zakazana',
  live: 'U toku',
  final: 'Završena',
  postponed: 'Odložena',
  cancelled: 'Otkazana',
};

export interface LiveStatusMeta {
  label: string;
  icon: string;
  tone: 'neutral' | 'good' | 'bad' | 'great' | 'awful' | 'muted';
}

export const LIVE_STATUS_META: Record<LiveStatus, LiveStatusMeta> = {
  not_started: { label: 'Nije počelo', icon: '◷', tone: 'neutral' },
  passing: { label: 'U prolazu', icon: '▲', tone: 'good' },
  failing: { label: 'Nije u prolazu', icon: '▼', tone: 'bad' },
  sure_hit: { label: 'Sigurno pogođen', icon: '✔', tone: 'great' },
  sure_miss: { label: 'Sigurno promašen', icon: '✘', tone: 'awful' },
  not_entered: { label: 'Nije ušao u igru', icon: '⏸', tone: 'muted' },
  final_hit: { label: 'Pogođen', icon: '✔', tone: 'great' },
  final_miss: { label: 'Promašen', icon: '✘', tone: 'awful' },
  void: { label: 'Poništen', icon: '–', tone: 'muted' },
};

export const RESOLUTION_LABEL = { auto: 'automatski', manual: 'ručno', import: 'uvezeno' } as const;
export const VOID_REASON_LABEL = { dnp: 'nije zaigrao (DNP)', game_not_played: 'utakmica nije odigrana' } as const;

// ---------- Plurals ----------

/** Serbian plural form: plural(1,'poen','poena','poena'), plural(3, …) → few, plural(5, …) → many. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** "3 poena", "1 poen", "21 poen" */
export function pointsText(n: number): string {
  return `${n} ${plural(n, 'poen', 'poena', 'poena')}`;
}

/** Streak: +3 → "3 pogotka zaredom", -2 → "2 promašaja zaredom", 0 → "bez niza". */
export function streakText(streak: number): string {
  if (streak > 0) return `${streak} ${plural(streak, 'pogodak', 'pogotka', 'pogodaka')} zaredom`;
  if (streak < 0) {
    const n = -streak;
    return `${n} ${plural(n, 'promašaj', 'promašaja', 'promašaja')} zaredom`;
  }
  return 'bez niza';
}

/** Short streak: "+3" / "−2" / "0" */
export function streakShort(streak: number): string {
  if (streak > 0) return `+${streak}`;
  if (streak < 0) return `−${-streak}`;
  return '0';
}

// ---------- Parsing user input ----------

/**
 * Parses a decimal typed by the user; accepts comma or dot as decimal separator
 * and dots/spaces as thousands separators when both are present ("1.250,50").
 * Returns null for empty or invalid input.
 */
export function parseDecimal(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/\s| /g, '');
  if (!s) return null;
  const hasComma = s.includes(',');
  const dots = (s.match(/\./g) ?? []).length;
  if (hasComma && dots > 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    if ((s.match(/,/g) ?? []).length > 1) return null;
    s = s.replace(',', '.');
  } else if (dots > 1) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
    s = s.replace(/\./g, '');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s) && !/^-?\.\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const LINE_ERROR = 'Dozvoljene su samo granice x,5';

/** Valid line: > 0 and of the form x,5. */
export function isValidLine(n: number | null): n is number {
  return n !== null && n > 0 && Math.abs((n % 1) - 0.5) < 1e-9;
}

/** Validates line text; returns the number or an error message. */
export function parseLine(input: string): { value: number } | { error: string } {
  const n = parseDecimal(input);
  if (n === null) return { error: 'Unesite broj, npr. 14,5' };
  if (!isValidLine(n)) return { error: LINE_ERROR };
  return { value: n };
}

/** Number to the text shown in an input field: 14.5 → "14,5". */
export function toInputText(n: number | null | undefined, decimals?: number): string {
  if (!isNum(n)) return '';
  const s = decimals === undefined ? String(n) : n.toFixed(decimals);
  return s.replace('.', ',');
}

export function initials(name: string): string {
  return name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function roundToCents(n: number): number {
  return Math.round(n * 100) / 100;
}
