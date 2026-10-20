import { Link, useSearchParams } from 'react-router-dom';
import { useCurrentRound } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { LiveView } from '../components/LiveView';
import { RoundStatusBadge } from '../components/LiveStatusBadge';
import { NewRoundFlow } from '../components/round/NewRoundFlow';
import { RoundEditor } from '../components/round/RoundEditor';
import { Card, QueryView } from '../components/ui';
import { formatDate, formatMoney, formatOdds } from '../lib/format';
import { RoundDetailView } from './RoundDetailPage';

/** /kolo — open round editor, live view or the last resolved round (+ new round flow for admin). */
export function CurrentRoundPage() {
  const q = useCurrentRound();
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const wantsNew = params.get('novo') === '1';

  return (
    <QueryView q={q}>
      {(data) => {
        const r = data.round;
        if (r?.status === 'open') return <RoundEditor round={r} />;
        if (r && (r.status === 'locked' || r.status === 'in_progress')) {
          return (
            <div className="page">
              <div className="page-head">
                <h1>Kolo #{r.number}</h1>
                <RoundStatusBadge status={r.status} />
              </div>
              <p className="muted small">
                {formatDate(r.gameDay)} · uplata {formatMoney(r.stake)} · kvota {formatOdds(r.totalOdds)}
              </p>
              <LiveView round={r} />
              <Link to={`/kolo/${r.id}`} className="btn">
                Detalj kola{isAdmin ? ' i ispravke' : ''} ›
              </Link>
            </div>
          );
        }
        return (
          <div className="page">
            {isAdmin && (data.canOpenNew ? (
              wantsNew || !r ? (
                <NewRoundFlow onCancel={r ? () => setParams({}) : undefined} />
              ) : (
                <Card title="Nema otvorenog kola">
                  <button type="button" className="btn btn-primary" onClick={() => setParams({ novo: '1' })}>
                    + Novo kolo
                  </button>
                </Card>
              )
            ) : (
              <Card title="Nema otvorenog kola">
                <button type="button" className="btn btn-primary" disabled>
                  + Novo kolo
                </button>
                {data.reasonCannotOpen && <p className="small muted">{data.reasonCannotOpen}</p>}
              </Card>
            ))}
            {!isAdmin && !r && (
              <Card title="Nema aktivnog kola">
                <p className="muted">Kolo još nije otvoreno.</p>
              </Card>
            )}
            {r && <RoundDetailView round={r} />}
          </div>
        );
      }}
    </QueryView>
  );
}
