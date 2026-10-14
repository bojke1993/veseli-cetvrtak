import type { FastifyInstance } from 'fastify';
import type { Deps } from '../deps.js';
import { registerAdminRoutes } from './admin.js';
import { registerAuditRoutes } from './audit.js';
import { registerAuthRoutes } from './auth.js';
import { registerGameRoutes } from './games.js';
import { registerImportRoutes } from './import.js';
import { registerMemberRoutes } from './members.js';
import { registerPlayerRoutes } from './players.js';
import { registerProposalRoutes } from './proposals.js';
import { registerRoundRoutes } from './rounds.js';
import { registerStatsRoutes } from './stats.js';

/** Registers all REST routes under /api (docs/design.md §6). */
export async function registerRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  await registerAuthRoutes(app, deps);
  await registerMemberRoutes(app, deps);
  await registerPlayerRoutes(app, deps);
  await registerGameRoutes(app, deps);
  await registerRoundRoutes(app, deps);
  await registerProposalRoutes(app, deps);
  await registerStatsRoutes(app, deps);
  await registerAuditRoutes(app, deps);
  await registerAdminRoutes(app, deps);
  await registerImportRoutes(app, deps);
}
