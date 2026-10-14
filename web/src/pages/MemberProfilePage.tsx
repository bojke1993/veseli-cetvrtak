import { Link, useParams } from 'react-router-dom';
import { useMemberStats } from '../api/queries';
import { ResultIcon } from '../components/LiveStatusBadge';
import { MemberName } from '../components/MemberName';
import { StatsFilter, useStatsQuery } from '../components/StatsFilter';
import { Card, QueryView } from '../components/ui';
import { formatDate, formatMoney, formatPercent, lineLabel, streakText } from '../lib/format';

/** EKR-09 — member profile */
export default function MemberProfilePage() {
  const { id } = useParams();
  const memberId = Number(id);
  const q = useStatsQuery();
  const stats = useMemberStats(memberId, q);
  return (
    <div className="page">
      <p>
        <Link to="/clanovi">‹ Članovi</Link>
      </p>
      <h1>
        <MemberName id={memberId} />
      </h1>
      <StatsFilter />
      <QueryView q={stats}>
        {({ stats: s, picks }) => (
          <>
            <div className="stat-tiles">
              <div className="stat-tile">
                <span className="kv-label">Pogođeni / promašeni / poništeni</span>
                <span className="stat-value">
                  {s.hits} / {s.misses} / {s.voids}
                </span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Procenat pogodaka</span>
                <span className="stat-value">{formatPercent(s.hitPercent)}</span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Trenutni niz</span>
                <span className="stat-value">{streakText(s.currentStreak)}</span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Najduži niz pogodaka / promašaja</span>
                <span className="stat-value">
                  {s.longestHitStreak} / {s.longestMissStreak}
                </span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Blejmovi</span>
                <span className="stat-value">{s.blames}</span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Uplate</span>
                <span className="stat-value">
                  {s.payments} · {formatMoney(s.paidTotal)}
                </span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Hlađenja / vatrice</span>
                <span className="stat-value">
                  {s.cooldowns} / {s.fires}
                </span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Više / Manje (% pogodaka)</span>
                <span className="stat-value">
                  {formatPercent(s.overPercent)} / {formatPercent(s.underPercent)}
                </span>
              </div>
            </div>
            <Card title="Poslednjih 10 tipova">
              {s.last10.length ? (
                <ol className="last10" aria-label="Poslednjih 10 tipova, od najstarijeg">
                  {s.last10.map((r, i) => (
                    <li key={i}>
                      <ResultIcon result={r} />
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">Nema tipova.</p>
              )}
            </Card>
            <Card title="Omiljeni igrači">
              {s.favoritePlayers.length ? (
                <ul className="simple-list">
                  {s.favoritePlayers.map((p) => (
                    <li key={`${p.playerId ?? p.name}`}>
                      <strong>{p.name}</strong> — {p.picks}× ({p.hits} pogođeno)
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">—</p>
              )}
            </Card>
            <Card title="Tipovi">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Kolo</th>
                      <th scope="col">Dan</th>
                      <th scope="col">Igrač</th>
                      <th scope="col">Tip</th>
                      <th scope="col">Ishod</th>
                    </tr>
                  </thead>
                  <tbody>
                    {picks.map((p) => (
                      <tr key={p.roundId}>
                        <td>
                          <Link to={`/kolo/${p.roundId}`}>#{p.number}</Link>
                        </td>
                        <td>{formatDate(p.gameDay)}</td>
                        <td>{p.playerName ?? '—'}</td>
                        <td>{lineLabel(p.direction, p.line)}</td>
                        <td>
                          <ResultIcon result={p.result} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </QueryView>
    </div>
  );
}
