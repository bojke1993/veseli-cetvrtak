import { useEffect, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { CurrentRoundResponse, LiveEvent, RoundDetailDto, RoundEvent, RoundResponse } from '@api';
import { API_BASE } from '../api/client';
import { keys } from '../api/queries';

export type ConnectionState = 'connecting' | 'open' | 'offline';

/** Applies a 'live' SSE payload to a round detail. Pure, exported for tests. */
export function applyLiveEvent(round: RoundDetailDto, ev: LiveEvent): RoundDetailDto {
  if (round.id !== ev.roundId) return round;
  const bySlot = new Map(ev.picks.map((p) => [p.slot, p.live]));
  let latest = round.liveUpdatedAt;
  const picks = round.picks.map((pick) => {
    let next = pick;
    const live = bySlot.get(pick.slot);
    if (live) {
      next = { ...next, live };
      if (live.updatedAt && (!latest || live.updatedAt > latest)) latest = live.updatedAt;
    }
    if (ev.game && next.game && next.game.id === ev.game.id) next = { ...next, game: ev.game };
    return next;
  });
  return { ...round, picks, liveUpdatedAt: latest ?? new Date().toISOString() };
}

function patchCaches(qc: QueryClient, ev: LiveEvent) {
  qc.setQueryData<RoundResponse>(keys.round(ev.roundId), (old) => (old ? { ...old, round: applyLiveEvent(old.round, ev) } : old));
  qc.setQueryData<CurrentRoundResponse>(keys.currentRound, (old) =>
    old && old.round && old.round.id === ev.roundId ? { ...old, round: applyLiveEvent(old.round, ev) } : old,
  );
}

function invalidateForRound(qc: QueryClient, _ev: RoundEvent) {
  void qc.invalidateQueries({ queryKey: ['round'] });
  void qc.invalidateQueries({ queryKey: ['rounds'] });
  void qc.invalidateQueries({ queryKey: ['stats'] });
  void qc.invalidateQueries({ queryKey: ['members'] });
  void qc.invalidateQueries({ queryKey: ['admin'] });
}

/**
 * Opens the SSE stream (/api/live/stream). 'round' events invalidate round-related
 * queries, 'live' events patch the cached round detail in place.
 * Returns the connection state for the "Nema veze" badge (REQ-34.5).
 */
export function useLiveStream(enabled = true): ConnectionState {
  const qc = useQueryClient();
  const [state, setState] = useState<ConnectionState>('connecting');
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let wasOpen = false;
    let closed = false;
    let failures = 0;

    const connect = () => {
      es = new EventSource(`${API_BASE}/live/stream`, { withCredentials: true });
      es.onopen = () => {
        failures = 0;
        setState('open');
        // After a reconnect, refetch whatever may have been missed.
        if (wasOpen) invalidateForRound(qc, { roundId: 0 });
        wasOpen = true;
      };
      es.onerror = () => {
        setState('offline');
        if (es && es.readyState === EventSource.CLOSED && !closed) {
          es.close();
          failures += 1;
          retry = setTimeout(connect, Math.min(30_000, 2_000 * 2 ** Math.min(failures, 4)));
        }
      };
      es.addEventListener('round', (e) => {
        try {
          invalidateForRound(qc, JSON.parse((e as MessageEvent<string>).data) as RoundEvent);
        } catch {
          /* ignore malformed */
        }
      });
      es.addEventListener('live', (e) => {
        try {
          patchCaches(qc, JSON.parse((e as MessageEvent<string>).data) as LiveEvent);
        } catch {
          /* ignore malformed */
        }
      });
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, [enabled, qc]);

  if (!online) return 'offline';
  return state;
}
