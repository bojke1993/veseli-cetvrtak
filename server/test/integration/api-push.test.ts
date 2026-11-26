import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { isAllowedPushEndpoint } from '../../src/chat/routes.js';
import type { PushSender } from '../../src/chat/push.js';
import { Watchers } from '../../src/chat/push.js';
import { createTestDeps } from '../helpers/deps.js';
import { api, type ApiCtx } from './api-helpers.js';

const sub = (n: number) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
  keys: { p256dh: `BPkey-${n}-xxxxxxxxxxxx`, auth: `auth-${n}-xx` },
});

describe('API: Web Push for chat (BR-41, P-28)', () => {
  let ctx: ApiCtx;
  const calls: Array<{ endpoint: string; payload: { title: string; body: string; url: string } }> = [];
  const failFor = new Map<string, number>();
  const sender: PushSender = vi.fn(async (target, payload, vapid) => {
    expect(vapid.publicKey).toBeTruthy();
    expect(vapid.subject).toMatch(/^https:|^mailto:/);
    const status = failFor.get(target.endpoint);
    if (status) throw Object.assign(new Error('push failed'), { statusCode: status });
    calls.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
  });

  beforeAll(async () => {
    const deps = await createTestDeps();
    await deps.db.updateTable('members').set({ must_change_password: 0 }).execute();
    const app = await buildApp(deps, { chat: { pushSender: sender } });
    ctx = {
      deps,
      app,
      cookies: new Map(),
      async close() {
        await app.close();
        await deps.t.destroy();
      },
    };
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(() => {
    calls.length = 0;
    failFor.clear();
  });

  /** Pushes are sent after the response; wait until the sender has settled. */
  const settle = () => new Promise((r) => setTimeout(r, 150));

  it('is closed to guests', async () => {
    for (const [method, url, body] of [
      ['GET', '/push/key', undefined],
      ['POST', '/push/subscribe', sub(1)],
      ['POST', '/push/unsubscribe', { endpoint: sub(1).endpoint }],
      ['POST', '/push/status', { endpoint: sub(1).endpoint }],
      ['POST', '/push/test', {}],
      ['POST', '/chat/visibility', { clientId: 'a', visible: true }],
    ] as const) {
      expect((await api(ctx, null, method, url, body)).status, `${method} ${url}`).toBe(401);
    }
  });

  it('generates one VAPID key pair and keeps it', async () => {
    const a = await api(ctx, 'tozislav', 'GET', '/push/key');
    const b = await api(ctx, 'simara', 'GET', '/push/key');
    expect(a.status).toBe(200);
    expect(a.body.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(b.body.publicKey).toBe(a.body.publicKey);
  });

  it('subscribes devices, pushes new messages to the others and skips members looking at the app', async () => {
    expect((await api(ctx, 'tozislav', 'POST', '/push/subscribe', sub(1))).status).toBe(200);
    expect((await api(ctx, 'simara', 'POST', '/push/subscribe', sub(2))).status).toBe(200);
    expect((await api(ctx, 'lakicevic', 'POST', '/push/subscribe', sub(3))).status).toBe(200);
    // Re-subscribing the same device is idempotent.
    expect((await api(ctx, 'lakicevic', 'POST', '/push/subscribe', sub(3))).status).toBe(200);
    expect((await api(ctx, 'simara', 'POST', '/push/status', { endpoint: sub(2).endpoint })).body).toEqual({ subscribed: true });
    expect((await api(ctx, 'tozislav', 'POST', '/push/status', { endpoint: sub(2).endpoint })).body).toEqual({ subscribed: false });

    // Lakićević has the app open and visible.
    await api(ctx, 'lakicevic', 'POST', '/chat/visibility', { clientId: 'tab-1', visible: true });

    await api(ctx, 'tozislav', 'POST', '/chat/messages', { body: 'Larkin više 12,5? 🔥' });
    await settle();
    expect(calls).toEqual([
      { endpoint: sub(2).endpoint, payload: { title: '💬 Tozislav', body: 'Larkin više 12,5? 🔥', url: '/chat', tag: 'vc-chat' } },
    ]);

    // Once the tab is hidden, Lakićević gets pushes too.
    calls.length = 0;
    await api(ctx, 'lakicevic', 'POST', '/chat/visibility', { clientId: 'tab-1', visible: false });
    await api(ctx, 'simara', 'POST', '/chat/messages', { body: 'x'.repeat(300) });
    await settle();
    expect(calls.map((c) => c.endpoint).sort()).toEqual([sub(1).endpoint, sub(3).endpoint]);
    expect(calls[0]!.payload.body).toHaveLength(181);
  });

  it('drops subscriptions the push service reports as gone; test push goes to own devices', async () => {
    failFor.set(sub(1).endpoint, 410);
    await api(ctx, 'simara', 'POST', '/chat/messages', { body: 'Ima li koga?' });
    await settle();
    expect((await api(ctx, 'tozislav', 'POST', '/push/status', { endpoint: sub(1).endpoint })).body).toEqual({ subscribed: false });

    calls.length = 0;
    const test = await api(ctx, 'simara', 'POST', '/push/test', {});
    expect(test.body).toEqual({ sent: 1 });
    expect(calls.map((c) => c.endpoint)).toEqual([sub(2).endpoint]);
  });

  it('unsubscribes only the own device and refuses unknown push hosts', async () => {
    await api(ctx, 'tozislav', 'POST', '/push/unsubscribe', { endpoint: sub(2).endpoint });
    expect((await api(ctx, 'simara', 'POST', '/push/status', { endpoint: sub(2).endpoint })).body).toEqual({ subscribed: true });
    await api(ctx, 'simara', 'POST', '/push/unsubscribe', { endpoint: sub(2).endpoint });
    expect((await api(ctx, 'simara', 'POST', '/push/status', { endpoint: sub(2).endpoint })).body).toEqual({ subscribed: false });

    const bad = await api(ctx, 'simara', 'POST', '/push/subscribe', { ...sub(9), endpoint: 'https://169.254.169.254/latest' });
    expect(bad.status).toBe(422);
  });
});

describe('push helpers', () => {
  it('allows only known browser push services over https', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/QGx')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isAllowedPushEndpoint('https://wns2-db5p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://evilgoogleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://localhost/x')).toBe(false);
    expect(isAllowedPushEndpoint('nije url')).toBe(false);
  });

  it('a member is watching while any tab sent a fresh visible heartbeat', () => {
    const w = new Watchers(1000);
    expect(w.isWatching(1, 0)).toBe(false);
    w.set(1, 'a', true, 0);
    w.set(1, 'b', true, 500);
    expect(w.isWatching(1, 900)).toBe(true);
    w.set(1, 'b', false, 900);
    expect(w.isWatching(1, 900)).toBe(true);
    expect(w.isWatching(1, 1200)).toBe(false);
  });
});
