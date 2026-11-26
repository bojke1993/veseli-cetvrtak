import type { ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import type { FastifyInstance } from 'fastify';
import type {
  ChatMessagesResponse,
  ChatStateResponse,
  ChatVisibilityRequest,
  PushEndpointRequest,
  PushKeyResponse,
  PushStatusResponse,
  PushSubscribeRequest,
  PushTestResponse,
  MarkChatReadRequest,
  SendChatMessageRequest,
  SendChatMessageResponse,
} from '../api-types.js';
import type { Deps } from '../deps.js';
import { requireMember } from '../http/auth.js';
import { HttpError } from '../http/errors.js';
import { SSE_PING_MS } from '../live/routes.js';
import { idParams, type IdParams } from '../routes/schemas.js';
import { Presence, PRESENCE_GRACE_MS } from './presence.js';
import {
  chatPayload,
  deleteSubscription,
  getVapidKeys,
  hasSubscription,
  pushToMembers,
  saveSubscription,
  Watchers,
  webPushSender,
  type PushResult,
  type PushSender,
} from './push.js';
import {
  CHAT_MAX_LENGTH,
  CHAT_PAGE_SIZE,
  deleteMessage,
  listMessages,
  markRead,
  presenceList,
  sendMessage,
  setLastSeen,
  unreadState,
} from './service.js';

/** BR-41: at most this many messages per member within the window. */
export const CHAT_RATE_LIMIT = 5;
export const CHAT_RATE_WINDOW_MS = 10_000;

type ChatEvent = { type: 'message' | 'delete' | 'presence'; data: unknown };

export interface ChatRouteOptions {
  /** Tests shorten the offline grace period. */
  presenceGraceMs?: number;
  /** Tests replace the real Web Push sender. */
  pushSender?: PushSender;
}

/** Push services of the browsers we support; other endpoints are refused (no requests to arbitrary hosts). */
const PUSH_HOSTS = ['googleapis.com', 'push.apple.com', 'mozilla.com', 'notify.windows.com'];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const endpointSchema = { type: 'string', minLength: 10, maxLength: 700 } as const;

/** BR-41 / FR-31: members-only chat — REST under /chat and an SSE stream with messages and presence. */
export async function registerChatRoutes(app: FastifyInstance, deps: Deps, opts: ChatRouteOptions = {}): Promise<void> {
  const hub = new EventEmitter();
  hub.setMaxListeners(0);
  const publish = (event: ChatEvent): void => {
    hub.emit('event', event);
  };

  const broadcastPresence = async (): Promise<void> => {
    publish({ type: 'presence', data: { presence: await presenceList(deps, (id) => presence.isOnline(id)) } });
  };
  const presence = new Presence((memberId, online) => {
    void (async () => {
      if (!online) await setLastSeen(deps, memberId);
      await broadcastPresence();
    })().catch((err: unknown) => app.log.error(err));
  }, opts.presenceGraceMs ?? PRESENCE_GRACE_MS);

  const open = new Set<ServerResponse>();
  app.addHook('onClose', async () => {
    presence.close();
    for (const r of open) r.end();
    open.clear();
  });

  const sent = new Map<number, number[]>();
  const checkRate = (memberId: number): void => {
    const now = deps.now().getTime();
    const recent = (sent.get(memberId) ?? []).filter((t) => now - t < CHAT_RATE_WINDOW_MS);
    if (recent.length >= CHAT_RATE_LIMIT) {
      throw new HttpError(429, 'rate_limited', 'Polako — previše poruka za kratko vreme. Pokušajte za par sekundi.');
    }
    recent.push(now);
    sent.set(memberId, recent);
  };

  const pushSender = opts.pushSender ?? webPushSender;
  const watchers = new Watchers();
  const logPush = (r: PushResult): void => {
    for (const err of r.errors) app.log.warn({ err }, 'web push failed');
  };

  const state = async (memberId: number): Promise<ChatStateResponse> => ({
    presence: await presenceList(deps, (id) => presence.isOnline(id)),
    ...(await unreadState(deps, memberId)),
  });

  app.get<{ Querystring: { before?: number; limit?: number } }>(
    '/chat/messages',
    {
      preHandler: requireMember,
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            before: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request): Promise<ChatMessagesResponse> =>
      listMessages(deps, request.query.before, request.query.limit ?? CHAT_PAGE_SIZE),
  );

  app.post<{ Body: SendChatMessageRequest }>(
    '/chat/messages',
    {
      preHandler: requireMember,
      schema: {
        body: {
          type: 'object',
          required: ['body'],
          additionalProperties: false,
          // Raw length may include whitespace that gets trimmed; the service enforces the real limit.
          properties: { body: { type: 'string', minLength: 1, maxLength: CHAT_MAX_LENGTH * 2 } },
        },
      },
    },
    async (request): Promise<SendChatMessageResponse> => {
      const member = request.member!;
      checkRate(member.id);
      const message = await sendMessage(deps, member, request.body.body);
      // The author has obviously read everything up to their own message.
      await markRead(deps, member.id, message.id);
      publish({ type: 'message', data: message });
      // P-28: push to the other members who are not looking at the app right now.
      const now = deps.now().getTime();
      void deps.db
        .selectFrom('members')
        .select('id')
        .execute()
        .then((rows) => {
          const others = rows.map((r) => r.id).filter((id) => id !== member.id && !watchers.isWatching(id, now));
          return pushToMembers(deps, pushSender, others, chatPayload(message, member.displayName));
        })
        .then(logPush)
        .catch((err: unknown) => app.log.error(err));
      return { message };
    },
  );

  app.delete<IdParams>(
    '/chat/messages/:id',
    { preHandler: requireMember, schema: { params: idParams } },
    async (request, reply) => {
      await deleteMessage(deps, request.member!, request.params.id);
      publish({ type: 'delete', data: { id: request.params.id } });
      return reply.status(204).send();
    },
  );

  app.get('/chat/state', { preHandler: requireMember }, async (request): Promise<ChatStateResponse> => state(request.member!.id));

  app.post<{ Body: MarkChatReadRequest }>(
    '/chat/read',
    {
      preHandler: requireMember,
      schema: {
        body: {
          type: 'object',
          required: ['id'],
          additionalProperties: false,
          properties: { id: { type: 'integer', minimum: 0 } },
        },
      },
    },
    async (request): Promise<ChatStateResponse> => {
      await markRead(deps, request.member!.id, request.body.id);
      return state(request.member!.id);
    },
  );

  app.post<{ Body: ChatVisibilityRequest }>(
    '/chat/visibility',
    {
      preHandler: requireMember,
      schema: {
        body: {
          type: 'object',
          required: ['clientId', 'visible'],
          additionalProperties: false,
          properties: { clientId: { type: 'string', minLength: 1, maxLength: 64 }, visible: { type: 'boolean' } },
        },
      },
    },
    async (request) => {
      watchers.set(request.member!.id, request.body.clientId, request.body.visible, deps.now().getTime());
      return { ok: true };
    },
  );

  app.get('/push/key', { preHandler: requireMember }, async (): Promise<PushKeyResponse> => ({
    publicKey: (await getVapidKeys(deps)).publicKey,
  }));

  app.post<{ Body: PushSubscribeRequest }>(
    '/push/subscribe',
    {
      preHandler: requireMember,
      schema: {
        body: {
          type: 'object',
          required: ['endpoint', 'keys'],
          // PushSubscription.toJSON() also has expirationTime.
          properties: {
            endpoint: endpointSchema,
            keys: {
              type: 'object',
              required: ['p256dh', 'auth'],
              properties: {
                p256dh: { type: 'string', minLength: 10, maxLength: 200 },
                auth: { type: 'string', minLength: 4, maxLength: 100 },
              },
            },
          },
        },
      },
    },
    async (request) => {
      if (!isAllowedPushEndpoint(request.body.endpoint)) {
        throw new HttpError(422, 'unprocessable', 'Ovaj pregledač ne podržava obaveštenja.');
      }
      await saveSubscription(deps, request.member!.id, request.body, request.headers['user-agent']);
      return { ok: true };
    },
  );

  const endpointBody = {
    body: { type: 'object', required: ['endpoint'], additionalProperties: false, properties: { endpoint: endpointSchema } },
  };

  app.post<{ Body: PushEndpointRequest }>(
    '/push/unsubscribe',
    { preHandler: requireMember, schema: endpointBody },
    async (request) => {
      await deleteSubscription(deps, request.member!.id, request.body.endpoint);
      return { ok: true };
    },
  );

  app.post<{ Body: PushEndpointRequest }>(
    '/push/status',
    { preHandler: requireMember, schema: endpointBody },
    async (request): Promise<PushStatusResponse> => ({
      subscribed: await hasSubscription(deps, request.member!.id, request.body.endpoint),
    }),
  );

  app.post('/push/test', { preHandler: requireMember }, async (request): Promise<PushTestResponse> => {
    const r = await pushToMembers(deps, pushSender, [request.member!.id], {
      title: '🔔 Veseli četvrtak',
      body: 'Obaveštenja rade! Ovako ćeš videti nove poruke iz chata.',
      url: '/chat',
      tag: 'vc-test',
    });
    logPush(r);
    return { sent: r.sent };
  });

  app.get('/chat/stream', { preHandler: requireMember }, (request, reply) => {
    const memberId = request.member!.id;
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
    open.add(res);

    const write = (type: string, data: unknown): void => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const listener = (event: ChatEvent): void => write(event.type, event.data);
    hub.on('event', listener);
    presence.connect(memberId);
    // Every new connection gets the current presence right away (also covers grace-period reconnects).
    void presenceList(deps, (id) => presence.isOnline(id))
      .then((list) => write('presence', { presence: list }))
      .catch((err: unknown) => app.log.error(err));

    const ping = setInterval(() => write('ping', { at: new Date().toISOString() }), SSE_PING_MS);
    ping.unref?.();

    let closed = false;
    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      open.delete(res);
      clearInterval(ping);
      hub.off('event', listener);
      presence.disconnect(memberId);
    };
    request.raw.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  });
}
