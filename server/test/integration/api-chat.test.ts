import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { TEST_PASSWORD } from '../helpers/db.js';
import { createTestDeps, type TestDeps } from '../helpers/deps.js';
import { ADMIN, api, createApiCtx, type ApiCtx } from './api-helpers.js';

describe('API: chat (BR-41, REQ-44)', () => {
  let ctx: ApiCtx;
  beforeAll(async () => {
    ctx = await createApiCtx();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('is closed to guests', async () => {
    for (const [method, url, body] of [
      ['GET', '/chat/messages', undefined],
      ['GET', '/chat/state', undefined],
      ['GET', '/chat/stream', undefined],
      ['POST', '/chat/messages', { body: 'zdravo' }],
      ['POST', '/chat/read', { id: 1 }],
      ['DELETE', '/chat/messages/1', undefined],
    ] as const) {
      expect((await api(ctx, null, method, url, body)).status, `${method} ${url}`).toBe(401);
    }
  });

  it('sends, lists oldest first with paging, counts unread and marks read', async () => {
    const first = await api(ctx, 'tozislav', 'POST', '/chat/messages', { body: '  Ćao ekipo 🔥\n ' });
    expect(first.status).toBe(200);
    expect(first.body.message).toMatchObject({ memberId: 2, body: 'Ćao ekipo 🔥' });
    expect((await api(ctx, 'tozislav', 'POST', '/chat/messages', { body: '   ' })).status).toBe(422);
    expect((await api(ctx, 'tozislav', 'POST', '/chat/messages', { body: 'x'.repeat(1001) })).status).toBe(422);

    ctx.deps.setNow('2026-10-15T10:01:00Z');
    await api(ctx, 'lakicevic', 'POST', '/chat/messages', { body: 'Larkin više 12,5' });
    await api(ctx, 'tozislav', 'POST', '/chat/messages', { body: 'Može' });

    const all = await api(ctx, 'simara', 'GET', '/chat/messages');
    expect(all.body.messages.map((m: { body: string }) => m.body)).toEqual(['Ćao ekipo 🔥', 'Larkin više 12,5', 'Može']);
    expect(all.body.hasMore).toBe(false);

    const page = await api(ctx, 'simara', 'GET', '/chat/messages?limit=2');
    expect(page.body.messages.map((m: { body: string }) => m.body)).toEqual(['Larkin više 12,5', 'Može']);
    expect(page.body.hasMore).toBe(true);
    const older = await api(ctx, 'simara', 'GET', `/chat/messages?limit=2&before=${page.body.messages[0].id}`);
    expect(older.body.messages.map((m: { body: string }) => m.body)).toEqual(['Ćao ekipo 🔥']);
    expect(older.body.hasMore).toBe(false);

    // Unread counts only other members' messages; the author's own sending marks them read.
    expect((await api(ctx, 'simara', 'GET', '/chat/state')).body.unread).toBe(3);
    expect((await api(ctx, 'tozislav', 'GET', '/chat/state')).body.unread).toBe(0);
    expect((await api(ctx, 'lakicevic', 'GET', '/chat/state')).body.unread).toBe(1);

    const lastId = all.body.messages[2].id;
    const read = await api(ctx, 'simara', 'POST', '/chat/read', { id: lastId });
    expect(read.body).toMatchObject({ unread: 0, readId: lastId });
    // The marker never moves back.
    expect((await api(ctx, 'simara', 'POST', '/chat/read', { id: 1 })).body.readId).toBe(lastId);
    expect(read.body.presence).toHaveLength(4);
  });

  it('author deletes own message, others cannot, admin can (audited)', async () => {
    const mine = (await api(ctx, 'simara', 'POST', '/chat/messages', { body: 'greška' })).body.message.id;
    const other = (await api(ctx, 'lakicevic', 'POST', '/chat/messages', { body: 'neprimereno' })).body.message.id;

    expect((await api(ctx, 'tozislav', 'DELETE', `/chat/messages/${mine}`)).status).toBe(403);
    expect((await api(ctx, 'simara', 'DELETE', `/chat/messages/${mine}`)).status).toBe(204);
    expect((await api(ctx, 'simara', 'DELETE', `/chat/messages/${mine}`)).status).toBe(404);
    expect((await api(ctx, ADMIN, 'DELETE', `/chat/messages/${other}`)).status).toBe(204);

    const bodies = (await api(ctx, 'simara', 'GET', '/chat/messages')).body.messages.map((m: { body: string }) => m.body);
    expect(bodies).not.toContain('greška');
    expect(bodies).not.toContain('neprimereno');
    const audit = await ctx.deps.db.selectFrom('audit_log').selectAll().where('action', '=', 'chat_delete').execute();
    expect(audit).toHaveLength(1);
    expect(audit[0]!.entity_id).toBe(String(other));
  });

  it('limits a member to 5 messages per 10 s', async () => {
    ctx.deps.setNow('2026-10-15T11:00:00Z');
    for (let k = 0; k < 5; k++) {
      expect((await api(ctx, 'simara', 'POST', '/chat/messages', { body: `poruka ${k}` })).status).toBe(200);
    }
    const blocked = await api(ctx, 'simara', 'POST', '/chat/messages', { body: 'još jedna' });
    expect(blocked.status).toBe(429);
    expect((await api(ctx, 'tozislav', 'POST', '/chat/messages', { body: 'ja mogu' })).status).toBe(200);
    ctx.deps.setNow('2026-10-15T11:00:11Z');
    expect((await api(ctx, 'simara', 'POST', '/chat/messages', { body: 'sad može' })).status).toBe(200);
  });
});

/** Reads an SSE stream until `predicate` matches the accumulated text. */
async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, predicate: (text: string) => boolean, timeoutMs = 5000) {
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;
  while (!predicate(text)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Timeout; received:\n${text}`);
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout; received:\n${text}`)), remaining)),
    ]);
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text;
}

