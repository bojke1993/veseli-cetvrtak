import type { FastifyInstance } from 'fastify';
import type { IssueSanctionRequest, IssueSanctionResponse, RevokeSanctionRequest, SanctionsResponse } from '../api-types.js';
import type { Deps } from '../deps.js';
import { requireAdmin } from '../http/auth.js';
import { issueSanction, listSanctions, revokeSanction } from '../services/sanctions.js';
import { idParams, memberIdSchema, type IdParams } from './schemas.js';

/** BR-37: disciplinary measures — public list, admin issues and revokes. */
export async function registerSanctionRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get<{ Querystring: { member?: number } }>(
    '/sanctions',
    { schema: { querystring: { type: 'object', additionalProperties: false, properties: { member: memberIdSchema } } } },
    async (request): Promise<SanctionsResponse> => listSanctions(deps, request.query.member),
  );

  app.post<{ Body: IssueSanctionRequest }>(
    '/sanctions',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['memberId', 'kind', 'reason'],
          additionalProperties: false,
          properties: {
            memberId: memberIdSchema,
            kind: { type: 'string', enum: ['warning', 'suspension'] },
            roundId: { anyOf: [{ type: 'null' }, { type: 'integer', minimum: 1 }] },
            reason: { type: 'string', minLength: 1, maxLength: 900 },
          },
        },
      },
    },
    async (request): Promise<IssueSanctionResponse> => {
      const createdIds = await issueSanction(deps, request.member!, request.body);
      deps.derived.invalidate();
      return { ...(await listSanctions(deps)), createdIds };
    },
  );

  app.post<IdParams & { Body: RevokeSanctionRequest }>(
    '/sanctions/:id/revoke',
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['reason'],
          additionalProperties: false,
          properties: { reason: { type: 'string', minLength: 1, maxLength: 900 } },
        },
      },
    },
    async (request): Promise<SanctionsResponse> => {
      await revokeSanction(deps, request.member!, request.params.id, request.body.reason);
      deps.derived.invalidate();
      return listSanctions(deps);
    },
  );
}
