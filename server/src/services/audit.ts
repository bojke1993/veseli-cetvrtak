import type { DB } from '../db/kysely.js';
import type { AuditAction } from '../db/schema.js';

export interface AuditInput {
  at: Date;
  /** null = system */
  actorMemberId: number | null;
  action: AuditAction;
  roundId?: number | null;
  entity?: string | null;
  entityId?: string | number | null;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

/** Append-only audit trail (REQ-29). Accepts a transaction as `db`. */
export async function writeAudit(db: DB, e: AuditInput): Promise<void> {
  await db
    .insertInto('audit_log')
    .values({
      at: e.at,
      actor_member_id: e.actorMemberId,
      action: e.action,
      round_id: e.roundId ?? null,
      entity: e.entity ?? null,
      entity_id: e.entityId === undefined || e.entityId === null ? null : String(e.entityId),
      field: e.field ?? null,
      old_value: e.oldValue === undefined ? null : JSON.stringify(e.oldValue),
      new_value: e.newValue === undefined ? null : JSON.stringify(e.newValue),
      reason: e.reason ?? null,
    })
    .execute();
}
