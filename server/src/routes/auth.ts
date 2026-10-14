import type { FastifyInstance } from 'fastify';
import type { ChangePasswordRequest, LoginRequest, MeResponse } from '../api-types.js';
import type { Deps } from '../deps.js';
import {
  clearSessionCookie,
  destroySession,
  hashToken,
  requireMember,
  SESSION_COOKIE,
  setSessionCookie,
} from '../http/auth.js';
import { changePassword, login, toMe } from '../services/auth.js';

export async function registerAuthRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.post<{ Body: LoginRequest }>(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          additionalProperties: false,
          properties: { username: { type: 'string', maxLength: 64 }, password: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (request, reply): Promise<MeResponse> => {
      const res = await login(deps, request.body.username, request.body.password);
      setSessionCookie(reply, deps, res.token, res.expiresAt);
      return { me: res.me };
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await destroySession(deps, token);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/auth/me', async (request): Promise<MeResponse> => ({ me: request.member ? toMe(request.member) : null }));

  app.post<{ Body: ChangePasswordRequest }>(
    '/auth/change-password',
    {
      preHandler: requireMember,
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          additionalProperties: false,
          properties: {
            currentPassword: { type: 'string', maxLength: 200 },
            newPassword: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (request): Promise<MeResponse> => {
      const token = request.cookies[SESSION_COOKIE];
      const me = await changePassword(
        deps,
        request.member!,
        request.body.currentPassword,
        request.body.newPassword,
        token ? hashToken(token) : null,
      );
      return { me };
    },
  );
}
