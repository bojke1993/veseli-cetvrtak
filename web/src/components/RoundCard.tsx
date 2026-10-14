import { Link } from 'react-router-dom';
import type { RoundDetailDto, RoundSummaryDto } from '@api';
import { formatDate, formatMoney, lineLabel } from '../lib/format';
import { ResultIcon, RoundStatusBadge } from './LiveStatusBadge';
import { BlameName, MemberName } from './MemberName';

export function toSummary(r: RoundDetailDto): RoundSummaryDto {
  return {
    ...r,
    picks: r.picks.map((p) => ({
      slot: p.slot,
      kind: p.kind,
      memberId: p.memberId,
      cooldownForMemberId: p.cooldownForMemberId,
      line: p.line,
      direction: p.direction,
      result: p.result,
      playerName: p.player?.fullName ?? p.importPlayerName,
    })),
  };
}

export function RoundFlags({ round }: { round: Pick<RoundSummaryDto, 'cooldownMemberIds' | 'hasCorrections' | 'source' | 'cooldownInconsistent' | 'actualWinProvisional'> }) {
  return (
    <span className="flags">
      {round.cooldownMemberIds.length > 0 && (
        <span className="flag" title="Hlađenje u ovom kolu">
          <span role="img" aria-label="na hlađenju">
            ❄
          </span>{' '}
          {round.cooldownMemberIds.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <MemberName id={id} showStatus={false} />
            </span>
          ))}
        </span>
      )}
      {round.hasCorrections && <span className="flag flag-warn">✎ ispravljeno</span>}
      {round.source === 'import' && <span className="flag">⇩ uvezeno</span>}
      {round.cooldownInconsistent && <span className="flag flag-bad">⚠ nekonzistentno hlađenje</span>}
      {round.actualWinProvisional && <span className="flag flag-warn">≈ privremen dobitak</span>}
    </span>
  );
}

export function PickMiniList({ picks }: { picks: RoundSummaryDto['picks'] }) {
  return (
    <ul className="pick-mini-list">
      {[...picks]
        .sort((a, b) => a.slot - b.slot)
        .map((p) => (
          <li key={p.slot}>
            <ResultIcon result={p.result} />
            <span className="pick-mini-owner">
              {p.kind === 'team' ? (
                <>
                  Ekipa{' '}
                  <span className="muted small">
                    (umesto <MemberName id={p.cooldownForMemberId} showStatus={false} />)
                  </span>
                </>
              ) : (
                <MemberName id={p.memberId} showStatus={false} />
              )}
            </span>
            <span className="pick-mini-player">{p.playerName ?? '—'}</span>
            <span className="pick-mini-line tabular">{lineLabel(p.direction, p.line)}</span>
          </li>
        ))}
    </ul>
  );
}

/** Round summary card used on Home and History (phone layout). */
export function RoundCard({ round }: { round: RoundSummaryDto }) {
  return (
    <Link to={`/kolo/${round.id}`} className="round-card card card-link">
      <div className="round-card-head">
        <strong>Kolo #{round.number}</strong>
        <span className="muted small">
          {formatDate(round.gameDay)}
          {round.euroleagueRound != null && ` · EL ${round.euroleagueRound}. kolo`}
        </span>
        <RoundStatusBadge status={round.status} />
      </div>
      <div className="round-card-stats small">
        {round.outcomeLabel && <span className="outcome">{round.outcomeLabel}</span>}
        <span>Uplata {formatMoney(round.stake)}</span>
        {round.payerMemberId != null && (
          <span>
            uplatio <MemberName id={round.payerMemberId} showStatus={false} />
          </span>
        )}
        <span>Pot. {formatMoney(round.potentialWin)}</span>
        {round.actualWin != null && <span>Dobitak {formatMoney(round.actualWin)}</span>}
        {round.blame != null && (
          <span>
            Blejm: <BlameName value={round.blame} />
          </span>
        )}
      </div>
      <RoundFlags round={round} />
      <PickMiniList picks={round.picks} />
    </Link>
  );
}
