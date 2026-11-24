import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMemberStats } from '../api/queries';
import { ResultIcon } from '../components/LiveStatusBadge';
import { MemberName, useMemberMap } from '../components/MemberName';
import { memberMood, memberPhoto } from '../lib/memberPhotos';
import { StatsFilter, useStatsQuery } from '../components/StatsFilter';
import { Card, QueryView } from '../components/ui';
import { SanctionList } from './DisciplinePage';
import { formatDate, formatMoney, formatPercent, lineLabel, streakText } from '../lib/format';
import { BADGE_META, nearMissMessage } from '../lib/records';
import { BadgeGuide } from '../components/BadgeGuide';
import type { MemberStatsDto } from '@api';

function MemberHero({ id }: { id: number }) {
  const member = useMemberMap().get(id);
  const photo = memberPhoto(member);
  // New message per profile visit; live refreshes must not swap the text.
  const roll = useMemo(() => Math.random(), [id]);
  const mood = member ? memberMood(member.status, roll) : null;
  return (
    <section className={photo ? 'member-hero' : undefined}>
      {photo && <img className="member-hero-photo" src={photo.src} alt={`${member?.displayName ?? ''}`} />}
      <div className="member-hero-text">
        <h1>
          <MemberName id={id} />
        </h1>
        {photo?.nickname && <p className="member-hero-nick">„{photo.nickname}“</p>}
        {photo?.caption && <p className="muted">{photo.caption}</p>}
        {mood && (
          <p className="member-hero-mood">
            <span aria-hidden="true">{mood.emoji}</span> {mood.text}
          </p>
        )}
      </div>
    </section>
  );
}

/** FR-28 — badges earned in the selected period */
export function BadgeList({ badges }: { badges: MemberStatsDto['badges'] }) {
  if (badges.length === 0) return <p className="muted small">Još nema bedževa.</p>;
  return (
    <ul className="badges">
      {badges.map((b) => {
        const meta = BADGE_META[b.code];
        return (
          <li key={b.code} className="badge-chip" title={`${meta.description} — prvi put u kolu #${b.firstRoundNumber}`}>
            <span aria-hidden="true">{meta.emoji}</span> {meta.label}
            {b.count > 1 && <span className="badge-count">×{b.count}</span>}
            <span className="sr-only">
              {' '}
              — {meta.description}, prvi put u kolu #{b.firstRoundNumber}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function NearMissTile({ nearMisses }: { nearMisses: MemberStatsDto['nearMisses'] }) {
  const roll = useMemo(() => Math.random(), []);
  const message = nearMissMessage(nearMisses.count, roll);
  return (
    <div className="stat-tile">
      <span className="kv-label">Za dlaku (promašaj za 0,5)</span>
      <span className="stat-value">
        {nearMisses.count}
        {nearMisses.lostPotentialWin > 0 && <> · {formatMoney(nearMisses.lostPotentialWin)}</>}
      </span>
      {message && <span className="small muted">{message}</span>}
    </div>
  );
}

/** EKR-09 — member profile */
export default function MemberProfilePage() {
  const { id } = useParams();
  const memberId = Number(id);
  const q = useStatsQuery();
  const stats = useMemberStats(memberId, q);
  return (
    <div className="page">
      <p>
        <Link to="/clanovi">‹ Članovi</Link>
      </p>
      <MemberHero id={memberId} />
      <StatsFilter />
      <QueryView q={stats}>
        {({ stats: s, picks }) => (
          <>
            <Card title="Bedževi">
              <BadgeList badges={s.badges} />
              <details className="small badge-guide-toggle">
                <summary>Svi bedževi i šta znače</summary>
                <BadgeGuide earned={s.badges.map((b) => b.code)} />
              </details>
            </Card>
            <div className="stat-tiles">
              <div className="stat-tile">
                <span className="kv-label">Pogođeni / promašeni / poništeni</span>
                <span className="stat-value">
                  {s.hits} / {s.misses} / {s.voids}
                </span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Procenat pogodaka</span>
                <span className="stat-value">{formatPercent(s.hitPercent)}</span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Trenutni niz</span>
                <span className="stat-value">{streakText(s.currentStreak)}</span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Najduži niz pogodaka / promašaja</span>
                <span className="stat-value">
                  {s.longestHitStreak} / {s.longestMissStreak}
                </span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Blejmovi</span>
                <span className="stat-value">{s.blames}</span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Uplate</span>
                <span className="stat-value">
                  {s.payments} · {formatMoney(s.paidTotal)}
                </span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Hlađenja / vatrice</span>
                <span className="stat-value">
                  {s.cooldowns} / {s.fires}
                </span>
              </div>
              <div className="stat-tile">
                <span className="kv-label">Više / Manje (% pogodaka)</span>
                <span className="stat-value">
                  {formatPercent(s.overPercent)} / {formatPercent(s.underPercent)}
                </span>
              </div>
              <NearMissTile nearMisses={s.nearMisses} />
            </div>
            <Card title="Poslednjih 10 tipova">
              {s.last10.length ? (
                <>
                  <ol className="last10" aria-label="Poslednjih 10 tipova, od najstarijeg do najnovijeg">
                    {s.last10.map((r, i) => (
                      <li key={i}>
                        <ResultIcon result={r} />
                      </li>
                    ))}
                  </ol>
                  <div className="timeline-hint" aria-hidden="true">
                    <span>← starije</span>
                    <span>novije →</span>
                  </div>
                </>
              ) : (
                <p className="muted">Nema tipova.</p>
              )}
            </Card>
            <Card title="Disciplinske mere">
              <SanctionList memberId={memberId} />
            </Card>
            <Card title="Omiljeni igrači">
              {s.favoritePlayers.length ? (
                <ul className="simple-list">
                  {s.favoritePlayers.map((p) => (
                    <li key={`${p.playerId ?? p.name}`}>
                      <strong>{p.name}</strong> — {p.picks}× ({p.hits} pogođeno)
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">—</p>
              )}
            </Card>
            <Card title="Tipovi">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Kolo</th>
                      <th scope="col">Dan</th>
                      <th scope="col">Igrač</th>
                      <th scope="col">Tip</th>
                      <th scope="col">Ishod</th>
                    </tr>
                  </thead>
                  <tbody>
                    {picks.map((p) => (
                      <tr key={p.roundId}>
                        <td>
                          <Link to={`/kolo/${p.roundId}`}>#{p.number}</Link>
                        </td>
                        <td>{formatDate(p.gameDay)}</td>
                        <td>{p.playerName ?? '—'}</td>
                        <td>{lineLabel(p.direction, p.line)}</td>
                        <td>
                          <ResultIcon result={p.result} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </QueryView>
    </div>
  );
}
