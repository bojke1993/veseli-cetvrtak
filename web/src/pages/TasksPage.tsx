import { Link } from 'react-router-dom';
import type { AdminTaskKind } from '@api';
import { useAdminTasks } from '../api/queries';
import { EmptyState, QueryView } from '../components/ui';

const ICON: Record<AdminTaskKind, string> = {
  lock_soon: '⏰',
  manual_resolve: '✍',
  enter_actual_win: '💰',
  cooldown_inconsistent: '⚠',
  sync_failing: '⟳',
  live_failing: '⚡',
};

/** EKR-13 */
export default function TasksPage() {
  const tasks = useAdminTasks(true);
  return (
    <div className="page">
      <h1>Zadaci</h1>
      <QueryView q={tasks}>
        {({ tasks: list }) =>
          list.length === 0 ? (
            <EmptyState>✔ Nema otvorenih zadataka.</EmptyState>
          ) : (
            <ul className="menu-list">
              {list.map((t, i) => (
                <li key={`${t.kind}-${t.roundId ?? ''}-${t.slot ?? ''}-${i}`}>
                  <Link to={t.link} className="menu-item">
                    <span aria-hidden="true">{ICON[t.kind] ?? '•'}</span>
                    <span>{t.message}</span>
                    <span aria-hidden="true">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </div>
  );
}
