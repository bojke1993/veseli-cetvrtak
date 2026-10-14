import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { EuroleagueLiveProvider, parseMinutes, splitPersonName } from '../../src/provider/euroleague.js';
import { ProviderSchemaError } from '../../src/provider/types.js';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

function fakeFetch(routes: Record<string, unknown>, calls: Array<{ url: string; init?: RequestInit }> = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response('not found', { status: 404 });
    const body = routes[key];
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

const cfg = loadConfig({}).euroleague;

describe('EuroleagueLiveProvider', () => {
  it('parses the season schedule', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const p = new EuroleagueLiveProvider(cfg, fakeFetch({ '/seasons/E2026/games': fixture('games-season.json') }, calls));
    const games = await p.listGames('E2026');
    expect(games).toHaveLength(30);
    expect(calls[0]!.url).toBe('https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games');
    expect(new Headers(calls[0]!.init?.headers).get('user-agent')).toBe(cfg.userAgent);
    expect(calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);
    const g = games.find((x) => x.gameCode === 27)!;
    expect(g).toMatchObject({
      seasonCode: 'E2026',
      round: 3,
      played: true,
      homeScore: 86,
      awayScore: 76,
      home: { code: 'BAS', shortName: 'Baskonia' },
      away: { code: 'MIL', name: 'Armani Olimpia Milan', shortName: 'Milan' },
    });
    expect(g.home.crestUrl).toMatch(/^https:/);
    expect(g.scheduledAt.toISOString()).toBe('2026-10-02T18:30:00.000Z');
  });

  it('parses round games', async () => {
    const p = new EuroleagueLiveProvider(cfg, fakeFetch({ '/games': fixture('games-round1.json') }));
    const games = await p.listGames('E2026');
    expect(games.length).toBeGreaterThan(0);
    expect(games.every((g) => g.home.code && g.away.code)).toBe(true);
  });

  it('parses people with title-cased names', async () => {
    const calls: Array<{ url: string }> = [];
    const p = new EuroleagueLiveProvider(cfg, fakeFetch({ '/people': fixture('people.json') }, calls));
    const players = await p.listPlayers('E2026');
    expect(calls[0]!.url).toBe('https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/people?personType=J');
    expect(players).toHaveLength(60);
    const k = players.find((x) => x.code === '014380')!;
    expect(k).toMatchObject({
      firstName: 'Omer',
      lastName: 'Kutluay',
      jersey: '27',
      position: 'Guard',
      active: true,
      club: { code: 'MAD', name: 'Real Madrid' },
    });
    expect(players.every((x) => /^\d+$/.test(x.code))).toBe(true);
  });

  it('title-cases API names', () => {
    expect(splitPersonName('LARKIN, SHANE')).toEqual({ firstName: 'Shane', lastName: 'Larkin' });
    expect(splitPersonName("M'BAYE, AMATH")).toEqual({ firstName: 'Amath', lastName: "M'Baye" });
    expect(splitPersonName('DE COLO, NANDO')).toEqual({ firstName: 'Nando', lastName: 'De Colo' });
    expect(splitPersonName('WARREN, TJ')).toEqual({ firstName: 'TJ', lastName: 'Warren' });
    expect(splitPersonName('SMITH-JONES, ANNA-MARIA')).toEqual({ firstName: 'Anna-Maria', lastName: 'Smith-Jones' });
  });

  it('parses minutes', () => {
    expect(parseMinutes('16:10')).toBe(970);
    expect(parseMinutes('DNP')).toBe(0);
    expect(parseMinutes('')).toBe(0);
    expect(parseMinutes(null)).toBe(0);
    expect(parseMinutes('00:01')).toBe(1);
  });

  it('parses header', async () => {
    const calls: Array<{ url: string }> = [];
    const p = new EuroleagueLiveProvider(cfg, fakeFetch({ '/api/Header': fixture('header-final.json') }, calls));
    const h = await p.getHeader('E2026', 10);
    expect(calls[0]!.url).toBe('https://live.euroleague.net/api/Header?gamecode=10&seasoncode=E2026');
    expect(h).toEqual({ live: false, homeScore: 92, awayScore: 76, quarter: null, clock: '00:00' });
  });

  it('parses boxscore incl. DNP', async () => {
    const calls: Array<{ url: string }> = [];
    const p = new EuroleagueLiveProvider(cfg, fakeFetch({ '/api/Boxscore': fixture('boxscore-final.json') }, calls));
    const b = await p.getBoxscore('E2026', 10);
    expect(calls[0]!.url).toBe('https://live.euroleague.net/api/Boxscore?gamecode=10&seasoncode=E2026');
    expect(b.live).toBe(false);
    const allman = b.lines.find((l) => l.playerCode === '011924')!;
    expect(allman).toEqual({
      playerCode: '011924',
      name: 'ALLMAN, KYLE',
      clubCode: 'PAR',
      points: 8,
      secondsPlayed: 16 * 60 + 10,
      fouls: 2,
    });
    const dnp = b.lines.find((l) => l.playerCode === '007632')!;
    expect(dnp.secondsPlayed).toBe(0);
    expect(dnp.points).toBe(0);
    expect(new Set(b.lines.map((l) => l.clubCode))).toEqual(new Set(['PAR', 'MIL']));
  });

  it('rejects unexpected structure with ProviderSchemaError', async () => {
    const p = new EuroleagueLiveProvider(
      cfg,
      fakeFetch({ '/api/Boxscore': { foo: 1 }, '/api/Header': 'not json', '/games': { data: [{ gameCode: 'x' }] } }),
    );
    await expect(p.getBoxscore('E2026', 1)).rejects.toBeInstanceOf(ProviderSchemaError);
    await expect(p.getHeader('E2026', 1)).rejects.toBeInstanceOf(ProviderSchemaError);
    await expect(p.listGames('E2026')).rejects.toBeInstanceOf(ProviderSchemaError);
  });

  it('reports HTTP errors', async () => {
    const p = new EuroleagueLiveProvider(cfg, fakeFetch({}));
    await expect(p.getHeader('E2026', 1)).rejects.toThrow(/404/);
  });
});

describe('titleCase suffixes', () => {
  it('keeps roman numeral suffixes and initialisms upper-case', async () => {
    const { titleCase } = await import('../../src/provider/euroleague.js');
    expect(titleCase('JIMMY CLARK III')).toBe('Jimmy Clark III');
    expect(titleCase('TJ SHORTS')).toBe('TJ Shorts');
  });
});
