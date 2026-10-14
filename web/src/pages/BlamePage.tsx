import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBlame } from '../api/queries';
import { BlameName } from '../components/MemberName';
import { StatsFilter, useStatsQuery } from '../components/StatsFilter';
import { EmptyState, QueryView } from '../components/ui';
import { formatDate, formatMoney, formatPercent } from '../lib/format';

/** EKR-10 */
export default function BlamePage() {
  const q = useStatsQuery();
  const blame = useBlame(q);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="page">
      <h1>Blejm lista</h1>
      <StatsFilter />
      <QueryView q={blame}>
        {({ rows }) => {
          if (!rows.length) return <EmptyState>Još nema blejmova.</EmptyState>;
          const sorted = [...rows.filter((r) => r.memberId !== 'team')].sort((a, b) => a.rank - b.rank);
          const team = rows.find((r) => r.memberId === 'team');
          const all = team ? [...sorted, team] : sorted;
          return (
            <ol className="blame-list">
              {all.map((r) => {
                const key = String(r.memberId);
                const king = r.memberId !== 'team' && r.rank === 1 && r.blames > 0;
                const expanded = open === key;
                return (
                  <li key={key} className={`card blame-row${king ? ' blame-king' : ''}${r.memberId === 'team' ? ' blame-team' : ''}`}>
                    <button type="button" className="blame-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : key)}>
                      <span className="blame-rank">{r.memberId === 'team' ? '—' : `${r.rank}.`}</span>
                      <span className="blame-name">
                        <BlameName value={r.memberId} />
                        {king && (
                          <span className="king-badge">
                            <span aria-hidden="true">👑</span> Kralj blejma
                          </span>
                        )}
                      </span>
                      <span className="blame-num">
                        <strong>{r.blames}</strong> <span className="small muted">({formatPercent(r.blamePercent)})</span>
                      </span>
                      <span className="small muted blame-lost">izgubljeno {formatMoney(r.lostPotentialWin)}</span>
                    </button>
                    {expanded && (
                      <ul className="simple-list blame-rounds">
                        {r.rounds.length === 0 && <li className="muted">Nema kola.</li>}
                        {r.rounds.map((rd) => (
                          <li key={rd.roundId}>
                            <Link to={`/kolo/${rd.roundId}`}>
                              Kolo #{rd.number} · {formatDate(rd.gameDay)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          );
        }}
      </QueryView>
    </div>
  );
}
