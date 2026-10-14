import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoundDetailDto, UpdateRoundRequest } from '@api';
import { useDeleteRound, useGameDays, useLockRound, useUpdateRound } from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { useNow } from '../../hooks/useNow';
import {
  formatCountdown,
  formatDate,
  formatDateTime,
  formatMoney,
  formatOdds,
  formatTime,
  lineLabel,
  parseDecimal,
  roundToCents,
  toInputText,
} from '../../lib/format';
import { MemberName, useMemberList } from '../MemberName';
import { PickOwner } from '../LiveView';
import { gameLabel } from '../PlayerInfo';
import { LoginButton, Modal, MutationError, SaveIndicator } from '../ui';
import { PersonalPickCard, TeamPickCard } from './PickCards';
import { DecimalInput } from './PickFields';
import { SaveProvider, useSave } from './SaveContext';

export function individualOddsProduct(round: Pick<RoundDetailDto, 'picks'>): number | null {
  if (round.picks.length !== 4 || round.picks.some((p) => p.odds == null)) return null;
  return round.picks.reduce((acc, p) => acc * (p.odds ?? 1), 1);
}

function TicketSection({ round }: { round: RoundDetailDto }) {
  const { isAdmin } = useAuth();
  const members = useMemberList();
  const update = useUpdateRound(round.id);
  const save = useSave();
  const [stakeText, setStakeText] = useState(toInputText(round.stake, 2));
  const [oddsText, setOddsText] = useState(toInputText(round.totalOdds, 2));
  const [stakeErr, setStakeErr] = useState<string | null>(null);
  const [oddsErr, setOddsErr] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setStakeText(toInputText(round.stake, 2));
      setOddsText(toInputText(round.totalOdds, 2));
    }
  }, [round.stake, round.totalOdds, focused]);

  const patch = (body: UpdateRoundRequest) => void save.track(update.mutateAsync(body)).catch(() => undefined);

  const stake = parseDecimal(stakeText);
  const odds = parseDecimal(oddsText);
  const potential = stake !== null && odds !== null ? roundToCents(stake * odds) : round.potentialWin;
  const product = individualOddsProduct(round);
  const diff = product !== null && odds ? Math.abs(product - odds) / odds : 0;

  const commitStake = () => {
    setFocused(false);
    if (!stakeText.trim()) {
      setStakeErr(null);
      if (round.stake !== null) patch({ stake: null });
      return;
    }
    if (stake === null || stake <= 0 || Math.round(stake * 100) !== stake * 100) {
      setStakeErr('Uplata mora biti pozitivan iznos sa najviše 2 decimale.');
      return;
    }
    setStakeErr(null);
    if (stake !== round.stake) patch({ stake });
  };
  const commitOdds = () => {
    setFocused(false);
    if (!oddsText.trim()) {
      setOddsErr(null);
      if (round.totalOdds !== null) patch({ totalOdds: null });
      return;
    }
    if (odds === null || odds < 1.01) {
      setOddsErr('Ukupna kvota mora biti najmanje 1,01.');
      return;
    }
    setOddsErr(null);
    if (odds !== round.totalOdds) patch({ totalOdds: odds });
  };

  if (!isAdmin) {
    return (
      <section className="card ticket-section">
        <h3 className="card-title">Tiket</h3>
        <dl className="kv-list">
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
        </dl>
      </section>
    );
  }

  return (
    <section className="card ticket-section" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
      <h3 className="card-title">Tiket</h3>
      <div className="ticket-grid">
        <DecimalInput label="Uplata" suffix="RSD" placeholder="500" value={stakeText} onChange={setStakeText} onBlur={commitStake} error={stakeErr} />
        <DecimalInput label="Ukupna kvota" placeholder="12,50" value={oddsText} onChange={setOddsText} onBlur={commitOdds} error={oddsErr} />
        <div className="field">
          <label htmlFor="payer">Uplatilac</label>
          <select
            id="payer"
            value={round.payerMemberId ?? ''}
            onChange={(e) => patch({ payerMemberId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">— izaberi —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="potential">
        Potencijalni dobitak: <strong>{formatMoney(potential)}</strong>
      </p>
      {product !== null && (
        <p className="small">
          Proizvod pojedinačnih kvota: <strong>{formatOdds(product)}</strong>
          {diff > 0.02 && (
            <span className="badge tone-bad" role="alert">
              <span aria-hidden="true">⚠</span> Razlika od ukupne kvote je veća od 2%
            </span>
          )}
        </p>
      )}
      <MutationError error={update.error} />
    </section>
  );
}

function LockDialog({ round, onClose }: { round: RoundDetailDto; onClose: () => void }) {
  const lock = useLockRound(round.id);
  return (
    <Modal
      title={`Zaključavanje kola #${round.number}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Nazad
          </button>
          <button type="button" className="btn btn-primary" disabled={lock.isPending} onClick={() => lock.mutate(undefined, { onSuccess: onClose })}>
            Potvrdi i zaključaj
          </button>
        </>
      }
    >
      <ul className="lock-summary">
        {[...round.picks]
          .sort((a, b) => a.slot - b.slot)
          .map((p) => (
            <li key={p.slot}>
              <PickOwner pick={p} />: <strong>{p.player?.fullName ?? '—'}</strong> {lineLabel(p.direction, p.line)}
              {p.odds != null && <span className="muted"> ({formatOdds(p.odds)})</span>}
            </li>
          ))}
      </ul>
      <dl className="kv-list">
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
          <dd>
            <MemberName id={round.payerMemberId} showStatus={false} />
          </dd>
        </div>
        <div>
          <dt>Potencijalni dobitak</dt>
          <dd>{formatMoney(round.potentialWin)}</dd>
        </div>
      </dl>
      <p className="alert alert-warn">Posle zaključavanja izbori se ne mogu menjati. Ispravke su moguće samo uz razlog i biće zabeležene.</p>
      <MutationError error={lock.error} />
    </Modal>
  );
}

function DeleteRoundDialog({ round, onClose }: { round: RoundDetailDto; onClose: () => void }) {
  const del = useDeleteRound(round.id);
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const ok = Number(text.trim()) === round.number;
  return (
    <Modal
      title={`Obriši kolo #${round.number}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Odustani
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!ok || del.isPending}
            onClick={() =>
              del.mutate(round.number, {
                onSuccess: () => {
                  onClose();
                  navigate('/', { replace: true });
                },
              })
            }
          >
            Obriši kolo
          </button>
        </>
      }
    >
      <p>Kolo i svi uneti tipovi i predlozi biće obrisani. Za potvrdu unesite broj kola ({round.number}).</p>
      <div className="field">
        <label htmlFor="confirm-number">Broj kola</label>
        <input id="confirm-number" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <MutationError error={del.error} />
    </Modal>
  );
}

function GameDaySelect({ round }: { round: RoundDetailDto }) {
  const days = useGameDays();
  const update = useUpdateRound(round.id);
  const save = useSave();
  const [pendingDay, setPendingDay] = useState<string | null>(null);
  const options = days.data?.days ?? [];
  const hasPicks = round.picks.some((p) => p.player);
  const change = (day: string, confirm = false) => {
    void save
      .track(update.mutateAsync({ gameDay: day, confirmDropPicks: confirm || undefined }))
      .then(() => setPendingDay(null))
      .catch(() => undefined);
  };
  const currentDay = options.find((d) => d.day === round.gameDay);
  return (
    <div className="field">
      <label htmlFor="game-day">Dan kola</label>
      <select
        id="game-day"
        value={round.gameDay}
        onChange={(e) => {
          const day = e.target.value;
          if (hasPicks) setPendingDay(day);
          else change(day);
        }}
      >
        {!currentDay && <option value={round.gameDay}>{formatDate(round.gameDay)}</option>}
        {options.map((d) => (
          <option key={d.day} value={d.day}>
            {formatDate(d.day)} ({d.games.length} {d.games.length === 1 ? 'utakmica' : 'utakmica'})
          </option>
        ))}
      </select>
      {currentDay && (
        <small className="hint">
          {currentDay.games.map((g) => `${formatTime(g.scheduledAt)} ${gameLabel(g)}`).join(' · ')}
        </small>
      )}
      <MutationError error={update.error} />
      {pendingDay && (
        <Modal
          title="Promena dana kola"
          onClose={() => setPendingDay(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setPendingDay(null)}>
                Odustani
              </button>
              <button type="button" className="btn btn-primary" onClick={() => change(pendingDay, true)}>
                Promeni dan
              </button>
            </>
          }
        >
          <p>
            Novi dan kola: <strong>{formatDate(pendingDay)}</strong>. Uneti tipovi koji nisu sa utakmica novog dana biće obrisani.
          </p>
        </Modal>
      )}
    </div>
  );
}

/** Countdown warning < 60 min before the first game (REQ-11.5); isolated so only it re-renders every second. */
function StartCountdown({ firstGameAt, isAdmin }: { firstGameAt: string | null; isAdmin: boolean }) {
  const now = useNow(1000);
  const msToStart = firstGameAt ? new Date(firstGameAt).getTime() - now : null;
  if (msToStart === null) return null;
  if (msToStart > 0 && msToStart < 60 * 60 * 1000) {
    return (
      <p className="alert alert-warn" role="alert">
        <span aria-hidden="true">⏰</span> Prva utakmica počinje za <strong>{formatCountdown(msToStart)}</strong>
        {isAdmin && ' — zaključaj kolo na vreme!'}
      </p>
    );
  }
  if (msToStart <= 0) {
    return (
      <p className="alert alert-error" role="alert">
        Prva utakmica je počela, a kolo nije zaključeno. Tipovi čije su utakmice počele ne mogu se menjati.
      </p>
    );
  }
  return null;
}

function EditorBody({ round }: { round: RoundDetailDto }) {
  const { isAdmin, isGuest } = useAuth();
  const save = useSave();
  const [locking, setLocking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const picks = [...round.picks].sort((a, b) => a.slot - b.slot);
  const canLock = round.missingForLock.length === 0;

  return (
    <div className="editor">
      <div className="page-head">
        <h1>Kolo #{round.number}</h1>
        {isAdmin && <SaveIndicator state={save.state} error={save.error} />}
        {isGuest && <LoginButton className="btn btn-small btn-primary" />}
      </div>
      <section className="card">
        <dl className="kv-list">
          <div>
            <dt>Otvoreno</dt>
            <dd>{formatDateTime(round.openedAt)}</dd>
          </div>
          {!isAdmin && (
            <div>
              <dt>Dan kola</dt>
              <dd>{formatDate(round.gameDay)}</dd>
            </div>
          )}
          <div>
            <dt>Kolo Evrolige</dt>
            <dd>{round.euroleagueRound ?? '—'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Otvoreno — u pripremi</dd>
          </div>
        </dl>
        {isAdmin && <GameDaySelect round={round} />}
      </section>

      <StartCountdown firstGameAt={round.firstGameAt} isAdmin={isAdmin} />

      <div className="pick-cards">
        {picks.map((p) =>
          p.kind === 'team' ? <TeamPickCard key={p.slot} round={round} pick={p} /> : <PersonalPickCard key={p.slot} round={round} pick={p} />,
        )}
      </div>

      <TicketSection round={round} />

      {isAdmin && (
        <section className="card lock-section">
          <button type="button" className="btn btn-primary btn-block btn-large" disabled={!canLock} onClick={() => setLocking(true)} aria-describedby="missing-list">
            🔒 Zaključi glasanje
          </button>
          {!canLock && (
            <div id="missing-list" className="small">
              Nedostaje:
              <ul>
                {round.missingForLock.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" className="btn btn-danger-outline" onClick={() => setDeleting(true)}>
            Obriši kolo
          </button>
        </section>
      )}
      {locking && <LockDialog round={round} onClose={() => setLocking(false)} />}
      {deleting && <DeleteRoundDialog round={round} onClose={() => setDeleting(false)} />}
    </div>
  );
}

/** EKR-04 — open round editor with autosave. */
export function RoundEditor({ round }: { round: RoundDetailDto }) {
  return (
    <SaveProvider>
      <EditorBody round={round} />
    </SaveProvider>
  );
}
