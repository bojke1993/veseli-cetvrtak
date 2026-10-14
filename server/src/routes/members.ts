import type { FastifyInstance } from 'fastify';
import type { MembersResponse, ResetPasswordResponse, UpdateMemberRequest } from '../api-types.js';
import type { Deps } from '../deps.js';
import { requireAdmin, requireMember } from '../http/auth.js';
import { forbidden } from '../http/errors.js';
import { resetPassword } from '../services/auth.js';
import { listMembers, transferAdmin, updateMember } from '../services/members.js';
import { idParams, type IdParams } from './schemas.js';

export async function registerMemberRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/members', async (): Promise<MembersResponse> => ({ members: await listMembers(deps) }));

  app.patch<IdParams & { Body: UpdateMemberRequest }>(
    '/members/:id',
    {
      // EKR-11: every member edits their own profile; the admin edits anyone's.
      preHandler: requireMember,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            displayName: { type: 'string', minLength: 1, maxLength: 64 },
            avatarUrl: { type: ['string', 'null'], maxLength: 512 },
          },
        },
      },
    },
    async (request) => {
      if (!request.member!.isAdmin && request.member!.id !== request.params.id) throw forbidden();
      return { member: await updateMember(deps, request.params.id, request.body) };
    },
  );

  app.post<IdParams>(
    '/members/:id/transfer-admin',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request): Promise<MembersResponse> => {
      await transferAdmin(deps, request.member!, request.params.id);
      return { members: await listMembers(deps) };
    },
  );

  app.post<IdParams>(
    '/members/:id/reset-password',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request): Promise<ResetPasswordResponse> => ({
      temporaryPassword: await resetPassword(deps, request.member!, request.params.id),
    }),
  );
}
