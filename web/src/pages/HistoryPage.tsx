import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Direction, RoundsQuery, RoundStatus } from '@api';
import { useRounds, useSeasons } from '../api/queries';
import { ResultIcon, RoundStatusBadge } from '../components/LiveStatusBadge';
import { MemberName, memberLabel, useMemberList, useMemberMap } from '../components/MemberName';
import { PlayerAutocomplete } from '../components/PlayerAutocomplete';
import { RoundCard, RoundFlags } from '../components/RoundCard';
import { EmptyState, QueryView } from '../components/ui';
import { formatDate, formatMoney, lineLabel, ROUND_STATUS_LABEL } from '../lib/format';

export const FILTER_KEYS = [
  'season',
  'from',
  'to',
  'status',
  'outcome',
  'member',
  'memberFilter',
  'payer',
  'player',
  'club',
  'direction',
  'teamPick',
] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const OUTCOMES = ['4/4', '3/4', '2/4', '1/4', '0/4', 'with_void'] as const;
const OUTCOME_LABEL: Record<string, string> = { with_void: 'sa poništenim' };
const MEMBER_FILTER_LABEL: Record<string, string> = { hit: 'pogodio', miss: 'promašio', blame: 'blejm', cooldown: 'hlađenje' };
const STATUSES: RoundStatus[] = ['open', 'locked', 'in_progress', 'won', 'lost', 'void'];