function lastEvent(text: string, name: string): any {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  return JSON.parse(blocks[blocks.length - 1]!.split('\ndata: ')[1]!);
}

describe('GET /api/chat/stream (presence)', () => {
  let deps: TestDeps | null = null;
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    await app?.close();
    await deps?.t.destroy();
    app = null;
    deps = null;
  });

  it('streams messages and shows who is online, going offline after the grace period', async () => {
    deps = await createTestDeps();
    await deps.db.updateTable('members').set({ must_change_password: 0 }).execute();
    app = await buildApp(deps, { chat: { presenceGraceMs: 150 } });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('no address');
    const base = `http://127.0.0.1:${address.port}/api`;

    const cookieFor = async (username: string) => {
      const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'vc' },
        body: JSON.stringify({ username, password: TEST_PASSWORD }),
      });
      return res.headers.get('set-cookie')!.split(';')[0]!;
    };
    const toz = await cookieFor('tozislav');
    const sim = await cookieFor('simara');

    const tozAbort = new AbortController();
    const tozRes = await fetch(`${base}/chat/stream`, { headers: { cookie: toz }, signal: tozAbort.signal });
    expect(tozRes.status).toBe(200);
    const tozReader = tozRes.body!.getReader();
    let tozText = await readUntil(tozReader, (t) => t.includes('event: presence'));
    expect(lastEvent(tozText, 'presence').presence.find((p: any) => p.memberId === 2).online).toBe(true);

    const simAbort = new AbortController();
    const simRes = await fetch(`${base}/chat/stream`, { headers: { cookie: sim }, signal: simAbort.signal });
    const simReader = simRes.body!.getReader();
    await readUntil(simReader, (t) => t.includes('event: presence'));
    tozText = await readUntil(tozReader, (t) => (t.match(/event: presence/g) ?? []).length >= 2);
    expect(lastEvent(tozText, 'presence').presence.filter((p: any) => p.online).map((p: any) => p.memberId)).toEqual([2, 4]);

    const sent = await fetch(`${base}/chat/messages`, {
      method: 'POST',
      headers: { cookie: sim, 'content-type': 'application/json', 'x-requested-with': 'vc' },
      body: JSON.stringify({ body: 'Ko igra večeras?' }),
    });
    expect(sent.status).toBe(200);
    tozText = await readUntil(tozReader, (t) => t.includes('event: message'));
    expect(lastEvent(tozText, 'message')).toMatchObject({ memberId: 4, body: 'Ko igra večeras?' });

    simAbort.abort();
    await simReader.cancel().catch(() => undefined);
    tozText = await readUntil(tozReader, (t) => {
      const blocks = t.split('\n\n').filter((b) => b.startsWith('event: presence\n'));
      if (blocks.length === 0) return false;
      const last = JSON.parse(blocks[blocks.length - 1]!.split('\ndata: ')[1]!);
      return last.presence.find((p: any) => p.memberId === 4).online === false;
    });
    const simara = lastEvent(tozText, 'presence').presence.find((p: any) => p.memberId === 4);
    expect(simara.lastSeenAt).toBe('2026-10-15T10:00:00.000Z');

    tozAbort.abort();
    await tozReader.cancel().catch(() => undefined);
  });
});
