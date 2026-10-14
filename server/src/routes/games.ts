import type { FastifyInstance } from 'fastify';
import type { CreateGameRequest, GameDaysResponse, GamesResponse } from '../api-types.js';
import type { Deps } from '../deps.js';
import { requireAdmin } from '../http/auth.js';
import { createGame, listGameDays, listGames } from '../services/games.js';
import { day } from './schemas.js';

export async function registerGameRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/games/days', async (): Promise<GameDaysResponse> => ({ days: await listGameDays(deps) }));

  app.get<{ Querystring: { day: string } }>(
    '/games',
    { schema: { querystring: { type: 'object', required: ['day'], properties: { day } } } },
    async (request): Promise<GamesResponse> => ({ games: await listGames(deps, request.query.day) }),
  );

  app.post<{ Body: CreateGameRequest }>(
    '/games',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['homeClubCode', 'awayClubCode', 'scheduledAt'],
          additionalProperties: false,
          properties: {
            homeClubCode: { type: 'string', minLength: 1, maxLength: 8 },
            awayClubCode: { type: 'string', minLength: 1, maxLength: 8 },
            scheduledAt: { type: 'string', minLength: 10, maxLength: 40 },
          },
        },
      },
    },
    async (request) => ({ game: await createGame(deps, request.body) }),
  );
}
