import type { FastifyInstance } from 'fastify';
import type {
  BlameResponse,
  MemberStatsResponse,
  MembersStatsResponse,
  OverviewResponse,
  SeasonsResponse,
  StatsQuery,
} from '../api-types.js';
import type { Deps } from '../deps.js';
import { getBlame, getMemberStats, getMembersStats, getOverview, listSeasons } from '../services/stats.js';
import { day, idParams } from './schemas.js';

const statsQuery = {
  type: 'object',
  properties: { season: { type: 'string', maxLength: 16 }, from: day, to: day },
} as const;

export async function registerStatsRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/stats/seasons', async (): Promise<SeasonsResponse> => listSeasons(deps));

  app.get<{ Querystring: StatsQuery }>(
    '/stats/overview',
    { schema: { querystring: statsQuery } },
    async (request): Promise<OverviewResponse> => ({ stats: await getOverview(deps, request.query) }),
  );

  app.get<{ Querystring: StatsQuery }>(
    '/stats/members',
    { schema: { querystring: statsQuery } },
    async (request): Promise<MembersStatsResponse> => ({ members: await getMembersStats(deps, request.query) }),
  );

  app.get<{ Params: { id: number }; Querystring: StatsQuery }>(
    '/stats/members/:id',
    { schema: { params: idParams, querystring: statsQuery } },
    async (request): Promise<MemberStatsResponse> => getMemberStats(deps, request.params.id, request.query),
  );

  app.get<{ Querystring: StatsQuery }>(
    '/stats/blame',
    { schema: { querystring: statsQuery } },
    async (request): Promise<BlameResponse> => ({ rows: await getBlame(deps, request.query) }),
  );
}
