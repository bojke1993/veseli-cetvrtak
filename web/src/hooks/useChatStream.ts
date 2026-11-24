import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChatDeleteEvent, ChatMessageDto, ChatPresenceEvent, ChatStateResponse } from '@api';
import { API_BASE } from '../api/client';
import { addMessageToCache, chatKeys, removeMessageFromCache, setPresenceInCache } from '../api/chat';

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
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, [memberId, qc]);
}
