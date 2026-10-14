import { randomBytes } from 'node:crypto';
import * as XLSX from 'xlsx';
import type {
  ImportColumn,
  ImportCommitRequest,
  ImportError,
  ImportPreviewResponse,
  UnmatchedPlayer,
} from '../api-types.js';
import type { Direction, PickResult } from '../db/schema.js';
import type { Deps } from '../deps.js';
import { round2 } from '../domain/money.js';
import { seasonForDate, seasonName, seasonStartDate } from '../domain/season.js';
import { normalizeName } from '../domain/text.js';
import { computeActualWin, ticketOutcome } from '../domain/ticket.js';
import type { SessionMember } from '../http/auth.js';
import { conflict, notFound, unprocessable } from '../http/errors.js';
import { writeAudit } from './audit.js';
import { isMoney } from './dto.js';
import { playerCandidates } from './players.js';
import { MAX_AMOUNT, MAX_ODDS, MAX_STAKE } from './rounds.js';

export const IMPORT_COLUMNS: ImportColumn[] = [
  'kolo', 'datum', 'clan', 'umesto', 'igrac', 'tim', 'granica',
  'tip', 'poeni', 'ishod', 'uplata', 'kvota', 'uplatio', 'dobitak',
];
const REQUIRED: ImportColumn[] = ['kolo', 'datum', 'clan', 'igrac', 'ishod', 'uplata'];
const ALIASES: Record<ImportColumn, string[]> = {
  kolo: ['kolo', 'broj kola', 'br kola', 'br. kola'],
  datum: ['datum', 'dan', 'dan kola'],
  clan: ['clan', 'ime clana'],
  umesto: ['umesto', 'umesto clana'],
  igrac: ['igrac', 'ime igraca'],
  tim: ['tim', 'klub'],
  granica: ['granica', 'linija'],
  tip: ['tip', 'smer'],
  poeni: ['poeni', 'konacni poeni'],
  ishod: ['ishod', 'rezultat'],
  uplata: ['uplata', 'ulog'],
  kvota: ['kvota', 'ukupna kvota'],
  uplatio: ['uplatio', 'uplatilac'],
  dobitak: ['dobitak', 'stvarni dobitak'],
};
const WARNING_PREFIX = 'Upozorenje: ';
export const TOKEN_TTL_MS = 3_600_000;

// ---------- uploaded files kept for commit ----------

const uploads = new Map<string, { buffer: Buffer; expiresAt: number }>();

function storeUpload(buffer: Buffer, now: number): string {
  for (const [k, v] of uploads) if (v.expiresAt <= now) uploads.delete(k);
  const token = randomBytes(16).toString('hex');
  uploads.set(token, { buffer, expiresAt: now + TOKEN_TTL_MS });
  return token;
}

function getUpload(token: string, now: number): Buffer {
  const u = uploads.get(token);
  if (!u || u.expiresAt <= now) {
    uploads.delete(token);
    throw notFound('Otpremljeni fajl je istekao; otpremite ga ponovo.');
  }
  return u.buffer;
}

// ---------- template ----------

export function buildTemplate(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kola');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ---------- parsing ----------

interface Sheet {
  headers: string[];
  rows: unknown[][];
}

function readSheet(buffer: Buffer): Sheet {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false });
  } catch {
    throw unprocessable('Fajl nije ispravan XLS/XLSX.');
  }
  const name = wb.SheetNames[0];
  const sheet = name ? wb.Sheets[name] : undefined;
  if (!sheet) throw unprocessable('Fajl nema nijedan list.');
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  const headers = (aoa[0] ?? []).map((h) => (h === null || h === undefined ? '' : String(h).trim()));
  return { headers, rows: aoa.slice(1) };
}

