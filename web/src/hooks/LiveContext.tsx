import { createContext, useContext, type ReactNode } from 'react';
import { useLiveStream, type ConnectionState } from './useLiveStream';

const LiveCtx = createContext<ConnectionState>('open');

export function LiveProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const state = useLiveStream(enabled);
  return <LiveCtx.Provider value={state}>{children}</LiveCtx.Provider>;
}

export function useConnection(): ConnectionState {
  return useContext(LiveCtx);
}
