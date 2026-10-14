import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { Deps } from './deps.js';
import { HttpError } from './http/errors.js';
import { loadSessionMember, SESSION_COOKIE } from './http/auth.js';
import { registerRoutes } from './routes/index.js';
import { registerLiveRoutes } from './live/routes.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PASSWORD_CHANGE_ALLOWED = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/change-password']);

export async function buildApp(deps: Deps, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: true,
    bodyLimit: 1_000_000,
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
    hsts: deps.config.production ? { maxAge: 15_552_000 } : false,
  });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  app.decorateRequest('member', null);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    if (!request.url.startsWith('/api/')) return;
    // CSRF: SameSite=Lax cookies + a custom header that cross-site forms cannot set.
    if (MUTATING.has(request.method) && request.headers['x-requested-with'] !== 'vc') {
      throw new HttpError(403, 'csrf', 'Nedostaje zaglavlje X-Requested-With.');
    }
    request.member = await loadSessionMember(deps, request.cookies[SESSION_COOKIE]);
    // REQ-01.3: until the initial/temporary password is changed, only auth actions are allowed.
    if (
      request.member?.mustChangePassword &&
      MUTATING.has(request.method) &&
      !PASSWORD_CHANGE_ALLOWED.has(request.url.split('?')[0]!)
    ) {
      throw new HttpError(403, 'password_change_required', 'Pre nastavka morate promeniti lozinku.');
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    const err = error as { validation?: unknown; statusCode?: number; code?: string; message: string };
    if (err.validation) {
      return reply.status(400).send({ error: { code: 'validation', message: err.message, details: err.validation } });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: err.code ?? 'error', message: err.message } });
    }
    request.log.error(error);
    return reply.status(500).send({ error: { code: 'internal', message: 'Greška na serveru.' } });
  });

  app.get('/api/health', async () => ({ ok: true }));

  await app.register(async (api) => {
    await registerRoutes(api, deps);
    await registerLiveRoutes(api, deps);
  }, { prefix: '/api' });

  const publicDir = deps.config.publicDir;
  if (publicDir && existsSync(publicDir)) {
    await app.register(fastifyStatic, { root: publicDir, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.method !== 'GET') {
        return reply.status(404).send({ error: { code: 'not_found', message: 'Nije pronađeno.' } });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
