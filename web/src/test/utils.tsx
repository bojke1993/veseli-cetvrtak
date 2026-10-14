import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import type { Me, MemberDto } from '@api';
import { AuthProvider } from '../auth/AuthContext';

export type Handler = (url: URL, init: RequestInit | undefined) => unknown;

/** Installs a fetch mock routing by path prefix (longest match wins). Returns the vi.fn. */
export function mockFetch(routes: Record<string, unknown | Handler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const key = Object.keys(routes)
      .filter((k) => path === k || path.startsWith(k + '/') || path.startsWith(k + '?'))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Nije pronađeno.' } }), { status: 404 });
    const r = routes[key];
    const body = typeof r === 'function' ? (r as Handler)(url, init) : r;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function calledPaths(fn: ReturnType<typeof mockFetch>): string[] {
  return fn.mock.calls.map(([input]) => {
    const u = new URL(String(input), 'http://localhost');
    return u.pathname + u.search;
  });
}

export const MEMBERS: MemberDto[] = [
  { id: 1, name: 'Ivanišević', displayName: 'Ivanišević', avatarUrl: null, isAdmin: true, sortOrder: 1, status: { streak: 2, hasFire: false, onCooldown: false } },
  { id: 2, name: 'Tozislav', displayName: 'Tozislav', avatarUrl: null, isAdmin: false, sortOrder: 2, status: { streak: -5, hasFire: false, onCooldown: true } },
  { id: 3, name: 'Lakićević', displayName: 'Lakićević', avatarUrl: null, isAdmin: false, sortOrder: 3, status: { streak: 3, hasFire: true, onCooldown: false } },
  { id: 4, name: 'Simara', displayName: 'Simara', avatarUrl: null, isAdmin: false, sortOrder: 4, status: { streak: 0, hasFire: false, onCooldown: false } },
];

export const ADMIN_ME: Me = { memberId: 1, name: 'Ivanišević', displayName: 'Ivanišević', username: 'ivan', isAdmin: true, mustChangePassword: false };

export function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

export function renderWithProviders(ui: ReactElement, { route = '/', path = '*' }: { route?: string; path?: string } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  const result = render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={ui} />
          </Routes>
          <LocationDisplay />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient: qc };
}
