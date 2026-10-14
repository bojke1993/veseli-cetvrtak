import type { FastifyInstance, FastifyRequest } from 'fastify';
import type {
  ActualWinRequest,
  CorrectionRequest,
  CorrectionResponse,
  CreateProposalRequest,
  CreateRoundRequest,
  CurrentRoundResponse,
  DeleteRoundRequest,
  ManualResolveRequest,
  RoundResponse,
  RoundsQuery,
  RoundsResponse,
  SetPickRequest,
  UnlockRequest,
  UpdateRoundRequest,
} from '../api-types.js';
import type { Deps } from '../deps.js';
import { requireAdmin, requireMember } from '../http/auth.js';
import { listRounds } from '../services/history.js';
import { createProposal } from '../services/proposals.js';
import {
  buildRoundDetail,
  clearPick,
  correctRound,
  createRound,
  deleteRound,
  getCurrentRound,
  lockRound,
  manualResolve,
  setActualWin,
  setPick,
  unlockRound,
  updateRound,
} from '../services/rounds.js';
import { day, direction, idParams, memberIdSchema, reason, type IdParams } from './schemas.js';

const slotParams = {
  type: 'object',
  required: ['id', 'slot'],
  properties: { id: { type: 'integer', minimum: 1 }, slot: { type: 'integer', minimum: 1, maximum: 4 } },
} as const;
type SlotParams = { Params: { id: number; slot: number } };

const money = { type: ['number', 'null'], minimum: 0 } as const;

