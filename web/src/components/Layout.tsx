import type { ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminTasks, useLogout } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { useConnection } from '../hooks/LiveContext';
import { LoginButton } from './ui';

const PRIMARY = [
  { to: '/', label: 'Početna', icon: '⌂', end: true },
  { to: '/kolo', label: 'Kolo', icon: '◎', end: false },
  { to: '/istorija', label: 'Istorija', icon: '☰', end: false },
  { to: '/statistika', label: 'Statistika', icon: '▥', end: false },
];

export function useMoreItems() {
  const { isMember, isAdmin } = useAuth();
  const tasks = useAdminTasks(isAdmin);
  const taskCount = tasks.data?.tasks.length ?? 0;
  const items: Array<{ to: string; label: string; badge?: number }> = [
    { to: '/blejm', label: 'Blejm lista' },
    { to: '/clanovi', label: 'Članovi' },
  ];
  if (isMember) items.push({ to: '/audit', label: 'Audit log' });
  if (isAdmin) items.push({ to: '/zadaci', label: 'Zadaci', badge: taskCount });
  if (isMember) items.push({ to: '/podesavanja', label: 'Podešavanja' });
  return { items, taskCount };
}

function ConnectionBadge() {
  const state = useConnection();
  if (state !== 'offline') return null;
  return (
    <span className="badge tone-bad conn-badge" role="status">
      <span aria-hidden="true">⚡</span> Nema veze
    </span>
  );
}

export function LogoutButton({ className = 'btn' }: { className?: string }) {
  const logout = useLogout();
  return (
    <button type="button" className={className} onClick={() => logout.mutate()} disabled={logout.isPending}>
      Odjavi se
    </button>
  );
}

export function Layout() {
  const { me, isAdmin } = useAuth();
  const loc = useLocation();
  const { items, taskCount } = useMoreItems();

  if (me?.mustChangePassword && loc.pathname !== '/lozinka') {
    return <Navigate to="/lozinka" replace />;
  }

  const moreActive = items.some((i) => loc.pathname.startsWith(i.to)) || loc.pathname === '/jos';

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Preskoči na sadržaj
      </a>
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>Veseli četvrtak</span>
        </Link>
        <div className="topbar-right">
          <ConnectionBadge />
          {me ? (
            <Link to="/podesavanja" className="topbar-user" aria-label={`Prijavljen: ${me.displayName}`}>
              {me.displayName}
              {isAdmin && <span className="small muted"> · admin</span>}
            </Link>
          ) : (
            <LoginButton className="btn btn-small btn-primary" />
          )}
        </div>
      </header>

      <nav className="nav" aria-label="Glavna navigacija">
        <ul className="nav-primary">
          {PRIMARY.map((i) => (
            <li key={i.to}>
              <NavLink to={i.to} end={i.end} className="nav-link">
                <span className="nav-icon" aria-hidden="true">
                  {i.icon}
                </span>
                <span>{i.label}</span>
              </NavLink>
            </li>
          ))}
          <li className="nav-more-mobile">
            <NavLink to="/jos" className={`nav-link${moreActive ? ' active' : ''}`}>
              <span className="nav-icon" aria-hidden="true">
                ⋯
              </span>
              <span>Još</span>
              {taskCount > 0 && (
                <span className="nav-badge" aria-label={`${taskCount} otvorenih zadataka`}>
                  {taskCount}
                </span>
              )}
            </NavLink>
          </li>
        </ul>
        <ul className="nav-secondary">
          {items.map((i) => (
            <li key={i.to}>
              <NavLink to={i.to} className="nav-link">
                <span>{i.label}</span>
                {!!i.badge && (
                  <span className="nav-badge" aria-label={`${i.badge} otvorenih zadataka`}>
                    {i.badge}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
          <li>{me ? <LogoutButton className="nav-link nav-button" /> : <LoginButton className="nav-link" />}</li>
        </ul>
      </nav>

      <main id="main" className="main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

/** Redirects guests to the login page (routes /audit, /podesavanja, /zadaci). */
export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return null;
  if (!me) return <Navigate to={`/prijava?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (admin && !me.isAdmin) return <p className="alert">Ova strana je dostupna samo administratoru.</p>;
  return <>{children}</>;
}