export function suggestMapping(headers: string[]): Record<ImportColumn, string | null> {
  const norm = headers.map((h) => normalizeName(h).replace(/[_.:]/g, ' ').replace(/\s+/g, ' ').trim());
  const mapping = {} as Record<ImportColumn, string | null>;
  for (const col of IMPORT_COLUMNS) {
    const idx = norm.findIndex((h) => ALIASES[col].includes(h));
    mapping[col] = idx >= 0 ? headers[idx]! : null;
  }
  return mapping;
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export function cellNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, '').replace(/rsd$/i, '');
  if (!s) return null;
  // '1.250,50' → 1250.50 ; '14,5' → 14.5 ; '14.5' → 14.5 ; '1.000' / '2.500.000' → thousands (sr-Latn)
  const thousandsOnly = /^-?\d{1,3}(\.\d{3})+$/.test(s);
  const normalized = s.includes(',') || thousandsOnly ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** dd.MM.yyyy[.], Excel serial or ISO → 'YYYY-MM-DD'. */
export function parseDay(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number') {
    if (v < 1 || v > 100_000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let y: number, m: number, d: number;
  let match = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\.?$/.exec(s);
  if (match) {
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
  } else if ((match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parseDirection(v: string): Direction | null {
  const n = normalizeName(v);
  if (['vise', 'over', 'v', '+'].includes(n)) return 'over';
  if (['manje', 'under', 'm', '-'].includes(n)) return 'under';
  return null;
}

function parseResult(v: string): PickResult | null {
  const n = normalizeName(v);
  if (['pogodak', 'pogodjen', 'hit'].includes(n)) return 'hit';
  if (['promasaj', 'promasen', 'miss'].includes(n)) return 'miss';
  if (['ponisten', 'ponisteno', 'ponistena', 'void'].includes(n)) return 'void';
  return null;
}

interface ImportRow {
  row: number;
  memberId: number | null;
  cooldownFor: number | null;
  playerName: string;
  club: string | null;
  line: number | null;
  direction: Direction | null;
  points: number | null;
  result: PickResult;
}

interface ImportRound {
  fileNumber: number;
  day: string;
  rows: ImportRow[];
  stake: number;
  totalOdds: number | null;
  payer: number | null;
  actualWin: number | null;
}

interface Parsed {
  headers: string[];
  mapping: Record<ImportColumn, string | null>;
  rounds: ImportRound[];
  errors: ImportError[];
  playerNames: Array<{ name: string; club: string | null }>;
}

async function parseImport(deps: Deps, buffer: Buffer, mappingIn: Partial<Record<ImportColumn, string | null>> | null): Promise<Parsed> {
  const sheet = readSheet(buffer);
  const suggested = suggestMapping(sheet.headers);
  const mapping = { ...suggested };
  if (mappingIn) for (const c of IMPORT_COLUMNS) if (mappingIn[c] !== undefined) mapping[c] = mappingIn[c] ?? null;

  const errors: ImportError[] = [];
  const colIdx = {} as Record<ImportColumn, number>;
  for (const c of IMPORT_COLUMNS) {
    const h = mapping[c];
    colIdx[c] = h === null ? -1 : sheet.headers.indexOf(h);
    if (h !== null && colIdx[c] < 0) errors.push({ row: null, round: null, message: `Kolona "${h}" ne postoji u fajlu.` });
    else if (h === null && REQUIRED.includes(c)) errors.push({ row: null, round: null, message: `Kolona "${c}" nije mapirana.` });
  }
  if (errors.length > 0) return { headers: sheet.headers, mapping, rounds: [], errors, playerNames: [] };

  const members = await deps.db.selectFrom('members').select(['id', 'name', 'display_name', 'username']).execute();
  const memberByName = new Map<string, number>();
  for (const m of members) {
    for (const n of [m.name, m.display_name, m.username]) memberByName.set(normalizeName(n), m.id);
  }
  const findMember = (s: string): number | null => memberByName.get(normalizeName(s)) ?? null;

  const get = (row: unknown[], c: ImportColumn): unknown => (colIdx[c] >= 0 ? row[colIdx[c]] ?? null : null);
  const groups = new Map<number, { day: string | null; rows: ImportRow[]; stake: number | null; odds: number | null; payer: number | null; win: number | null; firstRow: number; bad: boolean }>();
  const playerNames = new Map<string, string | null>();

  sheet.rows.forEach((row, i) => {
    const rowNum = i + 2;
    if (!row || row.every((c) => c === null || c === '')) return;
    const err = (message: string, round: number | null = null) => errors.push({ row: rowNum, round, message });
    const kolo = cellNum(get(row, 'kolo'));
    if (kolo === null) return err('Nedostaje broj kola.');
    let g = groups.get(kolo);
    if (!g) {
      g = { day: null, rows: [], stake: null, odds: null, payer: null, win: null, firstRow: rowNum, bad: false };
      groups.set(kolo, g);
    }
    const fail = (message: string) => {
      g!.bad = true;
      err(message, kolo);
    };
    const dayRaw = get(row, 'datum');
    if (dayRaw !== null && dayRaw !== '') {
      const day = parseDay(dayRaw);
      if (!day) fail(`Neispravan datum "${cellStr(dayRaw)}" (očekuje se dd.MM.yyyy.).`);
      else if (!g.day) g.day = day;
    }
    const stake = cellNum(get(row, 'uplata'));
    if (stake !== null && g.stake === null) g.stake = stake;
    const odds = cellNum(get(row, 'kvota'));
    if (odds !== null && g.odds === null) g.odds = odds;
    const payerRaw = cellStr(get(row, 'uplatio'));
    if (payerRaw && g.payer === null) {
      const p = findMember(payerRaw);
      if (p === null) fail(`Nepoznat uplatilac "${payerRaw}".`);
      else g.payer = p;
    }
    const win = cellNum(get(row, 'dobitak'));
    if (win !== null && g.win === null) g.win = win;

    const clanRaw = cellStr(get(row, 'clan'));
    let memberId: number | null = null;
    let cooldownFor: number | null = null;
    if (!clanRaw) return fail('Nedostaje član.');
    if (normalizeName(clanRaw) === 'ekipa') {
      const um = cellStr(get(row, 'umesto'));
      if (!um) return fail('Tip ekipe mora imati popunjeno "umesto".');
      cooldownFor = findMember(um);
      if (cooldownFor === null) return fail(`Nepoznat član "${um}" u koloni "umesto".`);
    } else {
      memberId = findMember(clanRaw);
      if (memberId === null) return fail(`Nepoznat član "${clanRaw}".`);
    }
    const playerName = cellStr(get(row, 'igrac'));
    if (!playerName) return fail('Nedostaje igrač.');
    const club = cellStr(get(row, 'tim')) || null;
    const lineRaw = get(row, 'granica');
    const line = cellNum(lineRaw);
    if (lineRaw === null || lineRaw === '') {
      err(`${WARNING_PREFIX}granica nije upisana (stari podaci).`, kolo);
    } else if (line === null || line <= 0) {
      return fail('Neispravna granica.');
    } else if (Math.abs(line - Math.floor(line) - 0.5) > 1e-9) {
      if (Number.isInteger(line)) err(`${WARNING_PREFIX}cela granica ${line} (stari podaci) je prihvaćena.`, kolo);
      else return fail(`Neispravna granica ${line}.`);
    }
    const dirRaw = cellStr(get(row, 'tip'));
    const direction = dirRaw ? parseDirection(dirRaw) : null;
    if (dirRaw && !direction) return fail(`Neispravan tip "${dirRaw}" (više/manje).`);
    if (!dirRaw) err(`${WARNING_PREFIX}tip (više/manje) nije upisan.`, kolo);
    const resRaw = cellStr(get(row, 'ishod'));
    const result = parseResult(resRaw);
    if (!result) return fail(`Neispravan ishod "${resRaw}" (pogodak/promašaj/poništen).`);
    const ptsRaw = get(row, 'poeni');
    const points = cellNum(ptsRaw);
    if (ptsRaw !== null && ptsRaw !== '' && (points === null || points < 0 || !Number.isInteger(points))) {
      return fail(`Neispravni poeni "${cellStr(ptsRaw)}".`);
    }
    playerNames.set(playerName, playerNames.get(playerName) ?? club);
    g.rows.push({ row: rowNum, memberId, cooldownFor, playerName, club, line, direction, points, result });
  });

  const rounds: ImportRound[] = [];
  for (const [kolo, g] of groups) {
    const e = (message: string) => errors.push({ row: g.firstRow, round: kolo, message });
    if (g.bad) continue;
    let ok = true;
    if (g.rows.length !== 4) {
      e(`Kolo ${kolo} ima ${g.rows.length} tip${g.rows.length === 1 ? '' : 'a'} (potrebno je tačno 4).`);
      ok = false;
    } else {
      const owners = g.rows.map((r) => r.memberId ?? r.cooldownFor);
      if (new Set(owners).size !== 4) {
        e(`Kolo ${kolo}: svaki član mora imati tačno jedan tip (lični ili tip ekipe umesto njega).`);
        ok = false;
      }
      const names = g.rows.map((r) => normalizeName(r.playerName));
      if (new Set(names).size !== names.length) {
        e(`Kolo ${kolo}: isti igrač se pojavljuje dva puta.`);
        ok = false;
      }
    }
    if (!g.day) {
      e(`Kolo ${kolo}: nedostaje datum.`);
      ok = false;
    }
    if (g.stake === null || !(g.stake > 0) || g.stake > MAX_STAKE || !isMoney(g.stake)) {
      e(`Kolo ${kolo}: nedostaje ili je neispravna uplata.`);
      ok = false;
    }
    if (g.odds === null) {
      e(`${WARNING_PREFIX}kolo ${kolo}: kvota nije upisana.`);
    } else if (!(g.odds >= 1.01) || g.odds > MAX_ODDS) {
      e(`Kolo ${kolo}: neispravna kvota (najmanje 1,01).`);
      ok = false;
    }
    if (g.payer === null) e(`${WARNING_PREFIX}kolo ${kolo}: uplatilac nije upisan.`);
    if (g.win !== null && (g.win < 0 || g.win > MAX_AMOUNT)) {
      e(`Kolo ${kolo}: neispravan dobitak.`);
      ok = false;
    }
    if (ok) {
      rounds.push({
        fileNumber: kolo,
        day: g.day!,
        rows: g.rows,
        stake: round2(g.stake!),
        totalOdds: g.odds === null ? null : round2(g.odds),
        payer: g.payer,
        actualWin: g.win === null ? null : round2(g.win),
      });
    }
  }
  rounds.sort((a, b) => a.day.localeCompare(b.day) || a.fileNumber - b.fileNumber);
  errors.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  return {
    headers: sheet.headers,
    mapping,
    rounds,
    errors,
    playerNames: [...playerNames.entries()].map(([name, club]) => ({ name, club })),
  };
}

function blocking(errors: ImportError[]): ImportError[] {
  return errors.filter((e) => !e.message.startsWith(WARNING_PREFIX));
}

/** Automatic matching: exact normalized name (also "Last First"), disambiguated by club. */
async function autoMatch(deps: Deps, list: Array<{ name: string; club: string | null }>): Promise<Map<string, number>> {
  const players = await deps.db
    .selectFrom('players')
    .leftJoin('clubs', 'clubs.code', 'players.club_code')
    .select(['players.id', 'players.full_name', 'players.club_code', 'clubs.name as club_name', 'clubs.short_name'])
    .execute();
  const byName = new Map<string, typeof players>();
  for (const p of players) {
    const key = normalizeName(p.full_name);
    const l = byName.get(key) ?? [];
    l.push(p);
    byName.set(key, l);
  }
  const out = new Map<string, number>();
  for (const { name, club } of list) {
    const n = normalizeName(name);
    const parts = n.split(' ');
    const swapped = parts.length >= 2 ? [...parts.slice(1), parts[0]].join(' ') : n;
    const swapped2 = parts.length >= 2 ? [parts[parts.length - 1], ...parts.slice(0, -1)].join(' ') : n;
    let cands = [...(byName.get(n) ?? []), ...(byName.get(swapped) ?? []), ...(byName.get(swapped2) ?? [])];
    cands = [...new Map(cands.map((c) => [c.id, c])).values()];
    if (cands.length > 1 && club) {
      const cn = normalizeName(club);
      const filtered = cands.filter(
        (c) =>
          (c.club_name && normalizeName(c.club_name).includes(cn)) ||
          (c.short_name && normalizeName(c.short_name).includes(cn)) ||
          c.club_code?.toLowerCase() === cn,
      );
      if (filtered.length > 0) cands = filtered;
    }
    if (cands.length === 1) out.set(name, cands[0]!.id);
  }
  return out;
}

async function importBlocker(deps: Deps): Promise<string | null> {
  const app = await deps.db.selectFrom('rounds').select('id').where('source', '=', 'app').executeTakeFirst();
  return app ? 'Uvoz nije moguć jer već postoje kola uneta kroz aplikaciju.' : null;
}

/** REQ-31.2–31.5: parse, validate and keep the file for commit. */
export async function previewImport(
  deps: Deps,
  input: { buffer?: Buffer; token?: string; mapping?: Partial<Record<ImportColumn, string | null>> | null },
): Promise<ImportPreviewResponse> {
  const now = deps.now().getTime();
  let buffer: Buffer;
  let token: string;
  if (input.buffer) {
    buffer = input.buffer;
    token = storeUpload(buffer, now);
  } else if (input.token) {
    buffer = getUpload(input.token, now);
    token = input.token;
  } else {
    throw unprocessable('Nedostaje fajl.');
  }
  const parsed = await parseImport(deps, buffer, input.mapping ?? null);
  const blocker = await importBlocker(deps);
  if (blocker) parsed.errors.unshift({ row: null, round: null, message: blocker });

  const matched = await autoMatch(deps, parsed.playerNames);
  const unmatchedPlayers: UnmatchedPlayer[] = [];
  for (const p of parsed.playerNames) {
    if (matched.has(p.name)) continue;
    unmatchedPlayers.push({ name: p.name, club: p.club, candidates: await playerCandidates(deps, p.name, p.club, 5) });
  }
  const days = parsed.rounds.map((r) => r.day).sort();
  return {
    token,
    headers: parsed.headers,
    mapping: parsed.mapping,
    rounds: parsed.rounds.length,
    from: days[0] ?? null,
    to: days[days.length - 1] ?? null,
    errors: parsed.errors,
    unmatchedPlayers,
    canCommit: blocking(parsed.errors).length === 0 && parsed.rounds.length > 0,
  };
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: '', last: parts[0]! };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1]! };
}

/** REQ-31.6–31.8: atomic import (replaces a previous import after confirmation). */
export async function commitImport(deps: Deps, actor: SessionMember, req: ImportCommitRequest): Promise<number> {
  const nowDate = deps.now();
  const buffer = getUpload(req.token, nowDate.getTime());
  const parsed = await parseImport(deps, buffer, req.mapping);
  const errs = blocking(parsed.errors);
  if (errs.length > 0 || parsed.rounds.length === 0) {
    throw unprocessable('Fajl sadrži greške; uvoz nije moguć.', { errors: errs });
  }
  const blocker = await importBlocker(deps);
  if (blocker) throw conflict(blocker);
  const existing = await deps.db.selectFrom('rounds').select('id').where('source', '=', 'import').execute();
  if (existing.length > 0 && !req.confirmReplace) {
    throw conflict(`Već postoji ${existing.length} uvezenih kola; potvrdite zamenu celog uvezenog skupa.`, { existing: existing.length });
  }

  const auto = await autoMatch(deps, parsed.playerNames);
  const matchFor = new Map<string, number | 'manual' | null>();
  for (const p of parsed.playerNames) {
    const explicit = req.playerMatches?.[p.name];
    matchFor.set(p.name, explicit !== undefined ? explicit : (auto.get(p.name) ?? null));
  }
  const explicitIds = [...matchFor.values()].filter((v): v is number => typeof v === 'number');
  if (explicitIds.length > 0) {
    const found = await deps.db.selectFrom('players').select('id').where('id', 'in', [...new Set(explicitIds)]).execute();
    if (found.length !== new Set(explicitIds).size) throw unprocessable('Izabran je nepostojeći igrač.');
  }
  const clubs = await deps.db.selectFrom('clubs').select(['code', 'name', 'short_name']).execute();
  const clubCodeFor = (club: string | null): string | null => {
    if (!club) return null;
    const n = normalizeName(club);
    const c = clubs.find(
      (x) => x.code.toLowerCase() === n || normalizeName(x.name) === n || normalizeName(x.short_name) === n || normalizeName(x.name).includes(n),
    );
    return c?.code ?? null;
  };
  const members = await deps.db.selectFrom('members').select(['id', 'sort_order']).execute();
  const order = new Map(members.map((m) => [m.id, m.sort_order]));

  const imported = await deps.db.transaction().execute(async (trx) => {
    if (existing.length > 0) await trx.deleteFrom('rounds').where('source', '=', 'import').execute();
    const playerIdFor = new Map<string, number | null>();
    for (const p of parsed.playerNames) {
      const m = matchFor.get(p.name) ?? null;
      if (m === 'manual') {
        const { first, last } = splitName(p.name);
        const res = await trx
          .insertInto('players')
          .values({
            external_code: null,
            first_name: first,
            last_name: last,
            full_name: p.name.trim(),
            search_name: normalizeName(p.name),
            club_code: clubCodeFor(p.club),
            position: null,
            jersey: null,
            photo_url: null,
            is_active: 1,
            is_manual: 1,
            last_synced_at: null,
          })
          .executeTakeFirstOrThrow();
        playerIdFor.set(p.name, Number(res.insertId));
      } else playerIdFor.set(p.name, m);
    }

    const seasons = new Set(parsed.rounds.map((r) => seasonForDate(r.day)));
    for (const s of seasons) {
      await trx
        .insertInto('seasons')
        .values({ code: s, name: seasonName(s), start_date: seasonStartDate(s) })
        .onDuplicateKeyUpdate({ code: s })
        .execute();
    }

    let number = 0;
    for (const r of parsed.rounds) {
      number++;
      const results = r.rows.map((x) => x.result);
      const outcome = ticketOutcome(results);
      const status = outcome.status === 'pending' ? 'void' : outcome.status;
      const computed = computeActualWin({
        status: outcome.status,
        stake: r.stake,
        totalOdds: r.totalOdds,
        picks: r.rows.map((x) => ({ result: x.result, odds: null })),
      });
      const res = await trx
        .insertInto('rounds')
        .values({
          number,
          opened_at: new Date(`${r.day}T12:00:00Z`),
          game_day: r.day,
          season_code: seasonForDate(r.day),
          euroleague_round: null,
          source: 'import',
          status,
          stake: r.stake,
          total_odds: r.totalOdds,
          payer_member_id: r.payer,
          actual_win: r.actualWin ?? computed.amount,
          actual_win_provisional: r.actualWin === null && computed.provisional ? 1 : 0,
          actual_win_manual: r.actualWin === null ? 0 : 1,
          hits: outcome.hits,
          misses: outcome.misses,
          voids: outcome.voids,
          locked_at: null,
          locked_by: null,
          resolved_at: nowDate,
          has_corrections: 0,
        })
        .executeTakeFirstOrThrow();
      const roundId = Number(res.insertId);
      const rows = [...r.rows].sort(
        (a, b) => (order.get(a.memberId ?? a.cooldownFor ?? 0) ?? 9) - (order.get(b.memberId ?? b.cooldownFor ?? 0) ?? 9),
      );
      const usedPlayers = new Set<number>();
      await trx
        .insertInto('picks')
        .values(
          rows.map((x, i) => {
            let playerId = playerIdFor.get(x.playerName) ?? null;
            if (playerId !== null && usedPlayers.has(playerId)) playerId = null;
            if (playerId !== null) usedPlayers.add(playerId);
            return {
              round_id: roundId,
              slot: i + 1,
              kind: x.memberId !== null ? ('personal' as const) : ('team' as const),
              member_id: x.memberId,
              cooldown_for_member_id: x.cooldownFor,
              player_id: playerId,
              game_id: null,
              line: x.line,
              direction: x.direction,
              odds: null,
              final_points: x.points,
              result: x.result,
              void_reason: null,
              resolution: 'import' as const,
              resolved_at: nowDate,
              import_player_name: playerId === null ? x.playerName : null,
            };
          }),
        )
        .execute();
    }
    const days = parsed.rounds.map((r) => r.day).sort();
    await writeAudit(trx, {
      at: nowDate,
      actorMemberId: actor.id,
      action: 'history_import',
      entity: 'import',
      oldValue: existing.length > 0 ? { replacedRounds: existing.length } : null,
      newValue: { rounds: parsed.rounds.length, from: days[0], to: days[days.length - 1] },
    });
    return parsed.rounds.length;
  });
  uploads.delete(req.token);
  deps.derived.invalidate();
  await deps.derived.get();
  return imported;
}
