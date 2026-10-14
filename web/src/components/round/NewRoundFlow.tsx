import { useState } from 'react';
import { useCreateRound, useGameDays } from '../../api/queries';
import { formatDate, formatTime } from '../../lib/format';
import { gameLabel } from '../PlayerInfo';
import { Card, MutationError, QueryView } from '../ui';

/** Admin: choose the game day and open a new round (REQ-06). */
export function NewRoundFlow({ onCancel }: { onCancel?: () => void }) {
  const days = useGameDays();
  const create = useCreateRound();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Card title="Novo kolo">
      <QueryView q={days}>
        {(data) => {
          if (data.days.length === 0) return <p className="muted">Nema narednih dana sa nezapočetim utakmicama Evrolige.</p>;
          const day = selected ?? data.days[0]!.day;
          return (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate({ gameDay: day });
              }}
            >
              <fieldset className="day-list">
                <legend>Dan kola</legend>
                {data.days.map((d) => (
                  <label key={d.day} className={`day-option${d.day === day ? ' is-on' : ''}`}>
                    <input type="radio" name="gameDay" value={d.day} checked={d.day === day} onChange={() => setSelected(d.day)} />
                    <span>
                      <strong>{formatDate(d.day)}</strong>
                      <ul className="small game-list">
                        {d.games.map((g) => (
                          <li key={g.id}>
                            {formatTime(g.scheduledAt)} {gameLabel(g)}
                          </li>
                        ))}
                      </ul>
                    </span>
                  </label>
                ))}
              </fieldset>
              <MutationError error={create.error} />
              <div className="btn-row">
                <button type="submit" className="btn btn-primary" disabled={create.isPending}>
                  Otvori kolo za {formatDate(day)}
                </button>
                {onCancel && (
                  <button type="button" className="btn" onClick={onCancel}>
                    Odustani
                  </button>
                )}
              </div>
            </form>
          );
        }}
      </QueryView>
    </Card>
  );
}
