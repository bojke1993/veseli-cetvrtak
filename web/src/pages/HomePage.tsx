import { Link } from 'react-router-dom';
import type { CurrentRoundResponse, RoundDetailDto } from '@api';
import { useBlame, useCurrentRound, useOverview } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { LiveView } from '../components/LiveView';
import { BlameName, MemberName, useMemberList } from '../components/MemberName';
import { RoundCard, toSummary } from '../components/RoundCard';
import { Card, QueryView } from '../components/ui';
import { useNow } from '../hooks/useNow';
import { formatCountdown, formatDate, formatMoney, formatPercent, formatTime, streakShort, streakText } from '../lib/format';

export function NewRoundButton({ data }: { data: CurrentRoundResponse }) {
  const { isAdmin, isGuest } = useAuth();
  if (isGuest) return null;
  if (!isAdmin) return null;
  return (
    <div className="new-round">
      {data.canOpenNew ? (
        <Link to="/kolo?novo=1" className="btn btn-primary">
          + Novo kolo
        </Link>
      ) : (
        <>
          <button type="button" className="btn btn-primary" disabled aria-describedby="new-round-reason">
            + Novo kolo
          </button>
          {data.reasonCannotOpen && (
            <p id="new-round-reason" className="small muted">
              {data.reasonCannotOpen}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function OpenRoundCard({ round }: { round: RoundDetailDto }) {
  const now = useNow(30_000);
  const entered = round.picks.filter((p) => p.player || p.importPlayerName).length;
  const ms = round.firstGameAt ? new Date(round.firstGameAt).getTime() - now : null;
  return (
    <Card title={`Kolo #${round.number} — u pripremi`}>
      <dl className="kv-list">
        <div>
          <dt>Dan kola</dt>
          <dd>{formatDate(round.gameDay)}</dd>
        </div>
        <div>
          <dt>Uneti tipovi</dt>
          <dd>
            <strong>{entered}/4</strong>
          </dd>
        </div>
        {round.firstGameAt && (
          <div>
            <dt>Prva utakmica</dt>
            <dd>
              {formatTime(round.firstGameAt)}
              {ms !== null && ms > 0 && <> · za {formatCountdown(ms)}</>}
            </dd>
          </div>
        )}
        {round.cooldownMemberIds.length > 0 && (
          <div>
            <dt>Na hlađenju</dt>
            <dd>
              {round.cooldownMemberIds.map((id) => (
                <MemberName key={id} id={id} chip forceCooldown />
              ))}
            </dd>
          </div>
        )}
      </dl>
      <Link to="/kolo" className="btn btn-primary">
        Otvori kolo
      </Link>
    </Card>
  );
}

function ActiveRound({ data }: { data: CurrentRoundResponse }) {
  const r = data.round;
  if (!r) {
    return (
      <Card title="Nema aktivnog kola">
        <p className="muted">Još nema nijednog kola.</p>
        <NewRoundButton data={data} />
      </Card>
    );
  }
  if (r.status === 'open') return <OpenRoundCard round={r} />;
  if (r.status === 'locked' || r.status === 'in_progress') {
    return (
      <Card
        title={`Kolo #${r.number} — ${r.status === 'locked' ? 'zaključeno' : 'u toku'}`}
        actions={
          <Link to="/kolo" className="btn btn-small">
            Live ›
          </Link>
        }
      >
        <Link to="/kolo" className="card-link-plain" aria-label="Otvori live praćenje">
          <LiveView round={r} compact />
        </Link>
      </Card>
    );
  }
  return (
    <section>
      <h2 className="section-title">Poslednje kolo</h2>
      <RoundCard round={toSummary(r)} />
      <NewRoundButton data={data} />
    </section>
  );
}

function MiniStats() {
  const overview = useOverview({});
  const blame = useBlame({});
  const members = useMemberList();
  const s = overview.data?.stats;
  const leader = blame.data?.rows.find((r) => r.rank === 1 && r.blames > 0);
  return (
    <Card title="Ukratko" actions={<Link to="/statistika" className="btn btn-small">Statistika ›</Link>}>
      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="kv-label">Bilans</span>
          <span className={`stat-value ${s ? (s.balance >= 0 ? 'pos' : 'neg') : ''}`}>{s ? formatMoney(s.balance) : '…'}</span>
        </div>
        <div className="stat-tile">
          <span className="kv-label">Dobitnih kola</span>
          <span className="stat-value">{s ? `${formatPercent(s.wonPercent)} (${s.wonRounds}/${s.rounds})` : '…'}</span>
        </div>
        <div className="stat-tile">
          <span className="kv-label">Kralj blejma</span>
          <span className="stat-value">{leader ? <BlameName value={leader.memberId} /> : '—'}</span>
        </div>
      </div>
      <ul className="member-status-list">
        {members.map((m) => (
          <li key={m.id}>
            <Link to={`/clanovi/${m.id}`}>
              <MemberName id={m.id} />
            </Link>
            <span className="small muted" title={streakText(m.status.streak)}>
              <span aria-hidden="true">{streakShort(m.status.streak)}</span>
              <span className="sr-only">{streakText(m.status.streak)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** EKR-02 */
export function HomePage() {
  const current = useCurrentRound();
  return (
    <div className="page">
      <div className="page-head">
        <h1>Početna</h1>
      </div>
      <QueryView q={current}>{(data) => <ActiveRound data={data} />}</QueryView>
      <MiniStats />
    </div>
  );
}
