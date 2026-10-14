import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Deps } from '../deps.js';
import { forbidden, unauthorized } from './errors.js';

export const SESSION_COOKIE = 'vc_session';
export const SESSION_DAYS = 30;

export interface SessionMember {
  id: number;
  name: string;
  displayName: string;
  username: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Logged-in member, or null for guests (set by the onRequest hook in app.ts). */
    member: SessionMember | null;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(deps: Deps, memberId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(deps.now().getTime() + SESSION_DAYS * 86_400_000);
  await deps.db.insertInto('sessions').values({ id: hashToken(token), member_id: memberId, expires_at: expiresAt }).execute();
  return { token, expiresAt };
}

export async function destroySession(deps: Deps, token: string): Promise<void> {
  await deps.db.deleteFrom('sessions').where('id', '=', hashToken(token)).execute();
}

export async function loadSessionMember(deps: Deps, token: string | undefined): Promise<SessionMember | null> {
  if (!token) return null;
  const row = await deps.db
    .selectFrom('sessions')
    .innerJoin('members', 'members.id', 'sessions.member_id')
    .select([
      'members.id',
      'members.name',
      'members.display_name',
      'members.username',
      'members.is_admin',
      'members.must_change_password',
      'sessions.expires_at',
    ])
    .where('sessions.id', '=', hashToken(token))
    .executeTakeFirst();
  if (!row || row.expires_at.getTime() <= deps.now().getTime()) return null;
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    username: row.username,
    isAdmin: row.is_admin === 1,
    mustChangePassword: row.must_change_password === 1,
  };
}

export function setSessionCookie(reply: FastifyReply, deps: Deps, token: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: deps.config.production,
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** preHandler: any logged-in member. */
export async function requireMember(request: FastifyRequest): Promise<void> {
  if (!request.member) throw unauthorized();
}

/** preHandler: the administrator. */
export async function requireAdmin(request: FastifyRequest): Promise<void> {
  if (!request.member) throw unauthorized();
  if (!request.member.isAdmin) throw forbidden();
}
