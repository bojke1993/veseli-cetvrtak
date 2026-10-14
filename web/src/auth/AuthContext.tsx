import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Me } from '@api';
import { useMe } from '../api/queries';

export interface AuthState {
  me: Me | null;
  loading: boolean;
  isMember: boolean;
  isAdmin: boolean;
  isGuest: boolean;
}

const AuthCtx = createContext<AuthState>({ me: null, loading: true, isMember: false, isAdmin: false, isGuest: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const q = useMe();
  const value = useMemo<AuthState>(() => {
    const me = q.data?.me ?? null;
    return { me, loading: q.isPending, isMember: !!me, isAdmin: !!me?.isAdmin, isGuest: !me };
  }, [q.data, q.isPending]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}
