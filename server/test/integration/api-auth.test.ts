import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_PASSWORD } from '../helpers/db.js';
import { ADMIN, api, createApiCtx, login, type ApiCtx } from './api-helpers.js';

describe('API: auth, guests, CSRF, members', () => {
  let ctx: ApiCtx;
  beforeAll(async () => {
    ctx = await createApiCtx({ mustChangeFor: ['tozislav', 'lakicevic'] });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('GET /auth/me returns null for guests', async () => {
    const r = await api(ctx, null, 'GET', '/auth/me');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ me: null });
  });

  it('logs in and returns me with a session cookie', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-requested-with': 'vc' },
      payload: { username: 'Tozislav', password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().me).toMatchObject({ memberId: 2, isAdmin: false, mustChangePassword: true });
    const cookie = res.cookies.find((c) => c.name === 'vc_session');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `vc_session=${cookie!.value}` } });
    expect(me.json().me.username).toBe('tozislav');
  });

  it('blocks mutations until the initial password is changed (REQ-01.3)', async () => {
    const blocked = await api(ctx, 'lakicevic', 'PATCH', '/members/3', { displayName: 'Laki' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('password_change_required');
    expect((await api(ctx, 'lakicevic', 'GET', '/rounds')).status).toBe(200);
    const changed = await api(ctx, 'lakicevic', 'POST', '/auth/change-password', {
      currentPassword: TEST_PASSWORD,
      newPassword: 'laki-nova-lozinka',
    });
    expect(changed.status).toBe(200);
    // Members may edit their own profile, but not someone else's.
    const own = await api(ctx, 'lakicevic', 'PATCH', '/members/3', { displayName: 'Laki' });
    expect(own.status).toBe(200);
    expect(own.body.member.displayName).toBe('Laki');
    expect((await api(ctx, 'lakicevic', 'PATCH', '/members/4', { displayName: 'X' })).status).toBe(403);
    // Restore the shared test password for the following tests.
    await api(ctx, 'lakicevic', 'POST', '/auth/change-password', { currentPassword: 'laki-nova-lozinka', newPassword: TEST_PASSWORD });
  });

  it('uses the same generic message for unknown user and wrong password', async () => {
    const a = await api(ctx, null, 'POST', '/auth/login', { username: 'nobody', password: 'x' });
    const b = await api(ctx, null, 'POST', '/auth/login', { username: 'simara', password: 'wrong' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('locks the account after 5 failures within 15 minutes', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await api(ctx, null, 'POST', '/auth/login', { username: 'lakicevic', password: 'wrong' });
      expect(r.status).toBe(401);
    }
    const fifth = await api(ctx, null, 'POST', '/auth/login', { username: 'lakicevic', password: 'wrong' });
    expect(fifth.status).toBe(429);
    // Even the right password is refused while locked.
    const locked = await api(ctx, null, 'POST', '/auth/login', { username: 'lakicevic', password: TEST_PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.error.message).toMatch(/blokiran/);
    // After 15 minutes it works again.
    const t0 = ctx.deps.now();
    ctx.deps.setNow(new Date(t0.getTime() + 16 * 60_000));
    const ok = await api(ctx, null, 'POST', '/auth/login', { username: 'lakicevic', password: TEST_PASSWORD });
    expect(ok.status).toBe(200);
    ctx.deps.setNow(t0);
  });

  it('rejects mutations without the CSRF header', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: ADMIN, password: TEST_PASSWORD } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('csrf');
  });

  it('guests can read but not mutate; audit requires login', async () => {
    for (const url of ['/members', '/rounds', '/rounds/current', '/games/days', '/stats/overview', '/stats/members', '/stats/blame', '/stats/seasons', '/players/search?q=ab']) {
      const r = await api(ctx, null, 'GET', url);
      expect(r.status, url).toBe(200);
    }
    expect((await api(ctx, null, 'GET', '/audit')).status).toBe(401);
    expect((await api(ctx, null, 'GET', '/admin/tasks')).status).toBe(401);
    expect((await api(ctx, null, 'POST', '/rounds', { gameDay: '2026-10-15' })).status).toBe(401);
    expect((await api(ctx, null, 'POST', '/proposals/1/vote')).status).toBe(401);
    expect((await api(ctx, 'simara', 'GET', '/audit')).status).toBe(200);
    expect((await api(ctx, 'simara', 'GET', '/admin/tasks')).status).toBe(403);
    expect((await api(ctx, 'simara', 'POST', '/rounds', { gameDay: '2026-10-15' })).status).toBe(403);
  });

  it('changes the password (current required, ≥ 10 chars)', async () => {
    const wrong = await api(ctx, 'simara', 'POST', '/auth/change-password', { currentPassword: 'nope', newPassword: 'abcdefghijk' });
    expect(wrong.status).toBe(422);
    const short = await api(ctx, 'simara', 'POST', '/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'short' });
    expect(short.status).toBe(422);
    const ok = await api(ctx, 'simara', 'POST', '/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'nova-lozinka-1' });
    expect(ok.status).toBe(200);
    expect(ok.body.me.mustChangePassword).toBe(false);
    // Current session survives; new password works.
    expect((await api(ctx, 'simara', 'GET', '/auth/me')).body.me.memberId).toBe(4);
    await login(ctx, 'simara', 'nova-lozinka-1');
  });

  it('admin resets a password: temporary password, sessions ended, audit', async () => {
    const before = ctx.cookies.get('simara')!;
    const r = await api(ctx, ADMIN, 'POST', '/members/4/reset-password');
    expect(r.status).toBe(200);
    expect(typeof r.body.temporaryPassword).toBe('string');
    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `vc_session=${before}` } });
    expect(me.json().me).toBeNull();
    ctx.cookies.delete('simara');
    const relog = await api(ctx, null, 'POST', '/auth/login', { username: 'simara', password: r.body.temporaryPassword });
    expect(relog.body.me.mustChangePassword).toBe(true);
    const audit = await api(ctx, ADMIN, 'GET', '/audit');
    expect(audit.body.items.some((a: any) => a.action === 'password_reset' && a.entityId === '4')).toBe(true);
    expect(JSON.stringify(audit.body.items)).not.toContain(r.body.temporaryPassword);
  });

  it('logout ends the session', async () => {
    const cookie = await login(ctx, 'tozislav');
    const out = await api(ctx, 'tozislav', 'POST', '/auth/logout');
    expect(out.status).toBe(200);
    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `vc_session=${cookie}` } });
    expect(me.json().me).toBeNull();
    ctx.cookies.delete('tozislav');
  });

  it('lists members with status and lets the admin edit and transfer the role', async () => {
    const list = await api(ctx, null, 'GET', '/members');
    expect(list.body.members.map((m: any) => m.name)).toEqual(['Ivanišević', 'Tozislav', 'Lakićević', 'Simara']);
    expect(list.body.members[0].status).toEqual({ streak: 0, hasFire: false, onCooldown: false });

    const patch = await api(ctx, ADMIN, 'PATCH', '/members/2', { displayName: 'Toza', avatarUrl: 'https://x.y/a.png' });
    expect(patch.status).toBe(200);
    expect(patch.body.member).toMatchObject({ name: 'Tozislav', displayName: 'Toza', avatarUrl: 'https://x.y/a.png' });
    expect((await api(ctx, ADMIN, 'PATCH', '/members/2', { avatarUrl: 'javascript:alert(1)' })).status).toBe(422);

    const tr = await api(ctx, ADMIN, 'POST', '/members/3/transfer-admin');
    expect(tr.status).toBe(200);
    expect(tr.body.members.filter((m: any) => m.isAdmin).map((m: any) => m.id)).toEqual([3]);
    // Old admin lost rights immediately.
    expect((await api(ctx, ADMIN, 'POST', '/members/1/transfer-admin')).status).toBe(403);
    const audit = await api(ctx, 'lakicevic', 'GET', '/audit?actor=1');
    expect(audit.body.items.some((a: any) => a.action === 'admin_transfer' && a.newValue === 3)).toBe(true);
    // Transfer back for later tests.
    expect((await api(ctx, 'lakicevic', 'POST', '/members/1/transfer-admin')).status).toBe(200);
  });
});
