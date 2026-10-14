import type { AuditEntryDto, ClubDto, GameDto, PlayerDto } from '../api-types.js';
import type { DB } from '../db/kysely.js';
import type { AuditEntry, Game, Player } from '../db/schema.js';
import { toNum } from '../domain/money.js';

/** Shared row → DTO mappers for stream C services. */

export type ClubMap = Map<string, ClubDto>;

export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function num(v: string | number | null | undefined): number | null {
  return toNum(v);
}

export async function loadClubs(db: DB, codes?: Iterable<string | null | undefined>): Promise<ClubMap> {
  let q = db.selectFrom('clubs').selectAll();
  if (codes) {
    const list = [...new Set([...codes].filter((c): c is string => !!c))];
    if (list.length === 0) return new Map();
    q = q.where('code', 'in', list);
  }
  const rows = await q.execute();
  return new Map(rows.map((c) => [c.code, { code: c.code, name: c.name, shortName: c.short_name, crestUrl: c.crest_url }]));
}

export function clubDto(clubs: ClubMap, code: string | null): ClubDto | null {
  if (!code) return null;
  return clubs.get(code) ?? { code, name: code, shortName: code, crestUrl: null };
}

export function gameDto(g: Game, clubs: ClubMap): GameDto {
  return {
    id: g.id,
    seasonCode: g.season_code,
    gameCode: g.game_code,
    euroleagueRound: g.euroleague_round,
    home: clubDto(clubs, g.home_club_code)!,
    away: clubDto(clubs, g.away_club_code)!,
    scheduledAt: g.scheduled_at.toISOString(),
    gameDay: g.game_day,
    status: g.status,
    homeScore: g.home_score,
    awayScore: g.away_score,
    liveQuarter: g.live_quarter,
    liveClock: g.live_clock,
    isManual: g.is_manual === 1,
  };
}

export function playerDto(p: Player, clubs: ClubMap): PlayerDto {
  return {
    id: p.id,
    fullName: p.full_name,
    club: clubDto(clubs, p.club_code),
    position: p.position,
    jersey: p.jersey,
    photoUrl: p.photo_url,
    isActive: p.is_active === 1,
    isManual: p.is_manual === 1,
  };
}

function parseJson(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

export function auditDto(a: AuditEntry): AuditEntryDto {
  return {
    id: a.id,
    at: a.at.toISOString(),
    actorMemberId: a.actor_member_id,
    action: a.action,
    roundId: a.round_id,
    entity: a.entity,
    entityId: a.entity_id,
    field: a.field,
    oldValue: parseJson(a.old_value),
    newValue: parseJson(a.new_value),
    reason: a.reason,
  };
}

/** True when a game has not started yet (BR-08). */
export function gameNotStarted(g: Pick<Game, 'status' | 'scheduled_at'>, now: Date): boolean {
  return g.status === 'scheduled' && g.scheduled_at.getTime() > now.getTime();
}

/** '16.10.' for '2026-10-16'. */
export function shortDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${d}.${m}.`;
}

/** '16.10.2026.' for '2026-10-16'. */
export function longDay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}.${m}.${y}.`;
}

/** Positive amount with at most 2 decimals. */
export function isMoney(n: number): boolean {
  return Number.isFinite(n) && Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
}
