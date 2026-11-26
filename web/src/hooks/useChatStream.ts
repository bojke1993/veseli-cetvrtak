import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChatDeleteEvent, ChatMessageDto, ChatPresenceEvent, ChatStateResponse } from '@api';
import { API_BASE } from '../api/client';
import { addMessageToCache, chatKeys, removeMessageFromCache, setPresenceInCache } from '../api/chat';
import { installAudioUnlock, playChatSound } from '../lib/chatSound';

/** After this long in the background the stream may have been dropped silently: resync. */
const RESYNC_AFTER_HIDDEN_MS = 15_000;
/** P-28: while the app is visible, tell the server (no push then); the server forgets after 40 s. */
const VISIBLE_HEARTBEAT_MS = 25_000;

function newClientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Sends the tab's visibility; errors are ignored (worst case: one extra notification). */
function reportVisibility(clientId: string, visible: boolean) {
  try {
    // keepalive: the "hidden" report must survive the page being frozen or closed right after.
    void fetch(`${API_BASE}/chat/visibility`, {
      method: 'POST',
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'vc' },
      body: JSON.stringify({ clientId, visible }),
    }).catch(() => undefined);
  } catch {
    // ignore
  }
}

/**
 * BR-41: keeps the members-only chat stream open while a member is logged in. Having it open is
 * what makes the member "online"; events update the cached messages, presence and unread count.
 */
export function useChatStream(memberId: number | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (memberId === null || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let wasOpen = false;
    let closed = false;
    let failures = 0;
    let hiddenAt: number | null = null;
    installAudioUnlock();
    const clientId = newClientId();
    const isVisible = () => document.visibilityState === 'visible';
    if (isVisible()) reportVisibility(clientId, true);
    const heartbeat = setInterval(() => {
      if (isVisible()) reportVisibility(clientId, true);
    }, VISIBLE_HEARTBEAT_MS);

    const parse = <T,>(e: Event): T | null => {
      try {
        return JSON.parse((e as MessageEvent<string>).data) as T;
      } catch {
        return null;
      }
    };

    const connect = () => {
      es = new EventSource(`${API_BASE}/chat/stream`, { withCredentials: true });
      es.onopen = () => {
        failures = 0;
        // The server counts us online once the stream is open: refetch presence (and, after a
        // reconnect, any messages that may have been missed).
        void qc.invalidateQueries({ queryKey: wasOpen ? chatKeys.all : chatKeys.state });
        wasOpen = true;
      };
      es.onerror = () => {
        if (es && es.readyState === EventSource.CLOSED && !closed) {
          es.close();
          failures += 1;
          retry = setTimeout(connect, Math.min(30_000, 2_000 * 2 ** Math.min(failures, 4)));
        }
      };
      es.addEventListener('message', (e) => {
        const m = parse<ChatMessageDto>(e);
        if (!m) return;
        addMessageToCache(qc, m);
        if (m.memberId !== memberId) {
          playChatSound();
          qc.setQueryData<ChatStateResponse>(chatKeys.state, (old) =>
            old && m.id > old.readId ? { ...old, unread: old.unread + 1 } : old,
          );
        }
      });
      es.addEventListener('delete', (e) => {
        const d = parse<ChatDeleteEvent>(e);
        if (!d) return;
        removeMessageFromCache(qc, d.id);
        void qc.invalidateQueries({ queryKey: chatKeys.state });
      });
      es.addEventListener('presence', (e) => {
        const p = parse<ChatPresenceEvent>(e);
        if (p) setPresenceInCache(qc, p.presence);
      });
    };
    // Phones freeze or drop the connection in the background; on return reconnect right away
    // (instead of waiting for the backoff) and refetch messages that may have been missed.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        reportVisibility(clientId, false);
        return;
      }
      reportVisibility(clientId, true);
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (!es || es.readyState === EventSource.CLOSED) {
        if (retry) clearTimeout(retry);
        es?.close();
        failures = 0;
        connect();
      } else if (away > RESYNC_AFTER_HIDDEN_MS) {
        void qc.invalidateQueries({ queryKey: chatKeys.all });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    connect();
    return () => {
      closed = true;
      clearInterval(heartbeat);
      reportVisibility(clientId, false);
      document.removeEventListener('visibilitychange', onVisibility);
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, [memberId, qc]);
}
