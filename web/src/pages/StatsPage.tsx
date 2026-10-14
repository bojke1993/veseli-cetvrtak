import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { OutcomeBucket, OverviewStatsDto, TeamStatsDto } from '@api';
import { useOverview } from '../api/queries';
import { StatsFilter, useStatsQuery } from '../components/StatsFilter';
import { Card, EmptyState, QueryView } from '../components/ui';
import { formatDate, formatMoney, formatPercent } from '../lib/format';

const BUCKET_LABEL: Record<OutcomeBucket['key'], string> = {
  '4/4': '4/4',
  '3/4': '3/4',
  '2/4': '2/4',
  '1/4': '1/4',
  '0/4': '0/4',
  with_void: 'sa poništenim',
};

function Distribution({ buckets }: { buckets: OutcomeBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <ul className="bars" aria-label="Raspodela ishoda">
      {buckets.map((b) => (
        <li key={b.key} className="bar-row" title={`${BUCKET_LABEL[b.key]}: ${b.count} kola (${formatPercent(b.percent)})`}>
          <span className="bar-label">{BUCKET_LABEL[b.key]}</span>
          <span className="bar-track">
            <span className={`bar-fill${b.key === '4/4' ? ' bar-win' : ''}`} style={{ width: `${(b.count / max) * 100}%` }} />
          </span>
          <span className="bar-value tabular">
            {b.count} · {formatPercent(b.percent)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function BalanceChart({ series }: { series: OverviewStatsDto['balanceSeries'] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (series.length < 2) return <p className="muted small">Premalo kola za grafikon.</p>;
  const W = 640;
  const H = 220;
  const pad = { l: 8, r: 8, t: 12, b: 12 };
  const vals = series.map((s) => s.balance);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const span = max - min || 1;
  const x = (i: number) => pad.l + (i / (series.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const path = series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.balance).toFixed(1)}`).join(' ');
  const h = hover !== null ? series[hover] : null;
  const last = series[series.length - 1]!;
  return (
    <figure className="chart">
      <div className="chart-readout small" aria-live="polite">
        {h ? (
          <>
            Kolo #{h.number} ({formatDate(h.gameDay)}): <strong>{formatMoney(h.balance)}</strong>
          </>
        ) : (
          <>
            Trenutno: <strong className={last.balance >= 0 ? 'pos' : 'neg'}>{formatMoney(last.balance)}</strong>
          </>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="line-chart"
        role="img"
        aria-label="Kretanje bilansa kroz kola"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - rect.left) / rect.width) * W;
          const i = Math.round(((rel - pad.l) / (W - pad.l - pad.r)) * (series.length - 1));
          setHover(Math.max(0, Math.min(series.length - 1, i)));
        }}
      >
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="chart-zero" />
        <path d={path} className="chart-line" />
        {h && hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="chart-crosshair" />
            <circle cx={x(hover)} cy={y(h.balance)} r={5} className="chart-dot" />
          </>
        )}
      </svg>
      <figcaption className="small muted">Bilans (dobijeno − uplaćeno) posle svakog kola; linija nule je isprekidana.</figcaption>
      <details className="small">
        <summary>Prikaži tabelu</summary>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Kolo</th>
                <th scope="col">Dan</th>
                <th scope="col">Bilans</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.roundId}>
                  <td>
                    <Link to={`/kolo/${s.roundId}`}>#{s.number}</Link>
                  </td>
                  <td>{formatDate(s.gameDay)}</td>
                  <td className="num">{formatMoney(s.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function TeamStats({ team }: { team: TeamStatsDto }) {
  return (
    <dl className="kv-list">
      <div>
        <dt>Tipova ekipe</dt>
        <dd>{team.picks}</dd>
      </div>
      <div>
        <dt>Pogođeno / promašeno / poništeno</dt>
        <dd>
          {team.hits} / {team.misses} / {team.voids}
        </dd>
      </div>
      <div>
        <dt>Procenat pogodaka</dt>
        <dd>{formatPercent(team.hitPercent)}</dd>
      </div>
      <div>
        <dt>Blejmovi</dt>
        <dd>{team.blames}</dd>
      </div>
    </dl>
  );
}

/** EKR-08 */
export default function StatsPage() {
  const q = useStatsQuery();
  const overview = useOverview(q);
  return (
    <div className="page">
      <h1>Statistika</h1>
      <StatsFilter />
      <QueryView q={overview}>
        {({ stats: s }) =>
          s.rounds === 0 ? (
            <EmptyState>Nema razrešenih kola u izabranom periodu.</EmptyState>
          ) : (
            <>
              {s.hasProvisional && <p className="alert alert-warn small">Neki dobici su privremeni (čeka se unos stvarnog dobitka).</p>}
              <div className="stat-tiles">
                <div className="stat-tile">
                  <span className="kv-label">Ukupno uplaćeno</span>
                  <span className="stat-value">{formatMoney(s.totalStaked)}</span>
                </div>
                <div className="stat-tile">
                  <span className="kv-label">Ukupno dobijeno</span>
                  <span className="stat-value">{formatMoney(s.totalWon)}</span>
                </div>
                <div className="stat-tile">
                  <span className="kv-label">Bilans</span>
                  <span className={`stat-value ${s.balance >= 0 ? 'pos' : 'neg'}`}>
                    <span aria-hidden="true">{s.balance >= 0 ? '▲ ' : '▼ '}</span>
                    {formatMoney(s.balance)}
                  </span>
                </div>
                <div className="stat-tile">
                  <span className="kv-label">ROI</span>
                  <span className="stat-value">{formatPercent(s.roiPercent)}</span>
                </div>
                <div className="stat-tile">
                  <span className="kv-label">Broj kola</span>
                  <span className="stat-value">{s.rounds}</span>
                </div>
                <div className="stat-tile">
                  <span className="kv-label">Dobitnih kola</span>
                  <span className="stat-value">
                    {s.wonRounds} ({formatPercent(s.wonPercent)})
                  </span>
                </div>
                <div className="stat-tile">
                  <span className="kv-label">Najveći dobitak</span>
                  <span className="stat-value">
                    {s.biggestWin ? <Link to={`/kolo/${s.biggestWin.roundId}`}>{formatMoney(s.biggestWin.amount)} (#{s.biggestWin.number})</Link> : '—'}
                  </span>
                </div>
                <div className="stat-tile">
                  <span className="kv-label">Najduži niz gubitnih</span>
                  <span className="stat-value">{s.longestLosingRun}</span>
                </div>
              </div>
              <Card title="Raspodela ishoda">
                <Distribution buckets={s.distribution} />
              </Card>
              <Card title="Kretanje bilansa">
                <BalanceChart series={s.balanceSeries} />
              </Card>
              <Card title="Ekipa (tipovi umesto člana na hlađenju)">
                <TeamStats team={s.team} />
              </Card>
            </>
          )
        }
      </QueryView>
    </div>
  );
}
