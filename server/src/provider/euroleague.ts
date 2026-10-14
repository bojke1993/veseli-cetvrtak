import { z } from 'zod';
import type { AppConfig } from '../config.js';
import {
  ProviderSchemaError,
  type EuroleagueProvider,
  type ProviderBoxscore,
  type ProviderBoxscoreLine,
  type ProviderClub,
  type ProviderGame,
  type ProviderHeader,
  type ProviderPlayer,
} from './types.js';

const TIMEOUT_MS = 10_000;

/** HTTP-level failure (non-2xx). `status` lets the worker distinguish 429/5xx. */
export class ProviderHttpError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super(`Euroleague API ${status} for ${url}`);
    this.name = 'ProviderHttpError';
  }
}

// ---------- schemas (lenient: only the fields we use) ----------

const numLike = z.union([z.number(), z.string()]).nullish();

const clubSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    abbreviatedName: z.string().nullish(),
    editorialName: z.string().nullish(),
    images: z.object({ crest: z.string().nullish() }).passthrough().nullish(),
  })
  .passthrough();

const gamesSchema = z
  .object({
    data: z.array(
      z
        .object({
          gameCode: z.number(),
          round: z.number().nullish(),
          utcDate: z.string(),
          played: z.boolean(),
          local: z.object({ club: clubSchema, score: numLike }).passthrough(),
          road: z.object({ club: clubSchema, score: numLike }).passthrough(),
          season: z.object({ code: z.string() }).passthrough().nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const peopleSchema = z
  .object({
    data: z.array(
      z
        .object({
          person: z.object({ code: z.string(), name: z.string() }).passthrough(),
          active: z.boolean().nullish(),
          dorsal: z.union([z.string(), z.number()]).nullish(),
          positionName: z.string().nullish(),
          images: z.object({ headshot: z.string().nullish() }).passthrough().nullish(),
          club: clubSchema.nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const headerSchema = z
  .object({
    Live: z.boolean(),
    ScoreA: numLike,
    ScoreB: numLike,
    Quarter: z.union([z.string(), z.number()]).nullish(),
    RemainingPartialTime: z.string().nullish(),
  })
  .passthrough();

const boxscoreSchema = z
  .object({
    Live: z.boolean(),
    Stats: z.array(
      z
        .object({
          PlayersStats: z.array(
            z
              .object({
                Player_ID: z.string(),
                Player: z.string().nullish(),
                Team: z.string().nullish(),
                Minutes: z.union([z.string(), z.number()]).nullish(),
                Points: numLike,
                FoulsCommited: numLike,
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

// ---------- helpers ----------

function toInt(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  const t = v.trim();
  if (t === '') return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

/** "MM:SS" -> seconds; "DNP", "" or missing -> 0. Numbers are treated as minutes. */
export function parseMinutes(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 60) : 0;
  const m = /^\s*(\d+):(\d{1,2})\s*$/.exec(v);
  if (!m) return 0;
  return Number.parseInt(m[1]!, 10) * 60 + Number.parseInt(m[2]!, 10);
}

/** 'P007200   ' -> '007200' */
export function normalizePlayerCode(raw: string): string {
  return raw.trim().replace(/^P/i, '');
}

function titleWord(word: string): string {
  // Initialisms such as "TJ", "AJ" stay upper-case.
  if (word.length <= 2 && !/[AEIOUY]/i.test(word)) return word.toUpperCase();
  // Generational suffixes: "II", "III", "IV".
  if (/^(II|III|IV)$/i.test(word)) return word.toUpperCase();
  return word.toLowerCase().replace(/(^|[\s\-'’.])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(titleWord)
    .join(' ');
}

/** "LARKIN, SHANE" -> { firstName: 'Shane', lastName: 'Larkin' } */
export function splitPersonName(raw: string): { firstName: string; lastName: string } {
  const idx = raw.indexOf(',');
  if (idx < 0) return { firstName: '', lastName: titleCase(raw) };
  return { lastName: titleCase(raw.slice(0, idx)), firstName: titleCase(raw.slice(idx + 1).replace(/,/g, ' ')) };
}

function mapClub(c: z.infer<typeof clubSchema>): ProviderClub {
  return {
    code: c.code.trim(),
    name: c.name,
    shortName: c.abbreviatedName || c.editorialName || c.name,
    crestUrl: c.images?.crest ?? null,
  };
}

function parse<T extends z.ZodType>(schema: T, body: unknown, what: string): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) throw new ProviderSchemaError(`Neočekivana struktura odgovora (${what})`, r.error.issues.slice(0, 5));
  return r.data;
}

// ---------- provider ----------

export class EuroleagueLiveProvider implements EuroleagueProvider {
  constructor(
    private readonly cfg: AppConfig['euroleague'],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async getJson(url: string): Promise<unknown> {
    const res = await this.fetchImpl(url, {
      headers: { 'User-Agent': this.cfg.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new ProviderHttpError(res.status, url);
    const text = await res.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderSchemaError(`Odgovor nije JSON (${url})`);
    }
  }

  private v2(path: string): string {
    return `${this.cfg.apiBase.replace(/\/$/, '')}/v2/competitions/${this.cfg.competition}${path}`;
  }

  private live(path: string, season: string, gameCode: number): string {
    return `${this.cfg.liveBase.replace(/\/$/, '')}/api/${path}?gamecode=${gameCode}&seasoncode=${encodeURIComponent(season)}`;
  }

  async listGames(seasonCode: string): Promise<ProviderGame[]> {
    const body = parse(gamesSchema, await this.getJson(this.v2(`/seasons/${encodeURIComponent(seasonCode)}/games`)), 'games');
    return body.data.map((g) => {
      const scheduledAt = new Date(g.utcDate.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(g.utcDate) ? g.utcDate : `${g.utcDate}Z`);
      if (Number.isNaN(scheduledAt.getTime())) throw new ProviderSchemaError(`Neispravan datum utakmice ${g.gameCode}: ${g.utcDate}`);
      const homeScore = toInt(g.local.score);
      const awayScore = toInt(g.road.score);
      return {
        seasonCode: g.season?.code ?? seasonCode,
        gameCode: g.gameCode,
        round: g.round ?? null,
        home: mapClub(g.local.club),
        away: mapClub(g.road.club),
        scheduledAt,
        played: g.played,
        // Unplayed games report 0:0; expose null instead.
        homeScore: g.played ? homeScore : null,
        awayScore: g.played ? awayScore : null,
      };
    });
  }

  async listPlayers(seasonCode: string): Promise<ProviderPlayer[]> {
    // The API returns the whole season roster in one response (335 players on 14.10.2026, `total` == data.length).
    const body = parse(
      peopleSchema,
      await this.getJson(this.v2(`/seasons/${encodeURIComponent(seasonCode)}/people?personType=J`)),
      'people',
    );
    return body.data.map((p) => {
      const { firstName, lastName } = splitPersonName(p.person.name);
      const jersey = p.dorsal === null || p.dorsal === undefined ? null : String(p.dorsal).trim() || null;
      return {
        code: normalizePlayerCode(p.person.code),
        firstName,
        lastName,
        club: p.club ? mapClub(p.club) : null,
        position: p.positionName?.trim() || null,
        jersey,
        photoUrl: p.images?.headshot ?? null,
        active: p.active ?? true,
      };
    });
  }

  async getHeader(seasonCode: string, gameCode: number): Promise<ProviderHeader> {
    const h = parse(headerSchema, await this.getJson(this.live('Header', seasonCode, gameCode)), 'header');
    const quarter = h.Quarter === null || h.Quarter === undefined ? null : String(h.Quarter).trim() || null;
    return {
      live: h.Live,
      homeScore: toInt(h.ScoreA) ?? 0,
      awayScore: toInt(h.ScoreB) ?? 0,
      quarter,
      clock: h.RemainingPartialTime?.trim() || null,
    };
  }

  async getBoxscore(seasonCode: string, gameCode: number): Promise<ProviderBoxscore> {
    const b = parse(boxscoreSchema, await this.getJson(this.live('Boxscore', seasonCode, gameCode)), 'boxscore');
    const lines: ProviderBoxscoreLine[] = [];
    for (const team of b.Stats) {
      for (const p of team.PlayersStats) {
        const code = normalizePlayerCode(p.Player_ID);
        if (!code) continue;
        lines.push({
          playerCode: code,
          name: (p.Player ?? '').trim(),
          clubCode: (p.Team ?? '').trim(),
          points: toInt(p.Points) ?? 0,
          secondsPlayed: parseMinutes(p.Minutes),
          fouls: toInt(p.FoulsCommited),
        });
      }
    }
    return { live: b.Live, lines };
  }
}
