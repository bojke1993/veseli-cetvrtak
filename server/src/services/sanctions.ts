import type { SanctionDto, SanctionsResponse } from '../api-types.js';
import type { DB } from '../db/kysely.js';
import type { Sanction, SanctionKind } from '../db/schema.js';
import type { Deps } from '../deps.js';
import type { SessionMember } from '../http/auth.js';
import { conflict, notFound, unprocessable } from '../http/errors.js';
import { writeAudit } from './audit.js';

/** BR-37: the second active warning turns into a suspension (skipping the next round). */
export const WARNINGS_FOR_SUSPENSION = 2;

const ACTIVE_ROUND = ['open', 'locked', 'in_progress'] as const;

/** Active warning = not revoked and not yet turned into a suspension. */
function isActiveWarning(s: Sanction): boolean {
  return s.kind === 'warning' && s.revoked_at === null && s.consumed_by_id === null;
}

/** Suspension that still has to be served (not revoked, no round assigned yet). */
function isPendingSuspension(s: Sanction): boolean {
  return s.kind === 'suspension' && s.revoked_at === null && s.served_round_id === null;
}

function toDto(s: Sanction, roundNumbers: Map<number, number>): SanctionDto {
  let status: SanctionDto['status'];
  if (s.revoked_at) status = 'revoked';
  else if (s.kind === 'warning') status = s.consumed_by_id === null ? 'active' : 'escalated';
  else status = s.served_round_id === null ? 'pending' : 'served';
  return {
    id: s.id,
    memberId: s.member_id,
    kind: s.kind,
    status,
    roundId: s.round_id,
    roundNumber: s.round_id !== null ? (roundNumbers.get(s.round_id) ?? null) : null,
    reason: s.reason,
    issuedBy: s.issued_by,
    issuedAt: s.issued_at.toISOString(),
    escalation: s.escalation === 1,
    consumedById: s.consumed_by_id,
    servedRoundId: s.served_round_id,
    servedRoundNumber: s.served_round_id !== null ? (roundNumbers.get(s.served_round_id) ?? null) : null,
    revokedAt: s.revoked_at ? s.revoked_at.toISOString() : null,
    revokedBy: s.revoked_by,
    revokeReason: s.revoke_reason,
  };
}

/** All measures, newest first (public, BR-35). */
export async function listSanctions(deps: Deps, memberId?: number): Promise<SanctionsResponse> {
  let q = deps.db.selectFrom('sanctions').selectAll().orderBy('issued_at', 'desc').orderBy('id', 'desc');
  if (memberId !== undefined) q = q.where('member_id', '=', memberId);
  const rows = await q.execute();
  const roundIds = [...new Set(rows.flatMap((r) => [r.round_id, r.served_round_id]).filter((x): x is number => x !== null))];
  const rounds = roundIds.length
    ? await deps.db.selectFrom('rounds').select(['id', 'number']).where('id', 'in', roundIds).execute()
    : [];
  const numbers = new Map(rounds.map((r) => [r.id, r.number]));
  return { items: rows.map((r) => toDto(r, numbers)), warningsForSuspension: WARNINGS_FOR_SUSPENSION };
}

/** Per member: active warnings and whether a suspension is pending or being served in the active round. */
export async function sanctionStatus(db: DB): Promise<Map<number, { warnings: number; suspended: boolean }>> {
  const rows = await db.selectFrom('sanctions').selectAll().where('revoked_at', 'is', null).execute();
  const active = await db
    .selectFrom('rounds')
    .select('id')
    .where('status', 'in', [...ACTIVE_ROUND])
    .orderBy('number', 'desc')
    .executeTakeFirst();
  const out = new Map<number, { warnings: number; suspended: boolean }>();
  for (const s of rows) {
    const cur = out.get(s.member_id) ?? { warnings: 0, suspended: false };
    if (isActiveWarning(s)) cur.warnings++;
    if (s.kind === 'suspension' && (s.served_round_id === null || (active && s.served_round_id === active.id))) cur.suspended = true;
    out.set(s.member_id, cur);
  }
  return out;
}

export interface IssueSanctionInput {
  memberId: number;
  kind: SanctionKind;
  roundId?: number | null;
  reason: string;
}

/**
 * BR-37: the admin issues a warning or a suspension with a mandatory reason. A warning that
 * brings the member to WARNINGS_FOR_SUSPENSION active warnings creates a suspension that uses them up.
 * Returns the ids created (the escalation suspension last).
 */
