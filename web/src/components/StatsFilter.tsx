import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { StatsQuery } from '@api';
import { useSeasons } from '../api/queries';

/** Season + period filter stored in URL params; returns the stats query. */
export function useStatsQuery(): StatsQuery {
  const [sp] = useSearchParams();
  return useMemo(() => {
    const q: StatsQuery = {};
    const season = sp.get('season');
    if (season) q.season = season;
    if (sp.get('from')) q.from = sp.get('from')!;
    if (sp.get('to')) q.to = sp.get('to')!;
    return q;
  }, [sp]);
}

export function StatsFilter({ showPeriod = true }: { showPeriod?: boolean }) {
  const [sp, setSp] = useSearchParams();
  const seasons = useSeasons();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    setSp(next, { replace: true });
  };
  const current = seasons.data?.current ?? '';
  return (
    <div className="stats-filter">
      <div className="field">
        <label htmlFor="sf-season">Sezona</label>
        <select id="sf-season" value={sp.get('season') ?? current} onChange={(e) => set('season', e.target.value === current ? '' : e.target.value)}>
          {!seasons.data && <option value="">Aktuelna sezona</option>}
          {seasons.data?.seasons.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
              {s.code === current ? ' (aktuelna)' : ''}
            </option>
          ))}
          <option value="all">Sve sezone</option>
        </select>
      </div>
      {showPeriod && (
        <>
          <div className="field">
            <label htmlFor="sf-from">Od</label>
            <input id="sf-from" type="date" value={sp.get('from') ?? ''} onChange={(e) => set('from', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sf-to">Do</label>
            <input id="sf-to" type="date" value={sp.get('to') ?? ''} onChange={(e) => set('to', e.target.value)} />
          </div>
        </>
      )}
    </div>
  );
}