function num(v: string | null): number | undefined {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** URL search params → API query (REQ-27.4: filters live in the URL). */
export function queryFromParams(sp: URLSearchParams): RoundsQuery {
  const q: RoundsQuery = {};
  q.season = sp.get('season') || 'all';
  if (sp.get('from')) q.from = sp.get('from')!;
  if (sp.get('to')) q.to = sp.get('to')!;
  const status = sp.get('status');
  if (status && (STATUSES as string[]).includes(status)) q.status = status as RoundStatus;
  const outcome = sp.get('outcome');
  if (outcome && (OUTCOMES as readonly string[]).includes(outcome)) q.outcome = outcome as RoundsQuery['outcome'];
  q.member = num(sp.get('member'));
  const mf = sp.get('memberFilter');
  if (q.member !== undefined && mf && mf in MEMBER_FILTER_LABEL) q.memberFilter = mf as RoundsQuery['memberFilter'];
  q.payer = num(sp.get('payer'));
  q.player = num(sp.get('player'));
  if (sp.get('club')) q.club = sp.get('club')!.trim().toUpperCase();
  const dir = sp.get('direction');
  if (dir === 'over' || dir === 'under') q.direction = dir as Direction;
  if (sp.get('teamPick') === '1') q.teamPick = true;
  q.page = num(sp.get('page')) ?? 1;
  for (const k of Object.keys(q) as Array<keyof RoundsQuery>) if (q[k] === undefined) delete q[k];
  return q;
}

/** EKR-06 */
export function HistoryPage() {
  const [sp, setSp] = useSearchParams();
  const [panelOpen, setPanelOpen] = useState(false);
  const query = useMemo(() => queryFromParams(sp), [sp]);
  const rounds = useRounds(query);
  const seasons = useSeasons();
  const members = useMemberList();
  const memberMap = useMemberMap();

  const setParam = (key: FilterKey | 'page', value: string | null) => {
    const next = new URLSearchParams(sp);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    if (key === 'member' && !value) next.delete('memberFilter');
    if (key === 'player' && !value) next.delete('playerName');
    setSp(next, { replace: key !== 'page' });
  };
  const clearAll = () => setSp(new URLSearchParams(), { replace: true });

  const seasonName = (code: string) => seasons.data?.seasons.find((s) => s.code === code)?.name ?? code;
  const chips: Array<{ key: FilterKey; label: string }> = [];
  for (const key of FILTER_KEYS) {
    const v = sp.get(key);
    if (!v) continue;
    if (key === 'memberFilter' && !sp.get('member')) continue;
    let label = v;
    switch (key) {
      case 'season':
        label = v === 'all' ? 'Sve sezone' : `Sezona ${seasonName(v)}`;
        break;
      case 'from':
        label = `Od ${formatDate(v)}`;
        break;
      case 'to':
        label = `Do ${formatDate(v)}`;
        break;
      case 'status':
        label = `Status: ${ROUND_STATUS_LABEL[v as RoundStatus] ?? v}`;
        break;
      case 'outcome':
        label = `Ishod: ${OUTCOME_LABEL[v] ?? v}`;
        break;
      case 'member':
        label = `Član: ${memberLabel(memberMap, Number(v))}`;
        break;
      case 'memberFilter':
        label = `Član ${MEMBER_FILTER_LABEL[v] ?? v}`;
        break;
      case 'payer':
        label = `Uplatio: ${memberLabel(memberMap, Number(v))}`;
        break;
      case 'player':
        label = `Igrač: ${sp.get('playerName') ?? `#${v}`}`;
        break;
      case 'club':
        label = `Klub: ${v.toUpperCase()}`;
        break;
      case 'direction':
        label = `Smer: ${v === 'over' ? 'Više' : 'Manje'}`;
        break;
      case 'teamPick':
        label = 'Sa tipom ekipe';
        break;
    }
    chips.push({ key, label });
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Istorija kola</h1>
        <button type="button" className="btn" aria-expanded={panelOpen} aria-controls="filter-panel" onClick={() => setPanelOpen((o) => !o)}>
          Filteri{chips.length ? ` (${chips.length})` : ''}
        </button>
      </div>

      {chips.length > 0 && (
        <ul className="chips" aria-label="Aktivni filteri">
          {chips.map((c) => (
            <li key={c.key} className="chip">
              <span>{c.label}</span>
              <button type="button" aria-label={`Ukloni filter: ${c.label}`} onClick={() => setParam(c.key, null)}>
                ✕
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="btn btn-small" onClick={clearAll}>
              Obriši filtere
            </button>
          </li>
        </ul>
      )}

      {panelOpen && (
        <section id="filter-panel" className="card filter-panel" aria-label="Filteri">
          <div className="filter-grid">
            <div className="field">
              <label htmlFor="f-season">Sezona</label>
              <select id="f-season" value={sp.get('season') ?? ''} onChange={(e) => setParam('season', e.target.value)}>
                <option value="">Sve sezone</option>
                {seasons.data?.seasons.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-from">Od</label>
              <input id="f-from" type="date" value={sp.get('from') ?? ''} onChange={(e) => setParam('from', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-to">Do</label>
              <input id="f-to" type="date" value={sp.get('to') ?? ''} onChange={(e) => setParam('to', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-status">Status tiketa</label>
              <select id="f-status" value={sp.get('status') ?? ''} onChange={(e) => setParam('status', e.target.value)}>
                <option value="">Svi</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ROUND_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-outcome">Ishod</label>
              <select id="f-outcome" value={sp.get('outcome') ?? ''} onChange={(e) => setParam('outcome', e.target.value)}>
                <option value="">Svi</option>
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {OUTCOME_LABEL[o] ?? o}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-member">Član</label>
              <select id="f-member" value={sp.get('member') ?? ''} onChange={(e) => setParam('member', e.target.value)}>
                <option value="">Svi</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-mfilter">Član je…</label>
              <select id="f-mfilter" value={sp.get('memberFilter') ?? ''} disabled={!sp.get('member')} onChange={(e) => setParam('memberFilter', e.target.value)}>
                <option value="">bilo šta</option>
                {Object.entries(MEMBER_FILTER_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-payer">Uplatilac</label>
              <select id="f-payer" value={sp.get('payer') ?? ''} onChange={(e) => setParam('payer', e.target.value)}>
                <option value="">Svi</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field-wide">
              {sp.get('player') ? (
                <>
                  <span className="field-label">Igrač</span>
                  <div className="btn-row">
                    <span>{sp.get('playerName') ?? `#${sp.get('player')}`}</span>
                    <button type="button" className="btn btn-small" onClick={() => setParam('player', null)}>
                      Ukloni
                    </button>
                  </div>
                </>
              ) : (
                <PlayerAutocomplete
                  label="Igrač"
                  allowUnselectable
                  onSelect={(it) => {
                    const next = new URLSearchParams(sp);
                    next.set('player', String(it.id));
                    next.set('playerName', it.fullName);
                    next.delete('page');
                    setSp(next, { replace: true });
                  }}
                />
              )}
            </div>
            <div className="field">
              <label htmlFor="f-club">Klub (kod)</label>
              <input id="f-club" value={sp.get('club') ?? ''} autoCapitalize="characters" placeholder="npr. PAR" onChange={(e) => setParam('club', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-dir">Smer</label>
              <select id="f-dir" value={sp.get('direction') ?? ''} onChange={(e) => setParam('direction', e.target.value)}>
                <option value="">Oba</option>
                <option value="over">Više</option>
                <option value="under">Manje</option>
              </select>
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={sp.get('teamPick') === '1'} onChange={(e) => setParam('teamPick', e.target.checked ? '1' : null)} /> Samo kola sa tipom ekipe
            </label>
          </div>
        </section>
      )}

      <QueryView q={rounds}>
        {(data) => {
          if (data.items.length === 0) {
            return (
              <EmptyState>
                <p>Nema kola za izabrane filtere</p>
                {chips.length > 0 && (
                  <button type="button" className="btn" onClick={clearAll}>
                    Obriši filtere
                  </button>
                )}
              </EmptyState>
            );
          }
          const pages = Math.max(1, Math.ceil(data.total / (data.pageSize || 20)));
          return (
            <>
              <p className="small muted">Ukupno kola: {data.total}</p>
              <ul className="round-list mobile-only">
                {data.items.map((r) => (
                  <li key={r.id}>
                    <RoundCard round={r} />
                  </li>
                ))}
              </ul>
              <div className="table-wrap desktop-only">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Kolo</th>
                      <th scope="col">Dan</th>
                      <th scope="col">EL</th>
                      <th scope="col">Ishod</th>
                      <th scope="col">Status</th>
                      <th scope="col">Uplata</th>
                      <th scope="col">Uplatio</th>
                      <th scope="col">Pot. dobitak</th>
                      <th scope="col">Dobitak</th>
                      <th scope="col">Tipovi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link to={`/kolo/${r.id}`}>#{r.number}</Link>
                          <RoundFlags round={r} />
                        </td>
                        <td>{formatDate(r.gameDay)}</td>
                        <td>{r.euroleagueRound ?? '—'}</td>
                        <td>{r.outcomeLabel ?? '—'}</td>
                        <td>
                          <RoundStatusBadge status={r.status} />
                        </td>
                        <td className="num">{formatMoney(r.stake)}</td>
                        <td>{r.payerMemberId != null ? <MemberName id={r.payerMemberId} showStatus={false} /> : '—'}</td>
                        <td className="num">{formatMoney(r.potentialWin)}</td>
                        <td className="num">{formatMoney(r.actualWin)}</td>
                        <td>
                          <ul className="pick-mini-inline">
                            {[...r.picks]
                              .sort((a, b) => a.slot - b.slot)
                              .map((p) => (
                                <li key={p.slot}>
                                  <ResultIcon result={p.result} /> {p.kind === 'team' ? 'Ekipa' : <MemberName id={p.memberId} showStatus={false} />}: {p.playerName ?? '—'}{' '}
                                  <span className="muted">{lineLabel(p.direction, p.line)}</span>
                                </li>
                              ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <nav className="pagination" aria-label="Strane">
                <button type="button" className="btn" disabled={data.page <= 1} onClick={() => setParam('page', String(data.page - 1))}>
                  ‹ Prethodna
                </button>
                <span>
                  Strana {data.page} od {pages}
                </span>
                <button type="button" className="btn" disabled={data.page >= pages} onClick={() => setParam('page', String(data.page + 1))}>
                  Sledeća ›
                </button>
              </nav>
            </>
          );
        }}
      </QueryView>
    </div>
  );
}
