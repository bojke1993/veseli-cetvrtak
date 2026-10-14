import { lazy, Suspense, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from './api/client';
import { AuthProvider } from './auth/AuthContext';
import { Layout, RequireAuth } from './components/Layout';
import { Loading } from './components/ui';
import { LiveProvider } from './hooks/LiveContext';
import { HomePage } from './pages/HomePage';
import { CurrentRoundPage } from './pages/CurrentRoundPage';
import { RoundDetailPage } from './pages/RoundDetailPage';
import { HistoryPage } from './pages/HistoryPage';
import { LoginPage, ChangePasswordPage } from './pages/LoginPage';
import { MorePage } from './pages/MorePage';

const StatsPage = lazy(() => import('./pages/StatsPage'));
const MembersPage = lazy(() => import('./pages/MembersPage'));
const MemberProfilePage = lazy(() => import('./pages/MemberProfilePage'));
const BlamePage = lazy(() => import('./pages/BlamePage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="kolo" element={<CurrentRoundPage />} />
        <Route path="kolo/:id" element={<RoundDetailPage />} />
        <Route path="istorija" element={<HistoryPage />} />
        <Route path="statistika" element={<Lazy><StatsPage /></Lazy>} />
        <Route path="clanovi" element={<Lazy><MembersPage /></Lazy>} />
        <Route path="clanovi/:id" element={<Lazy><MemberProfilePage /></Lazy>} />
        <Route path="blejm" element={<Lazy><BlamePage /></Lazy>} />
        <Route path="jos" element={<MorePage />} />
        <Route path="prijava" element={<LoginPage />} />
        <Route path="lozinka" element={<RequireAuth><ChangePasswordPage /></RequireAuth>} />
        <Route path="audit" element={<RequireAuth><Lazy><AuditPage /></Lazy></RequireAuth>} />
        <Route path="zadaci" element={<RequireAuth admin><Lazy><TasksPage /></Lazy></RequireAuth>} />
        <Route path="podesavanja" element={<RequireAuth><Lazy><SettingsPage /></Lazy></RequireAuth>} />
        <Route path="*" element={<p className="alert">Strana nije pronađena.</p>} />
      </Route>
    </Routes>
  );
}

export function App({ queryClient }: { queryClient?: QueryClient }) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <LiveProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </LiveProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
