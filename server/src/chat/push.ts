import { generateVAPIDKeys, sendNotification } from 'web-push';
import type { ChatMessageDto } from '../api-types.js';
import type { Deps } from '../deps.js';

/**
 * BR-41 / P-28: Web Push for new chat messages. Each device that turned notifications on has a
 * row in push_subscriptions. A new message is pushed to the other members' devices, except to
 * members who are looking at the app right now (they get the in-app sound instead).
 */

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Sends one push; throws an error with `statusCode` when the push service refuses it. */
export type PushSender = (target: PushTarget, payload: string, vapid: VapidKeys & { subject: string }) => Promise<void>;

export const webPushSender: PushSender = async (target, payload, vapid) => {
  await sendNotification(target, payload, {
    vapidDetails: vapid,
    TTL: 6 * 3600,
    urgency: 'high',
    // Undelivered chat pushes replace each other (the phone was offline): only the latest arrives.
    topic: 'chat',
  });
};

const VAPID_SETTING = 'vapid_keys';
const keyCache = new WeakMap<Deps['db'], Promise<VapidKeys>>();

/** The server's VAPID key pair; generated and stored on first use (no configuration needed). */
export function getVapidKeys(deps: Deps): Promise<VapidKeys> {
  let p = keyCache.get(deps.db);
  if (!p) {
    p = (async () => {
      const read = () =>
        deps.db.selectFrom('app_settings').select('value').where('name', '=', VAPID_SETTING).executeTakeFirst();
      let row = await read();
      if (!row) {
        const keys = generateVAPIDKeys();
        // Two concurrent first requests: the first insert wins, both then read the same pair.
        await deps.db
          .insertInto('app_settings')
          .ignore()
          .values({ name: VAPID_SETTING, value: JSON.stringify(keys) })
          .execute();
        row = await read();
      }
      return JSON.parse(row!.value) as VapidKeys;
    })();
    p.catch(() => keyCache.delete(deps.db));
    keyCache.set(deps.db, p);
  }
  return p;
}

export async function saveSubscription(
  deps: Deps,
  memberId: number,
  target: PushTarget,
  userAgent: string | undefined,
): Promise<void> {
  const ua = userAgent ? userAgent.slice(0, 300) : null;
  // The same device (endpoint) moves to whoever subscribed last on it.
  await deps.db
    .insertInto('push_subscriptions')
    .values({
      member_id: memberId,
      endpoint: target.endpoint,
      p256dh: target.keys.p256dh,
      auth: target.keys.auth,
      user_agent: ua,
      created_at: deps.now(),
    })
    .onDuplicateKeyUpdate({ member_id: memberId, p256dh: target.keys.p256dh, auth: target.keys.auth, user_agent: ua })
    .execute();
}

export async function deleteSubscription(deps: Deps, memberId: number, endpoint: string): Promise<void> {
  await deps.db.deleteFrom('push_subscriptions').where('endpoint', '=', endpoint).where('member_id', '=', memberId).execute();
}

export async function hasSubscription(deps: Deps, memberId: number, endpoint: string): Promise<boolean> {
  const row = await deps.db
    .selectFrom('push_subscriptions')
    .select('id')
    .where('endpoint', '=', endpoint)
    .where('member_id', '=', memberId)
    .executeTakeFirst();
  return !!row;
}

/** Visible-app heartbeats per member and browser tab; a member is "watching" while any is fresh. */
export class Watchers {
  private readonly byMember = new Map<number, Map<string, number>>();
  constructor(private readonly ttlMs = 40_000) {}

  set(memberId: number, clientId: string, visible: boolean, now: number): void {
    let clients = this.byMember.get(memberId);
    if (!clients) {
      clients = new Map();
      this.byMember.set(memberId, clients);
    }
    if (visible) clients.set(clientId, now);
    else clients.delete(clientId);
  }

  isWatching(memberId: number, now: number): boolean {
    const clients = this.byMember.get(memberId);
    if (!clients) return false;
    for (const [id, at] of clients) {
      if (now - at < this.ttlMs) return true;
      clients.delete(id);
    }
    return false;
  }
}

export function chatPayload(message: ChatMessageDto, authorName: string): PushPayload {
  const body = message.body.length > 180 ? `${message.body.slice(0, 180)}…` : message.body;
  return { title: `💬 ${authorName}`, body, url: '/chat', tag: 'vc-chat' };
}

export interface PushResult {
  sent: number;
  /** Subscriptions deleted because the push service no longer knows them. */
  removed: number;
  errors: unknown[];
}

/** Sends `payload` to the given members' devices; drops subscriptions the push service says are gone. */
export async function pushToMembers(
  deps: Deps,
  sender: PushSender,
  memberIds: number[],
  payload: PushPayload,
): Promise<PushResult> {
  const result: PushResult = { sent: 0, removed: 0, errors: [] };
  if (memberIds.length === 0) return result;
  const subs = await deps.db
    .selectFrom('push_subscriptions')
    .select(['id', 'endpoint', 'p256dh', 'auth'])
    .where('member_id', 'in', memberIds)
    .execute();
  if (subs.length === 0) return result;
  const vapid = { ...(await getVapidKeys(deps)), subject: deps.config.pushSubject };
  const json = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, json, vapid);
        result.sent += 1;
        await deps.db.updateTable('push_subscriptions').set({ last_success_at: deps.now() }).where('id', '=', s.id).execute();
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the browser unsubscribed or the subscription expired.
        if (status === 404 || status === 410) {
          await deps.db.deleteFrom('push_subscriptions').where('id', '=', s.id).execute();
          result.removed += 1;
        } else {
          result.errors.push(err);
        }
      }
    }),
  );
  return result;
}
