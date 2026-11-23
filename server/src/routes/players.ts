import type { FastifyInstance } from 'fastify';
import type { CreatePlayerRequest, PlayerFormResponse, PlayerSearchResponse } from '../api-types.js';
import type { Deps } from '../deps.js';
import { requireAdmin } from '../http/auth.js';
import { getPlayerForm } from '../services/form.js';
import { createPlayer, getPlayer, searchPlayers } from '../services/players.js';
import { day } from './schemas.js';

export async function registerPlayerRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get<{ Querystring: { q: string; day?: string; roundId?: number } }>(
    '/players/search',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['q'],
          properties: { q: { type: 'string', maxLength: 100 }, day, roundId: { type: 'integer', minimum: 1 } },
        },
      },
    },
    async (request): Promise<PlayerSearchResponse> => ({ items: await searchPlayers(deps, request.query) }),
  );

  // FR-29: public, like the rest of the read-only views (BR-35).
  app.get<{ Params: { id: number } }>(
    '/players/:id/form',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } } },
    async (request): Promise<PlayerFormResponse> => {
      await getPlayer(deps, request.params.id); // 404 for an unknown player
      return { form: await getPlayerForm(deps, request.params.id) };
    },
  );

  app.post<{ Body: CreatePlayerRequest }>(
    '/players',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['firstName', 'lastName', 'clubCode'],
          additionalProperties: false,
          properties: {
            firstName: { type: 'string', maxLength: 64 },
            lastName: { type: 'string', maxLength: 64 },
            clubCode: { type: ['string', 'null'], maxLength: 8 },
            position: { type: ['string', 'null'], maxLength: 16 },
          },
        },
      },
    },
    async (request) => ({ player: await createPlayer(deps, request.body) }),
  );
}
