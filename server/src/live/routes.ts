import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { Deps } from '../deps.js';
import type { BusEvent } from './bus.js';

export const SSE_PING_MS = 25_000;

/** GET /api/live/stream — Server-Sent Events: `round` and `live` bus events plus a `ping` keep-alive. Public. */
export async function registerLiveRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const open = new Set<ServerResponse>();
  app.addHook('onClose', async () => {
    for (const r of open) r.end();
    open.clear();
  });

  app.get('/live/stream', (request, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    res.write('retry: 5000\n\n');
    res.write(`event: ping\ndata: ${JSON.stringify({ at: deps.now().toISOString() })}\n\n`);

    open.add(res);

    const send = (event: BusEvent): void => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    };
    const unsubscribe = deps.bus.subscribe(send);
    const ping = setInterval(() => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ping\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    }, SSE_PING_MS);
    ping.unref?.();

    let closed = false;
    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      open.delete(res);
      clearInterval(ping);
      unsubscribe();
    };
    request.raw.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  });
}
