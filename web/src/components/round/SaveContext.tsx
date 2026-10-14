import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '../../api/client';
import type { SaveState } from '../ui';

interface SaveApi {
  state: SaveState;
  error: string | null;
  track: <T>(p: Promise<T>) => Promise<T>;
}

const Ctx = createContext<SaveApi>({ state: 'idle', error: null, track: (p) => p });

/** Tracks autosave requests of the round editor for the "Sačuvano" indicator. */
export function SaveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(0);
  const track = useCallback(<T,>(p: Promise<T>): Promise<T> => {
    pending.current += 1;
    setState('saving');
    setError(null);
    return p.then(
      (v) => {
        pending.current -= 1;
        if (pending.current === 0) setState('saved');
        return v;
      },
      (e: unknown) => {
        pending.current -= 1;
        setState('error');
        setError(errorMessage(e));
        throw e;
      },
    );
  }, []);
  const value = useMemo(() => ({ state, error, track }), [state, error, track]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSave(): SaveApi {
  return useContext(Ctx);
}
