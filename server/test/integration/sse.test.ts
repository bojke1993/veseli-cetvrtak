import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { createTestDeps, type TestDeps } from '../helpers/deps.js';

let deps: TestDeps | null = null;
let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  await deps?.t.destroy();
  app = null;
  deps = null;
});

/** Reads the SSE stream until `predicate` matches the accumulated text (or times out). */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (text: string) => boolean,
  timeoutMs = 5000,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;
  while (!predicate(text)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Timeout; received so far:\n${text}`);
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout; received:\n${text}`)), remaining)),
    ]);
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text;
}

describe('GET /api/live/stream', () => {
  it('streams bus events to anonymous clients and unsubscribes on close', async () => {
    deps = await createTestDeps();
    app = await buildApp(deps);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('no address');

    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${address.port}/api/live/stream`, { signal: controller.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(res.headers.get('cache-control')).toContain('no-cache');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    const reader = res.body!.getReader();

    let text = await readUntil(reader, (t) => t.includes('event: ping'));
    expect(text).toContain('retry: 5000');

    deps.bus.roundChanged(7);
    deps.bus.publish({
      type: 'live',
      data: {
        roundId: 7,
        picks: [
          {
            slot: 1,
            live: { points: 12, secondsPlayed: 600, fouls: 2, status: 'sure_hit', pointsNeeded: null, updatedAt: null },
          },
        ],
      },
    });
    text = await readUntil(reader, (t) => t.includes('event: live'));
    expect(text).toContain('event: round\ndata: {"roundId":7}\n\n');
    const liveBlock = text.slice(text.indexOf('event: live'));
    const data = JSON.parse(/data: (.*)\n/.exec(liveBlock)![1]!);
    expect(data).toMatchObject({ roundId: 7, picks: [{ slot: 1, live: { points: 12, status: 'sure_hit' } }] });

    controller.abort();
    await reader.cancel().catch(() => undefined);
    // The server notices the disconnect and removes its bus listener.
    const emitter = (deps.bus as unknown as { emitter: { listenerCount(e: string): number } }).emitter;
    const deadline = Date.now() + 3000;
    while (emitter.listenerCount('event') > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(emitter.listenerCount('event')).toBe(0);
  });
});
