import type { FastifyInstance } from 'fastify';
import type { AuditResponse } from '../api-types.js';
import type { Deps } from '../deps.js';
import { requireMember } from '../http/auth.js';
import { auditDto } from '../services/dto.js';

/** REQ-29: read-only audit log for logged-in members, filterable by round and actor ('system' or member id). */
export async function registerAuditRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get<{ Querystring: { roundId?: number; actor?: string; limit?: number } }>(
    '/audit',
    {
      preHandler: requireMember,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            roundId: { type: 'integer', minimum: 1 },
            actor: { type: 'string', pattern: '^(system|[0-9]{1,3})$' },
            limit: { type: 'integer', minimum: 1, maximum: 1000 },
          },
        },
      },
    },
    async (request): Promise<AuditResponse> => {
      let q = deps.db.selectFrom('audit_log').selectAll();
      if (request.query.roundId !== undefined) q = q.where('round_id', '=', request.query.roundId);
      const actor = request.query.actor;
      if (actor === 'system') q = q.where('actor_member_id', 'is', null);
      else if (actor !== undefined) q = q.where('actor_member_id', '=', Number(actor));
      const rows = await q
        .orderBy('at', 'desc')
        .orderBy('id', 'desc')
        .limit(request.query.limit ?? 300)
        .execute();
      return { items: rows.map(auditDto) };
    },
  );
}
