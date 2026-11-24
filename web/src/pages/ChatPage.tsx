import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatMessageDto, ChatPresenceDto } from '@api';
import { useChatMessages, useChatState, useDeleteMessage, useMarkRead, useOlderMessages, useSendMessage } from '../api/chat';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { MemberAvatar, useMemberMap } from '../components/MemberName';
import { ErrorBox, Loading, Modal } from '../components/ui';
import { useNow } from '../hooks/useNow';
import { formatAgo, formatChatDay, formatDateTime, formatTime, todayBelgrade } from '../lib/format';

const MAX_LENGTH = 1000;
/** Auto-scroll on new messages only when the reader is already near the bottom. */
const NEAR_BOTTOM_PX = 120;

/** EKR-15 — who is online (BR-41). */
export function PresenceBar({ presence, myId }: { presence: ChatPresenceDto[]; myId?: number }) {
  const members = useMemberMap();
  const now = useNow(30_000);
  // Whoever is looking at the chat is online, even before the server's first presence update.
  const list = presence.map((p) => (p.memberId === myId ? { ...p, online: true, lastSeenAt: null } : p));
  const onlineCount = list.filter((p) => p.online).length;
  return (
    <section aria-label="Ko je online">
      <ul className="presence-list">
        {list.map((p) => {
          const m = members.get(p.memberId);
          const name = m?.displayName ?? `Član ${p.memberId}`;
          return (
            <li key={p.memberId} className={p.online ? 'presence is-online' : 'presence'}>
              <span className="presence-avatar">
                <MemberAvatar member={m} size={40} />
                <span className="presence-dot" aria-hidden="true" />
              </span>
              <span className="presence-text">
                <strong>{name}</strong>
                <span className="small">
                  {p.online ? 'online' : p.lastSeenAt ? `viđen ${formatAgo(p.lastSeenAt, now)}` : 'offline'}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="sr-only" role="status">
        Online: {onlineCount} od {presence.length}
      </p>
    </section>
  );
}

function MessageList({
  messages,
  myId,
  canDeleteAll,
  onDelete,
}: {
  messages: ChatMessageDto[];
  myId: number;
  canDeleteAll: boolean;
  onDelete: (m: ChatMessageDto) => void;
}) {
  const members = useMemberMap();
  const now = useNow(60_000);
  let prevDay = '';
  let prevAuthor = 0;
  return (
    <ol className="chat-list">
      {messages.map((m) => {
        const day = todayBelgrade(new Date(m.createdAt));
        const newDay = day !== prevDay;
        const showName = newDay || m.memberId !== prevAuthor;
        prevDay = day;
        prevAuthor = m.memberId;
        const mine = m.memberId === myId;
        const author = members.get(m.memberId)?.displayName ?? `Član ${m.memberId}`;
        return (
          <Fragment key={m.id}>
            {newDay && (
              <li className="chat-day" aria-hidden="true">
                <span>{formatChatDay(m.createdAt, now)}</span>
              </li>
            )}
            <li className={`chat-msg${mine ? ' is-mine' : ''}${showName ? ' first' : ''}`}>
              {showName && !mine && <span className="chat-author">{author}</span>}
              <div className="chat-bubble">
                <span className="sr-only">{mine ? 'Vi' : author}: </span>
                <span className="chat-body">{m.body}</span>
                <span className="chat-meta">
                  <time dateTime={m.createdAt} title={formatDateTime(m.createdAt)}>
                    {formatTime(m.createdAt)}
                  </time>
                  {(mine || canDeleteAll) && (
                    <button
                      type="button"
                      className="chat-delete"
                      onClick={() => onDelete(m)}
                      aria-label={`Obriši poruku: ${m.body.slice(0, 40)}`}
                      title="Obriši"
                    >
                      ✕
                    </button>
                  )}
                </span>
              </div>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function Composer() {
  const send = useSendMessage();
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const trimmed = text.trim();
  const tooLong = trimmed.length > MAX_LENGTH;

  // Grow with the content up to ~5 lines.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!trimmed || tooLong || send.isPending) return;
    send.mutate(trimmed, {
      onSuccess: () => {
        setText('');
        ref.current?.focus();
      },
    });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
  };

  return (
    <form className="chat-composer" onSubmit={submit}>
      <label htmlFor="chat-input" className="sr-only">
        Poruka
      </label>
      <textarea
        id="chat-input"
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Napiši poruku…"
        maxLength={MAX_LENGTH * 2}
        enterKeyHint="send"
      />
      <button type="submit" className="btn btn-primary" disabled={!trimmed || tooLong || send.isPending}>
        Pošalji
      </button>
      {(tooLong || send.error) && (
        <p className="form-error chat-error" role="alert">
          {tooLong ? `Najviše ${MAX_LENGTH} znakova (sada ${trimmed.length}).` : errorMessage(send.error)}
        </p>
      )}
    </form>
  );
}

/** EKR-15 — team chat (members only, FR-31). */
export default function ChatPage() {
  const { me, isAdmin } = useAuth();
  const messages = useChatMessages(!!me);
  const state = useChatState(!!me);
  const older = useOlderMessages();
  const markRead = useMarkRead();
  const remove = useDeleteMessage();
  const [toDelete, setToDelete] = useState<ChatMessageDto | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prependFrom = useRef<number | null>(null);
  const list = messages.data?.messages ?? [];
  const lastId = list.length ? list[list.length - 1]!.id : 0;

  const onScroll = () => {
    const el = scroller.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  // Keep the view at the bottom for new messages; keep the position when older ones are prepended.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prependFrom.current !== null) {
      el.scrollTop = el.scrollHeight - prependFrom.current;
      prependFrom.current = null;
    } else if (stickToBottom.current || list[list.length - 1]?.memberId === me?.memberId) {
      el.scrollTop = el.scrollHeight;
    }
  }, [list, me?.memberId]);

  // Reading the chat marks everything visible as read (only while the tab is visible).
  const readId = state.data?.readId ?? 0;
  const unread = state.data?.unread ?? 0;
  const mark = markRead.mutate;
  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'visible' && lastId > 0 && (lastId > readId || unread > 0)) mark(lastId);
    };
    run();
    document.addEventListener('visibilitychange', run);
    return () => document.removeEventListener('visibilitychange', run);
  }, [lastId, readId, unread, mark]);

  if (!me) return null;

  const loadOlder = () => {
    const el = scroller.current;
    if (!list.length) return;
    prependFrom.current = el ? el.scrollHeight - el.scrollTop : null;
    older.mutate(list[0]!.id);
  };

  return (
    <div className="page chat-page">
      <h1 className="sr-only">Chat</h1>
      {state.data && <PresenceBar presence={state.data.presence} myId={me.memberId} />}
      <div className="chat-scroller" ref={scroller} onScroll={onScroll}>
        {messages.isPending && <Loading label="Učitavanje poruka…" />}
        {messages.error && <ErrorBox error={messages.error} onRetry={() => void messages.refetch()} />}
        {messages.data && (
          <>
            {messages.data.hasMore && (
              <p className="chat-older">
                <button type="button" className="btn btn-small" onClick={loadOlder} disabled={older.isPending}>
                  {older.isPending ? 'Učitavanje…' : 'Starije poruke'}
                </button>
              </p>
            )}
            {list.length === 0 ? (
              <p className="chat-empty muted">Još nema poruka. Započni razgovor! 👋</p>
            ) : (
              <MessageList messages={list} myId={me.memberId} canDeleteAll={isAdmin} onDelete={setToDelete} />
            )}
          </>
        )}
      </div>
      <Composer />
      {toDelete && (
        <Modal
          title="Obrisati poruku?"
          onClose={() => setToDelete(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setToDelete(null)}>
                Odustani
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
              >
                Obriši
              </button>
            </>
          }
        >
          <p className="chat-delete-preview">„{toDelete.body.length > 200 ? `${toDelete.body.slice(0, 200)}…` : toDelete.body}”</p>
          {toDelete.memberId !== me.memberId && <p className="small muted">Brisanje tuđe poruke upisuje se u audit log.</p>}
          {remove.error && (
            <p className="form-error" role="alert">
              {errorMessage(remove.error)}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
