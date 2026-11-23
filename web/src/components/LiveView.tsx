import type { PickDto, RoundDetailDto } from '@api';
import {
  formatDateTime,
  formatLine,
  formatMoney,
  formatOdds,
  formatSecondsPlayed,
  formatTime,
  pointsText,
} from '../lib/format';
import { useNow } from '../hooks/useNow';
import { Celebration } from './Celebration';
import { LiveStatusBadge } from './LiveStatusBadge';
import { MemberName } from './MemberName';
import { GameLine, PlayerInfo } from './PlayerInfo';

export const STALE_AFTER_MS = 2 * 60 * 1000;

export function sortPicksByGameTime(picks: PickDto[]): PickDto[] {
  return [...picks].sort((a, b) => {
    const ta = a.game?.scheduledAt ?? '9999';
    const tb = b.game?.scheduledAt ?? '9999';
    return ta < tb ? -1 : ta > tb ? 1 : a.slot - b.slot;
  });
}

/** Why a member's slot went to the team: ❄ cooldown or 🟥 suspension (BR-37). */
export function SitOutIcon({ suspension }: { suspension?: boolean }) {
  return suspension ? (
    <span role="img" aria-label="suspenzija" title="Preskače kolo (disciplinska mera)">
      🟥
    </span>
  ) : (
    <span role="img" aria-label="na hlađenju">
      ❄
    </span>
  );
}

export function PickOwner({ pick }: { pick: Pick<PickDto, 'kind' | 'memberId' | 'cooldownForMemberId'> & { suspension?: boolean } }) {
  if (pick.kind === 'team') {
    return (
      <span className="pick-owner">
        Ekipa umesto <MemberName id={pick.cooldownForMemberId} showStatus={false} /> <SitOutIcon suspension={pick.suspension} />
      </span>
    );
  }
  return (
    <span className="pick-owner">
      <MemberName id={pick.memberId} />
    </span>
  );
}

/** BR-39: rough ticket chance; shown only while the outcome is still open. */
export function TicketChance({ chance }: { chance: number | null }) {
  if (chance === null || chance === 0 || chance === 100) return null;
  return (
    <span className="ticket-chance" title="Gruba procena na osnovu forme igrača i tempa poena — ne utiče na obračun">
      <span className="ticket-chance-text small">
        Šanse <strong className="tabular">~{chance}%</strong> <span className="muted">(gruba procena)</span>
      </span>
      <span className="ticket-chance-track" aria-hidden="true">
        <span className="ticket-chance-fill" style={{ width: `${chance}%` }} />
      </span>
    </span>
  );
}

export function TicketIndicator({ round }: { round: Pick<RoundDetailDto, 'ticketAlive' | 'passingCount' | 'picks' | 'ticketChance'> }) {
  if (round.ticketAlive === null) return null;
  if (round.ticketAlive) {
    return (
      <div className="ticket-indicator-row">
        <span className="ticket-indicator tone-good" role="status">
          <span aria-hidden="true">●</span> Tiket živ — {round.passingCount ?? 0}/{round.picks.length || 4} u prolazu
        </span>
        <TicketChance chance={round.ticketChance} />
      </div>
    );
  }
  return (
    <span className="ticket-indicator tone-awful" role="status">
      <span aria-hidden="true" className="ticket-sink">
        ✘
      </span>{' '}
      Tiket pao
    </span>
  );
}

export function LivePickCard({ pick, compact = false }: { pick: PickDto; compact?: boolean }) {
  const live = pick.live;
  const status = live?.status ?? (pick.result === 'hit' ? 'final_hit' : pick.result === 'miss' ? 'final_miss' : pick.result === 'void' ? 'void' : 'not_started');
  const points = live?.points ?? pick.finalPoints;
  const notStarted = !pick.game || pick.game.status === 'scheduled';
  return (
    <article className={`live-card status-${status}${compact ? ' compact' : ''}`} aria-label={`Tip ${pick.slot}`}>
      <header className="live-card-head">
        <PickOwner pick={pick} />
        <LiveStatusBadge status={status} />
      </header>
      <div className="live-card-body">
        <PlayerInfo player={pick.player} fallbackName={pick.importPlayerName} game={compact ? undefined : pick.game} />
        <div className="live-points" aria-live="polite">
          <span className="points-big tabular" key={String(points)}>
            {notStarted || points == null ? '–' : points}
          </span>
          <span className="points-line">/ {pick.direction === 'under' ? 'manje' : 'više'} {formatLine(pick.line)}</span>
        </div>
      </div>
      {!compact && (
        <footer className="live-card-foot small">
          {pick.direction === 'over' && live?.pointsNeeded != null && live.pointsNeeded > 0 && status !== 'final_miss' && (
            <strong>fali još {pointsText(live.pointsNeeded)}</strong>
          )}
          <span>Min: {formatSecondsPlayed(live?.secondsPlayed)}</span>
          <span>Lične: {live?.fouls ?? '–'}</span>
          {pick.odds != null && <span>Kvota: {formatOdds(pick.odds)}</span>}
          {pick.chance != null && pick.chance > 0 && pick.chance < 100 && (
            <span title="Gruba procena (BR-39)">Šansa: ~{pick.chance}%</span>
          )}
          {notStarted && pick.game && <span>počinje u {formatTime(pick.game.scheduledAt)}</span>}
        </footer>
      )}
      {compact && pick.game && (
        <div className="small muted">
          <GameLine game={pick.game} />
        </div>
      )}
    </article>
  );
}

/** EKR-03 — live view of a locked / in-progress round. */
export function LiveView({ round, compact = false }: { round: RoundDetailDto; compact?: boolean }) {
  const now = useNow(15_000);
  const updated = round.liveUpdatedAt ? new Date(round.liveUpdatedAt).getTime() : null;
  const stale = round.status === 'in_progress' && updated !== null && now - updated > STALE_AFTER_MS;
  const picks = sortPicksByGameTime(round.picks);
  return (
    <div className="live-view">
      <Celebration round={round} />
      {!compact && (
        <div className="live-header card">
          <div className="kv-row">
            <div>
              <span className="kv-label">Uplata</span>
              <span className="kv-value">{formatMoney(round.stake)}</span>
            </div>
            <div>
              <span className="kv-label">Kvota</span>
              <span className="kv-value">{formatOdds(round.totalOdds)}</span>
            </div>
            <div>
              <span className="kv-label">Potencijalni dobitak</span>
              <span className="kv-value">{formatMoney(round.potentialWin)}</span>
            </div>
          </div>
          <TicketIndicator round={round} />
        </div>
      )}
      {compact && <TicketIndicator round={round} />}
      <div className={compact ? 'live-grid compact' : 'live-grid'}>
        {picks.map((p) => (
          <LivePickCard key={p.slot} pick={p} compact={compact} />
        ))}
      </div>
      <p className="small muted live-updated">
        {round.liveUpdatedAt ? `Poslednje osvežavanje: ${formatDateTime(round.liveUpdatedAt)}` : 'Još nema live podataka.'}
        {stale && (
          <span className="badge tone-bad stale-badge" role="alert">
            <span aria-hidden="true">⚠</span> Podaci kasne
          </span>
        )}
      </p>
    </div>
  );
}