export async function registerRoundRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const detail = async (request: FastifyRequest, id: number): Promise<RoundResponse> => ({
    round: await buildRoundDetail(deps, id, request.member),
  });

  app.get<{ Querystring: RoundsQuery }>(
    '/rounds',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            season: { type: 'string', maxLength: 16 },
            from: day,
            to: day,
            status: { type: 'string', enum: ['open', 'locked', 'in_progress', 'won', 'lost', 'void'] },
            outcome: { type: 'string', enum: ['4/4', '3/4', '2/4', '1/4', '0/4', 'with_void'] },
            member: memberIdSchema,
            memberFilter: { type: 'string', enum: ['hit', 'miss', 'blame', 'cooldown'] },
            payer: memberIdSchema,
            player: { type: 'integer', minimum: 1 },
            club: { type: 'string', maxLength: 8 },
            direction,
            teamPick: { type: 'boolean' },
            page: { type: 'integer', minimum: 1, maximum: 10000 },
          },
        },
      },
    },
    async (request): Promise<RoundsResponse> => listRounds(deps, request.query),
  );

  app.get('/rounds/current', async (request): Promise<CurrentRoundResponse> => getCurrentRound(deps, request.member));

  app.get<IdParams>('/rounds/:id', { schema: { params: idParams } }, async (request) => detail(request, request.params.id));

  app.post<{ Body: CreateRoundRequest }>(
    '/rounds',
    {
      preHandler: requireAdmin,
      schema: { body: { type: 'object', required: ['gameDay'], additionalProperties: false, properties: { gameDay: day } } },
    },
    async (request) => detail(request, await createRound(deps, request.member!, request.body.gameDay)),
  );

  app.patch<IdParams & { Body: UpdateRoundRequest }>(
    '/rounds/:id',
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            gameDay: day,
            confirmDropPicks: { type: 'boolean' },
            stake: money,
            totalOdds: money,
            payerMemberId: { type: ['integer', 'null'], minimum: 1, maximum: 255 },
          },
        },
      },
    },
    async (request) => {
      await updateRound(deps, request.params.id, request.body);
      return detail(request, request.params.id);
    },
  );

  app.delete<IdParams & { Body: DeleteRoundRequest }>(
    '/rounds/:id',
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['confirmNumber'],
          additionalProperties: false,
          properties: { confirmNumber: { type: 'integer' } },
        },
      },
    },
    async (request) => {
      await deleteRound(deps, request.member!, request.params.id, request.body.confirmNumber);
      return { ok: true };
    },
  );

  app.put<SlotParams & { Body: SetPickRequest }>(
    '/rounds/:id/picks/:slot',
    {
      preHandler: requireAdmin,
      schema: {
        params: slotParams,
        body: {
          type: 'object',
          required: ['playerId', 'line', 'direction'],
          additionalProperties: false,
          properties: {
            playerId: { type: 'integer', minimum: 1 },
            line: { type: 'number' },
            direction,
            odds: { type: ['number', 'null'] },
          },
        },
      },
    },
    async (request) => {
      await setPick(deps, request.params.id, request.params.slot, request.body);
      return detail(request, request.params.id);
    },
  );

  app.delete<SlotParams>(
    '/rounds/:id/picks/:slot',
    { preHandler: requireAdmin, schema: { params: slotParams } },
    async (request) => {
      await clearPick(deps, request.params.id, request.params.slot);
      return detail(request, request.params.id);
    },
  );

  app.post<IdParams>('/rounds/:id/lock', { preHandler: requireAdmin, schema: { params: idParams } }, async (request) => {
    await lockRound(deps, request.params.id, request.member!.id);
    return detail(request, request.params.id);
  });

  app.post<IdParams & { Body: UnlockRequest }>(
    '/rounds/:id/unlock',
    {
      preHandler: requireAdmin,
      schema: { params: idParams, body: { type: 'object', properties: { reason } } },
    },
    async (request) => {
      await unlockRound(deps, request.member!, request.params.id, request.body.reason);
      return detail(request, request.params.id);
    },
  );

  app.post<IdParams & { Body: CorrectionRequest }>(
    '/rounds/:id/corrections',
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['field', 'value'],
          additionalProperties: false,
          properties: {
            slot: { type: 'integer', minimum: 1, maximum: 4 },
            field: { type: 'string', enum: ['player', 'line', 'direction', 'odds', 'stake', 'totalOdds', 'payer'] },
            value: { type: ['number', 'string', 'null'] },
            reason,
            dryRun: { type: 'boolean' },
          },
        },
      },
    },
    async (request): Promise<CorrectionResponse> => {
      const res = await correctRound(deps, request.member!, request.params.id, request.body);
      return { ...res, round: await buildRoundDetail(deps, request.params.id, request.member) };
    },
  );

  app.post<SlotParams & { Body: ManualResolveRequest }>(
    '/rounds/:id/picks/:slot/resolve',
    {
      preHandler: requireAdmin,
      schema: {
        params: slotParams,
        body: {
          type: 'object',
          required: ['mode'],
          additionalProperties: false,
          properties: {
            mode: { type: 'string', enum: ['points', 'dnp', 'not_played'] },
            points: { type: 'integer', minimum: 0, maximum: 200 },
            reason,
          },
        },
      },
    },
    async (request) => {
      await manualResolve(deps, request.member!, request.params.id, request.params.slot, request.body);
      return detail(request, request.params.id);
    },
  );

  app.post<IdParams & { Body: ActualWinRequest }>(
    '/rounds/:id/actual-win',
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['amount'],
          additionalProperties: false,
          properties: { amount: { type: 'number', minimum: 0 }, reason },
        },
      },
    },
    async (request) => {
      await setActualWin(deps, request.member!, request.params.id, request.body.amount, request.body.reason);
      return detail(request, request.params.id);
    },
  );

  app.post<IdParams & { Body: CreateProposalRequest }>(
    '/rounds/:id/proposals',
    {
      preHandler: requireMember,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['kind', 'playerId', 'line', 'direction'],
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['personal', 'team'] },
            cooldownForMemberId: memberIdSchema,
            playerId: { type: 'integer', minimum: 1 },
            line: { type: 'number' },
            direction,
            comment: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (request) => {
      await createProposal(deps, request.member!, request.params.id, request.body);
      return detail(request, request.params.id);
    },
  );
}
