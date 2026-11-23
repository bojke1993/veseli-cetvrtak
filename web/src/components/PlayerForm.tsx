import type { PlayerFormDto } from '@api';
import { usePlayerForm } from '../api/queries';
import { formatLine, formatNumber, formatShortDate, plural } from '../lib/format';

/** Points of the last games as bars: oldest on the left, newest on the right (BR-40). */
export function FormBars({ form, line, compact = false }: { form: PlayerFormDto; line?: number | null; compact?: boolean }) {
  const games = form.games;
  const top = Math.max(1, line ?? 0, ...games.map((g) => g.points));
  const linePct = line != null ? (line / top) * 100 : null;
  return (
    <div className={`form-bars${compact ? ' is-compact' : ''}`}>
      <ol
        className="form-bars-list"
        aria-label={`Poeni u poslednjim utakmicama (${games.length}), od najstarije do najnovije`}
      >
        {games.map((g, i) => {
          const over = line != null && !g.dnp && g.points > line;
          const cls = ['form-bar', g.dnp ? 'is-dnp' : '', over ? 'is-over' : '', i === games.length - 1 ? 'is-latest' : '']
            .filter(Boolean)
            .join(' ');
          const vs = g.opponent ? `${g.home === false ? '@' : 'vs'} ${g.opponent}` : null;
          return (
            <li key={g.gameId} className={cls} title={`${formatShortDate(g.gameDay)}${vs ? ` ${vs}` : ''}: ${g.dnp ? 'DNP' : `${g.points} poena`}`}>
              <span className="form-bar-track">
                <span className="form-bar-fill" style={{ height: `${g.dnp ? 0 : Math.max(4, (g.points / top) * 100)}%` }} />
                {linePct !== null && <span className="form-bar-line" style={{ bottom: `${linePct}%` }} aria-hidden="true" />}
              </span>
              <span className="form-bar-value tabular">{g.dnp ? 'DNP' : g.points}</span>
              {!compact && <span className="form-bar-opp">{g.opponent ?? '—'}</span>}
              <span className="sr-only">
                {formatShortDate(g.gameDay)} {vs ?? ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** One-line summary for the autocomplete list. */
export function FormSummary({ form }: { form: PlayerFormDto }) {
  if (form.games.length === 0) return null;
  return (
    <span className="form-summary">
      <FormBars form={form} compact />
      {form.average !== null && <span className="small muted">Ø {formatNumber(form.average, 1)}</span>}
    </span>
  );
}

/** FR-29 — player form in the pick card: last 5 games, average, our history, games over the line. */
export function PlayerForm({ playerId, line }: { playerId: number; line?: number | null }) {
  const q = usePlayerForm(playerId);
  const form = q.data?.form;
  if (!form) return q.isLoading ? <p className="small muted">Učitavam formu…</p> : null;
  const played = form.games.filter((g) => !g.dnp);
  const overCount = line != null ? played.filter((g) => g.points > line).length : null;
  return (
    <section className="player-form" aria-label="Forma igrača">
      <div className="player-form-head small">
        <strong>Forma</strong>
        {form.average !== null && <span>prosek {formatNumber(form.average, 1)}</span>}
      </div>
      {form.games.length === 0 ? (
        <p className="small muted">Nema podataka o formi.</p>
      ) : (
        <>
          <FormBars form={form} line={line} />
          <div className="timeline-hint" aria-hidden="true">
            <span>← starije</span>
            <span>novije →</span>
          </div>
        </>
      )}
      <p className="small muted player-form-notes">
        {overCount !== null && played.length > 0 && (
          <>
            Iznad {formatLine(line)} u <strong>{overCount}</strong> od {played.length}.{' '}
          </>
        )}
        {form.ourPicks > 0 ? (
          <>
            Birali smo ga {form.ourPicks}×, {form.ourHits} {plural(form.ourHits, 'pogođen', 'pogođena', 'pogođenih')}.
          </>
        ) : (
          'Nismo ga još birali.'
        )}
      </p>
    </section>
  );
}
