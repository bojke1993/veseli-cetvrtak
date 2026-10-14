import type { MemberDto, MemberStatus } from '../api-types.js';
import type { Deps } from '../deps.js';
import type { DerivedState } from '../domain/derived-types.js';
import { seasonForDate, todayInBelgrade } from '../domain/season.js';
import type { SessionMember } from '../http/auth.js';
import { conflict, notFound, unprocessable } from '../http/errors.js';
import { writeAudit } from './audit.js';

export const ACTIVE_STATUSES = ['open', 'locked', 'in_progress'] as const;

/** Signed streak (+hits / −misses) in the current season. */
export function memberStreak(derived: DerivedState, memberId: number, currentSeason: string): { streak: number; hasFire: boolean } {
  const s = derived.members[memberId];
  if (!s || s.seasonCode !== currentSeason) return { streak: 0, hasFire: false };
  return { streak: s.hitStreak > 0 ? s.hitStreak : -s.missStreak, hasFire: s.hasFire };
}

/** Members on cooldown in the active round, or (no active round) scheduled for the next one. */
export async function cooldownMemberIds(deps: Deps, derived: DerivedState, currentSeason: string): Promise<Set<number>> {
  const active = await deps.db
    .selectFrom('rounds')
    .select(['id'])
    .where('status', 'in', [...ACTIVE_STATUSES])
    .orderBy('number', 'desc')
    .executeTakeFirst();
  if (active) {
    const picks = await deps.db
      .selectFrom('picks')
      .select('cooldown_for_member_id')
      .where('round_id', '=', active.id)
      .where('kind', '=', 'team')
      .execute();
    return new Set(picks.map((p) => p.cooldown_for_member_id).filter((x): x is number => x !== null));
  }
  return new Set(derived.cooldownForNextRound(currentSeason));
}

export async function listMembers(deps: Deps): Promise<MemberDto[]> {
  const rows = await deps.db.selectFrom('members').selectAll().orderBy('sort_order').execute();
  const derived = await deps.derived.get();
  const season = seasonForDate(todayInBelgrade(deps.now()));
  const cooldown = await cooldownMemberIds(deps, derived, season);
  return rows.map((m) => {
    const status: MemberStatus = { ...memberStreak(derived, m.id, season), onCooldown: cooldown.has(m.id) };
    return {
      id: m.id,
      name: m.name,
      displayName: m.display_name,
      avatarUrl: m.avatar_url,
      isAdmin: m.is_admin === 1,
      sortOrder: m.sort_order,
      status,
    };
  });
}

export async function getMember(deps: Deps, id: number): Promise<MemberDto> {
  const m = (await listMembers(deps)).find((x) => x.id === id);
  if (!m) throw notFound('Član nije pronađen.');
  return m;
}

export async function updateMember(
  deps: Deps,
  id: number,
  input: { displayName?: string; avatarUrl?: string | null },
): Promise<MemberDto> {
  const exists = await deps.db.selectFrom('members').select('id').where('id', '=', id).executeTakeFirst();
  if (!exists) throw notFound('Član nije pronađen.');
  const set: { display_name?: string; avatar_url?: string | null } = {};
  if (input.displayName !== undefined) {
    const dn = input.displayName.trim();
    if (dn.length === 0) throw unprocessable('Prikazno ime ne sme biti prazno.');
    set.display_name = dn;
  }
  if (input.avatarUrl !== undefined) {
    const url = input.avatarUrl === null ? null : input.avatarUrl.trim() || null;
    if (url !== null && !/^https?:\/\/\S+$/i.test(url)) {
      throw unprocessable('Avatar mora biti http(s) adresa slike.');
    }
    set.avatar_url = url;
  }
  if (Object.keys(set).length > 0) {
    await deps.db.updateTable('members').set(set).where('id', '=', id).execute();
  }
  return getMember(deps, id);
}

/** REQ-03.3: exactly one admin; transfer in a single transaction with an audit entry. */
export async function transferAdmin(deps: Deps, actor: SessionMember, toId: number): Promise<void> {
  if (toId === actor.id) throw conflict('Već ste administrator.');
  await deps.db.transaction().execute(async (trx) => {
    const target = await trx.selectFrom('members').select('id').where('id', '=', toId).executeTakeFirst();
    if (!target) throw notFound('Član nije pronađen.');
    await trx.updateTable('members').set({ is_admin: 0 }).where('id', '!=', toId).execute();
    await trx.updateTable('members').set({ is_admin: 1 }).where('id', '=', toId).execute();
    await writeAudit(trx, {
      at: deps.now(),
      actorMemberId: actor.id,
      action: 'admin_transfer',
      entity: 'member',
      entityId: toId,
      field: 'is_admin',
      oldValue: actor.id,
      newValue: toId,
    });
  });
}
