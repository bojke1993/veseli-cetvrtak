import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MemberStatsDto } from '@api';
import { useMembersStats } from '../api/queries';
import { MemberAvatar, MemberName, memberLabel, useMemberMap } from '../components/MemberName';
import { TEAM_PHOTO } from '../lib/memberPhotos';
import { StatsFilter, useStatsQuery } from '../components/StatsFilter';
import { QueryView } from '../components/ui';
import { formatMoney, formatPercent, streakShort, streakText } from '../lib/format';

type Col = { key: string; label: string; get: (m: MemberStatsDto) => number | null; render?: (m: MemberStatsDto) => ReactNode };

const COLS: Col[] = [
  { key: 'hits', label: 'Pogođeni', get: (m) => m.hits },
  { key: 'misses', label: 'Promašeni', get: (m) => m.misses },
  { key: 'voids', label: 'Poništeni', get: (m) => m.voids },
  { key: 'hitPercent', label: '%', get: (m) => m.hitPercent, render: (m) => formatPercent(m.hitPercent) },
  { key: 'blames', label: 'Blejm', get: (m) => m.blames },
  { key: 'payments', label: 'Uplata', get: (m) => m.payments },
  { key: 'paidTotal', label: 'Uplaćeno', get: (m) => m.paidTotal, render: (m) => formatMoney(m.paidTotal) },
  {
    key: 'currentStreak',
    label: 'Niz',
    get: (m) => m.currentStreak,
    render: (m) => <span title={streakText(m.currentStreak)}>{streakShort(m.currentStreak)}</span>,
  },
  { key: 'longestHitStreak', label: 'Najduži ✔', get: (m) => m.longestHitStreak },
  { key: 'longestMissStreak', label: 'Najduži ✘', get: (m) => m.longestMissStreak },
  { key: 'cooldowns', label: 'Hlađenja', get: (m) => m.cooldowns },
  { key: 'fires', label: 'Vatrice', get: (m) => m.fires },
];

/** EKR-09 — members table */
export default function MembersPage() {
  const q = useStatsQuery();
  const stats = useMembersStats(q);
  const map = useMemberMap();
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'hitPercent', dir: -1 });

  const toggle = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 }));

  return (
    <div className="page">
      <h1>Članovi</h1>
      <figure className="team-hero">
        <img src={TEAM_PHOTO.src} alt="Ivanišević, Tozislav, Lakićević i Simara" />
        <figcaption>
          <strong>{TEAM_PHOTO.title}</strong>
          <span>{TEAM_PHOTO.caption}</span>
        </figcaption>
      </figure>
      <StatsFilter />
      <QueryView q={stats}>
        {({ members }) => {
          const col = COLS.find((c) => c.key === sort.key);
          const rows = [...members].sort((a, b) => {
            if (sort.key === 'name') return memberLabel(map, a.memberId).localeCompare(memberLabel(map, b.memberId), 'sr') * sort.dir;
            const va = col?.get(a) ?? -Infinity;
            const vb = col?.get(b) ?? -Infinity;
            return (va - vb) * sort.dir;
          });
          const ariaSort = (key: string) => (sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');
          const arrow = (key: string) => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
          return (
            <div className="table-wrap sticky-first">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col" aria-sort={ariaSort('name')}>
                      <button type="button" className="th-btn" onClick={() => toggle('name')}>
                        Član{arrow('name')}
                      </button>
                    </th>
                    {COLS.map((c) => (
                      <th key={c.key} scope="col" aria-sort={ariaSort(c.key)}>
                        <button type="button" className="th-btn" onClick={() => toggle(c.key)}>
                          {c.label}
                          {arrow(c.key)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.memberId}>
                      <th scope="row">
                        <Link to={`/clanovi/${m.memberId}`} className="member-link">
                          <MemberAvatar member={map.get(m.memberId)} size={32} />
                          <MemberName id={m.memberId} />
                        </Link>
                      </th>
                      {COLS.map((c) => (
                        <td key={c.key} className="num">
                          {c.render ? c.render(m) : (c.get(m) ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </QueryView>
      <p className="small muted">Tipovi ekipe ne ulaze u ličnu statistiku. Trenutni niz i ❄/🔥 važe za aktuelnu sezonu.</p>
    </div>
  );
}
