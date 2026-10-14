import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LogoutButton, useMoreItems } from '../components/Layout';
import { LoginButton } from '../components/ui';

/** "Još" menu (phone). */
export function MorePage() {
  const { me } = useAuth();
  const { items } = useMoreItems();
  return (
    <div className="narrow">
      <h1>Još</h1>
      <ul className="menu-list">
        {items.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="menu-item">
              <span>{i.label}</span>
              {!!i.badge && (
                <span className="nav-badge" aria-label={`${i.badge} otvorenih zadataka`}>
                  {i.badge}
                </span>
              )}
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="menu-footer">
        {me ? (
          <>
            <p className="muted">Prijavljen: {me.displayName}</p>
            <LogoutButton className="btn btn-block" />
          </>
        ) : (
          <LoginButton className="btn btn-primary btn-block" />
        )}
      </div>
    </div>
  );
}
