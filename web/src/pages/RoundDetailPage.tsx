import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { AuditEntryDto, PickDto, RoundDetailDto } from '@api';
import { useRound } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { ResultBadge, RoundStatusBadge } from '../components/LiveStatusBadge';
import { LiveView, PickOwner } from '../components/LiveView';
import { BlameName, MemberName, useMemberMap, memberLabel } from '../components/MemberName';
import { PlayerInfo } from '../components/PlayerInfo';
import { AdminActionsMenu } from '../components/round/AdminActions';
import { RoundEditor } from '../components/round/RoundEditor';
import { RoundFlags } from '../components/RoundCard';
import { QueryView } from '../components/ui';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatOdds,
  formatSecondsPlayed,
  lineLabel,
  RESOLUTION_LABEL,
  VOID_REASON_LABEL,
} from '../lib/format';

function PickDetail({ pick }: { pick: PickDto }) {
  return (
    <article className="card pick-detail">
      <header className="card-header">
        <PickOwner pick={pick} />
        <ResultBadge result={pick.result} />
      </header>
      <PlayerInfo player={pick.player} fallbackName={pick.importPlayerName} game={pick.game} />
      <dl className="kv-inline small">
        <div>
          <dt>Tip</dt>
          <dd>
            <strong>{lineLabel(pick.direction, pick.line)}</strong>
          </dd>
        </div>
        <div>
          <dt>Kvota</dt>
          <dd>{formatOdds(pick.odds)}</dd>
        </div>
        <div>
          <dt>Poeni</dt>
          <dd>{pick.finalPoints ?? pick.live?.points ?? '—'}</dd>
        </div>
        <div>
          <dt>Minuti</dt>
          <dd>{formatSecondsPlayed(pick.live?.secondsPlayed)}</dd>
        </div>
        {pick.resolution && (
          <div>
            <dt>Razrešenje</dt>
            <dd>{RESOLUTION_LABEL[pick.resolution]}</dd>
          </div>
        )}
        {pick.voidReason && (
          <div>
            <dt>Poništen</dt>
            <dd>{VOID_REASON_LABEL[pick.voidReason]}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export function AuditList({ items }: { items: AuditEntryDto[] }) {
  const members = useMemberMap();
  if (!items.length) return <p className="muted">Nema zapisa.</p>;
  return (
    <ol className="audit-list">
      {items.map((a) => (
        <li key={a.id}>
          <div className="audit-head small">
            <time dateTime={a.at}>{formatDateTime(a.at)}</time> · <strong>{a.actorMemberId == null ? 'sistem' : memberLabel(members, a.actorMemberId)}</strong> ·{' '}
            {a.action}
            {a.roundId != null && (
              <>
                {' '}
                · <Link to={`/kolo/${a.roundId}`}>kolo</Link>
              </>
            )}
          </div>
          {(a.field || a.entity) && (
            <div className="small">
              {[a.entity, a.entityId, a.field].filter(Boolean).join(' · ')}: <span className="old-value">{fmtValue(a.oldValue)}</span> →{' '}
              <span className="new-value">{fmtValue(a.newValue)}</span>
            </div>
          )}
          {a.reason && <div className="small muted">Razlog: {a.reason}</div>}
        </li>
      ))}
    </ol>
  );
}

const ACTION_PARAM: Record<string, 'unlock' | 'correct' | 'resolve' | 'actualWin'> = {
  razresi: 'resolve',
  resolve: 'resolve',
  dobitak: 'actualWin',
  'actual-win': 'actualWin',
  ispravka: 'correct',
  correct: 'correct',
  otkljucaj: 'unlock',
  unlock: 'unlock',
};

export function RoundDetailView({ round }: { round: RoundDetailDto }) {
  const { isAdmin, isMember } = useAuth();
  const [params] = useSearchParams();
  const initialAction = ACTION_PARAM[params.get('akcija') ?? ''] ?? null;
  const slotParam = Number(params.get('slot'));
  const live = round.status === 'locked' || round.status === 'in_progress';
  const proposals = round.proposals;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Kolo #{round.number}</h1>
        <RoundStatusBadge status={round.status} />
        {isAdmin && round.status !== 'open' && (
          <AdminActionsMenu round={round} initialAction={initialAction} initialSlot={Number.isFinite(slotParam) && slotParam > 0 ? slotParam : undefined} />
        )}
      </div>

      <section className="card">
        <dl className="kv-list">
          <div>
            <dt>Dan kola</dt>
            <dd>{formatDate(round.gameDay)}</dd>
          </div>
          <div>
            <dt>Kolo Evrolige</dt>
            <dd>{round.euroleagueRound ?? '—'}</dd>
          </div>
          <div>
            <dt>Sezona</dt>
            <dd>{round.seasonCode}</dd>
          </div>
          <div>
            <dt>Otvoreno</dt>
            <dd>{formatDateTime(round.openedAt)}</dd>
          </div>
          {round.lockedAt && (
            <div>
              <dt>Zaključano</dt>
              <dd>
                {formatDateTime(round.lockedAt)} ({round.lockedBy == null ? 'sistem' : <MemberName id={round.lockedBy} showStatus={false} />})
              </dd>
            </div>
          )}
          {round.resolvedAt && (
            <div>
              <dt>Razrešeno</dt>
              <dd>{formatDateTime(round.resolvedAt)}</dd>
            </div>
          )}
          <div>
            <dt>Ishod</dt>
            <dd>
              <strong>{round.outcomeLabel ?? '—'}</strong>
            </dd>
          </div>
          <div>
            <dt>Uplata</dt>
            <dd>{formatMoney(round.stake)}</dd>
          </div>
          <div>
            <dt>Ukupna kvota</dt>
            <dd>{formatOdds(round.totalOdds)}</dd>
          </div>
          <div>
            <dt>Uplatilac</dt>
            <dd>{round.payerMemberId != null ? <MemberName id={round.payerMemberId} showStatus={false} /> : '—'}</dd>
          </div>
          <div>
            <dt>Potencijalni dobitak</dt>
            <dd>{formatMoney(round.potentialWin)}</dd>
          </div>
          <div>
            <dt>Stvarni dobitak</dt>
            <dd>
              {formatMoney(round.actualWin)}
              {round.actualWinProvisional && <span className="muted"> (privremeno)</span>}
            </dd>
          </div>
          <div>
            <dt>Blejm</dt>
            <dd>
              <BlameName value={round.blame} />
            </dd>
          </div>
        </dl>
        <RoundFlags round={round} />
        {round.fireChanges.length > 0 && (
          <p className="small">
            {round.fireChanges.map((f) => (
              <span key={f.memberId} className="flag">
                <span role="img" aria-label="vatrica">
                  🔥
                </span>{' '}
                <MemberName id={f.memberId} showStatus={false} /> {f.change === 'gained' ? 'dobio vatricu' : 'izgubio vatricu'}
              </span>
            ))}
          </p>
        )}
      </section>

      {live ? (
        <LiveView round={round} />
      ) : (
        <div className="pick-cards">
          {[...round.picks]
            .sort((a, b) => a.slot - b.slot)
            .map((p) => (
              <PickDetail key={p.slot} pick={p} />
            ))}
        </div>
      )}

      {proposals.length > 0 && (
        <section className="card">
          <h2 className="card-title">Predlozi</h2>
          <ul className="proposal-list">
            {proposals.map((p) => (
              <li key={p.id} className="small">
                <MemberName id={p.proposedBy} showStatus={false} /> → {p.player.fullName} {lineLabel(p.direction, p.line)}{' '}
                {p.kind === 'team' && (
                  <span className="muted">
                    (tip ekipe umesto <MemberName id={p.cooldownForMemberId} showStatus={false} />)
                  </span>
                )}{' '}
                · 👍 {p.votes.length} · {p.status === 'accepted' ? 'prihvaćen' : p.status === 'pending' ? 'na čekanju' : p.status === 'rejected' ? 'odbijen' : 'zamenjen'}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isMember && (
        <section className="card">
          <h2 className="card-title">Istorija izmena</h2>
          <AuditList items={round.audit} />
        </section>
      )}
    </div>
  );
}

/** EKR-07 — /kolo/:id */
export function RoundDetailPage() {
  const { id } = useParams();
  const roundId = Number(id);
  const q = useRound(Number.isFinite(roundId) ? roundId : null);
  if (!Number.isFinite(roundId)) return <p className="alert">Neispravan broj kola.</p>;
  return (
    <QueryView q={q}>
      {({ round }) => (round.status === 'open' ? <RoundEditor round={round} /> : <RoundDetailView round={round} />)}
    </QueryView>
  );
}
