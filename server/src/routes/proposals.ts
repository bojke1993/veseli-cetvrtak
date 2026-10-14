import type { FastifyInstance } from 'fastify';
import type { RoundResponse } from '../api-types.js';
import type { Deps } from '../deps.js';
import { requireAdmin, requireMember } from '../http/auth.js';
import { acceptProposal, vote } from '../services/proposals.js';
import { buildRoundDetail } from '../services/rounds.js';
import { idParams, type IdParams } from './schemas.js';

export async function registerProposalRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.post<IdParams>(
    '/proposals/:id/vote',
    { preHandler: requireMember, schema: { params: idParams } },
    async (request): Promise<RoundResponse> => {
      const roundId = await vote(deps, request.member!, request.params.id, true);
      return { round: await buildRoundDetail(deps, roundId, request.member) };
    },
  );

  app.delete<IdParams>(
    '/proposals/:id/vote',
    { preHandler: requireMember, schema: { params: idParams } },
    async (request): Promise<RoundResponse> => {
      const roundId = await vote(deps, request.member!, request.params.id, false);
      return { round: await buildRoundDetail(deps, roundId, request.member) };
    },
  );

  app.post<IdParams>(
    '/proposals/:id/accept',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request): Promise<RoundResponse> => {
      const roundId = await acceptProposal(deps, request.params.id);
      return { round: await buildRoundDetail(deps, roundId, request.member) };
    },
  );
}
