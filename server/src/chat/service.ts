import { sql } from 'kysely';
import type { ChatMessageDto, ChatMessagesResponse, ChatPresenceDto } from '../api-types.js';
import type { ChatMessage } from '../db/schema.js';
import type { Deps } from '../deps.js';
import type { SessionMember } from '../http/auth.js';
import { forbidden, notFound, unprocessable } from '../http/errors.js';
import { writeAudit } from '../services/audit.js';

export const CHAT_MAX_LENGTH = 1000;
export const CHAT_PAGE_SIZE = 50;

export function toChatDto(m: Pick<ChatMessage, 'id' | 'member_id' | 'body' | 'created_at'>): ChatMessageDto {
  return { id: m.id, memberId: m.member_id, body: m.body, createdAt: m.created_at.toISOString() };
}

/** Unifies line endings and trims the ends; inner line breaks stay. */
export function normalizeBody(body: string): string {
  return body.replace(/\r\n?/g, '\n').trim();
}

/** Oldest first; `before` = only messages older than this id. */
export async function listMessages(deps: Deps, before?: number, limit = CHAT_PAGE_SIZE): Promise<ChatMessagesResponse> {
  let q = deps.db
    .selectFrom('chat_messages')
    .select(['id', 'member_id', 'body', 'created_at'])
    .where('deleted_at', 'is', null)
    .orderBy('id', 'desc')
    .limit(limit + 1);
  if (before) q = q.where('id', '<', before);
  const rows = await q.execute();
  const hasMore = rows.length > limit;
  return { messages: rows.slice(0, limit).reverse().map(toChatDto), hasMore };
}

export async function sendMessage(deps: Deps, member: SessionMember, rawBody: string): Promise<ChatMessageDto> {
  const body = normalizeBody(rawBody);
  if (body.length === 0) throw unprocessable('Poruka je prazna.');
  if (body.length > CHAT_MAX_LENGTH) throw unprocessable(`Poruka može imati najviše ${CHAT_MAX_LENGTH} znakova.`);
  const createdAt = deps.now();
  const res = await deps.db
    .insertInto('chat_messages')
    .values({ member_id: member.id, body, created_at: createdAt })
    .executeTakeFirstOrThrow();
  return { id: Number(res.insertId), memberId: member.id, body, createdAt: createdAt.toISOString() };
}

/** The author deletes their own message; the admin deletes any (audited when it is someone else's). */
export async function deleteMessage(deps: Deps, member: SessionMember, id: number): Promise<void> {
  const msg = await deps.db.selectFrom('chat_messages').selectAll().where('id', '=', id).executeTakeFirst();
  if (!msg || msg.deleted_at) throw notFound('Poruka nije pronađena.');
  if (msg.member_id !== member.id && !member.isAdmin) throw forbidden('Možete obrisati samo svoje poruke.');
  const now = deps.now();
  await deps.db.updateTable('chat_messages').set({ deleted_at: now, deleted_by: member.id }).where('id', '=', id).execute();
  if (msg.member_id !== member.id) {
    await writeAudit(deps.db, {
      at: now,
      actorMemberId: member.id,
      action: 'chat_delete',
      entity: 'chat_message',
      entityId: id,
      oldValue: { memberId: msg.member_id, body: msg.body },
    });
  }
}

/** Unread = other members' messages after the read marker. */
export async function unreadState(deps: Deps, memberId: number): Promise<{ unread: number; readId: number }> {
  const m = await deps.db.selectFrom('members').select('chat_read_id').where('id', '=', memberId).executeTakeFirstOrThrow();
  const row = await deps.db
    .selectFrom('chat_messages')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('deleted_at', 'is', null)
    .where('member_id', '!=', memberId)
    .where('id', '>', m.chat_read_id)
    .executeTakeFirstOrThrow();
  return { unread: Number(row.n), readId: m.chat_read_id };
}

/** Moves the read marker forward, never back. */
export async function markRead(deps: Deps, memberId: number, id: number): Promise<void> {
  await deps.db
    .updateTable('members')
    .set({ chat_read_id: sql<number>`GREATEST(chat_read_id, ${id})` })
    .where('id', '=', memberId)
    .execute();
}

export async function setLastSeen(deps: Deps, memberId: number): Promise<void> {
  await deps.db.updateTable('members').set({ last_seen_at: deps.now() }).where('id', '=', memberId).execute();
}

export async function presenceList(deps: Deps, isOnline: (id: number) => boolean): Promise<ChatPresenceDto[]> {
  const rows = await deps.db.selectFrom('members').select(['id', 'last_seen_at']).orderBy('sort_order').execute();
  return rows.map((r) => {
    const online = isOnline(r.id);
    return { memberId: r.id, online, lastSeenAt: online || !r.last_seen_at ? null : r.last_seen_at.toISOString() };
  });
}