export async function issueSanction(deps: Deps, actor: SessionMember, input: IssueSanctionInput): Promise<number[]> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw unprocessable('Obrazloženje je obavezno.');
  const now = deps.now();
  const ids = await deps.db.transaction().execute(async (trx) => {
    const member = await trx.selectFrom('members').select(['id', 'display_name']).where('id', '=', input.memberId).executeTakeFirst();
    if (!member) throw notFound('Član nije pronađen.');
    if (input.roundId != null) {
      const round = await trx.selectFrom('rounds').select('id').where('id', '=', input.roundId).executeTakeFirst();
      if (!round) throw notFound('Kolo nije pronađeno.');
    }
    const insert = async (kind: SanctionKind, why: string, escalation: boolean) => {
      const res = await trx
        .insertInto('sanctions')
        .values({
          member_id: input.memberId,
          kind,
          round_id: input.roundId ?? null,
          reason: why,
          issued_by: actor.id,
          issued_at: now,
          escalation: escalation ? 1 : 0,
          consumed_by_id: null,
          served_round_id: null,
          revoked_at: null,
          revoked_by: null,
          revoke_reason: null,
        })
        .executeTakeFirstOrThrow();
      const id = Number(res.insertId);
      await writeAudit(trx, {
        at: now,
        actorMemberId: escalation ? null : actor.id,
        action: 'sanction_issue',
        roundId: input.roundId ?? null,
        entity: 'sanction',
        entityId: id,
        field: kind,
        newValue: { memberId: input.memberId, kind, escalation },
        reason: why,
      });
      return id;
    };

    const id = await insert(input.kind, reason, false);
    if (input.kind !== 'warning') return [id];

    const warnings = (await trx.selectFrom('sanctions').selectAll().where('member_id', '=', input.memberId).execute()).filter(
      isActiveWarning,
    );
    if (warnings.length < WARNINGS_FOR_SUSPENSION) return [id];
    const suspensionId = await insert(
      'suspension',
      `${WARNINGS_FOR_SUSPENSION}. opomena — preskakanje kola. Povod: ${reason}`.slice(0, 1000),
      true,
    );
    await trx
      .updateTable('sanctions')
      .set({ consumed_by_id: suspensionId })
      .where('id', 'in', warnings.map((w) => w.id))
      .execute();
    return [id, suspensionId];
  });
  return ids;
}

/**
 * Revokes a measure that has not had consequences yet. Revoking a warning that led to a
 * pending suspension also revokes that suspension and returns the other warnings to active.
 */
export async function revokeSanction(deps: Deps, actor: SessionMember, id: number, reasonIn: string): Promise<void> {
  const reason = reasonIn.trim();
  if (reason.length < 3) throw unprocessable('Razlog poništavanja je obavezan.');
  const now = deps.now();
  await deps.db.transaction().execute(async (trx) => {
    const s = await trx.selectFrom('sanctions').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
    if (!s) throw notFound('Mera nije pronađena.');
    if (s.revoked_at) throw conflict('Mera je već poništena.');
    if (s.kind === 'suspension' && s.served_round_id !== null) {
      throw conflict('Suspenzija je već primenjena na kolo i ne može se poništiti.');
    }
    const revoke = async (target: Sanction, why: string) => {
      await trx
        .updateTable('sanctions')
        .set({ revoked_at: now, revoked_by: actor.id, revoke_reason: why })
        .where('id', '=', target.id)
        .execute();
      await writeAudit(trx, {
        at: now,
        actorMemberId: actor.id,
        action: 'sanction_revoke',
        roundId: target.round_id,
        entity: 'sanction',
        entityId: target.id,
        field: target.kind,
        oldValue: { memberId: target.member_id, kind: target.kind },
        reason: why,
      });
    };

    if (s.kind === 'warning' && s.consumed_by_id !== null) {
      const susp = await trx.selectFrom('sanctions').selectAll().where('id', '=', s.consumed_by_id).executeTakeFirst();
      if (susp && !susp.revoked_at) {
        if (susp.served_round_id !== null) {
          throw conflict('Opomena je već dovela do odsluženog preskakanja kola i ne može se poništiti.');
        }
        await revoke(susp, `Poništena opomena #${s.id}: ${reason}`.slice(0, 1000));
        await trx
          .updateTable('sanctions')
          .set({ consumed_by_id: null })
          .where('consumed_by_id', '=', susp.id)
          .where('id', '!=', s.id)
          .execute();
      }
    }
    await revoke(s, reason);
  });
}

/**
 * BR-37: members who sit out the round being opened. Cooldown takes precedence: a member on
 * cooldown serves the suspension in the next round in which they would play.
 * Returns the oldest pending suspension per member.
 */
export async function pendingSuspensions(db: DB, onCooldown: Set<number>, now: Date): Promise<Map<number, number>> {
  const rows = await db
    .selectFrom('sanctions')
    .selectAll()
    .where('kind', '=', 'suspension')
    .where('issued_at', '<=', now)
    .orderBy('issued_at')
    .orderBy('id')
    .execute();
  const out = new Map<number, number>();
  for (const s of rows) {
    if (!isPendingSuspension(s) || onCooldown.has(s.member_id) || out.has(s.member_id)) continue;
    out.set(s.member_id, s.id);
  }
  return out;
}

/** Marks the suspensions as served in `roundId` (inside the round-creating transaction). */
export async function markSuspensionsServed(trx: DB, suspensions: Map<number, number>, roundId: number, now: Date): Promise<void> {
  for (const [memberId, id] of suspensions) {
    await trx.updateTable('sanctions').set({ served_round_id: roundId }).where('id', '=', id).execute();
    await writeAudit(trx, {
      at: now,
      actorMemberId: null,
      action: 'suspension_served',
      roundId,
      entity: 'sanction',
      entityId: id,
      field: 'served_round_id',
      newValue: { memberId, roundId },
    });
  }
}
