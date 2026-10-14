import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CorrectionField, CorrectionResponse, Direction, ManualResolveRequest, PlayerDto, RoundDetailDto } from '@api';
import { useActualWin, useCorrection, useManualResolve, useUnlockRound } from '../../api/queries';
import { formatMoney, parseDecimal } from '../../lib/format';
import { PickOwner } from '../LiveView';
import { useMemberList } from '../MemberName';
import { PlayerAutocomplete } from '../PlayerAutocomplete';
import { PlayerInfo } from '../PlayerInfo';
import { Modal, MutationError } from '../ui';

type Action = 'unlock' | 'correct' | 'resolve' | 'actualWin';

function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor="action-reason">Razlog (obavezno)</label>
      <textarea id="action-reason" rows={2} value={value} onChange={(e) => onChange(e.target.value)} required />
    </div>
  );
}

function SlotSelect({ round, value, onChange }: { round: RoundDetailDto; value: number; onChange: (n: number) => void }) {
  return (
    <div className="field">
      <label htmlFor="action-slot">Tip</label>
      <select id="action-slot" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {[...round.picks]
          .sort((a, b) => a.slot - b.slot)
          .map((p) => (
            <option key={p.slot} value={p.slot}>
              #{p.slot} — {p.kind === 'team' ? 'Ekipa' : ''}
              {p.player?.fullName ?? p.importPlayerName ?? 'bez igrača'}
            </option>
          ))}
      </select>
    </div>
  );
}

function UnlockForm({ round, onClose }: { round: RoundDetailDto; onClose: () => void }) {
  const unlock = useUnlockRound(round.id);
  const [reason, setReason] = useState('');
  return (
    <Modal
      title="Otključaj kolo"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Nazad
          </button>
          <button type="button" className="btn btn-primary" disabled={!reason.trim() || unlock.isPending} onClick={() => unlock.mutate(reason.trim(), { onSuccess: onClose })}>
            Otključaj
          </button>
        </>
      }
    >
      <p>Kolo se vraća u status „Otvoren”. Moguće je samo dok nijedna utakmica kola nije počela.</p>
      <ReasonField value={reason} onChange={setReason} />
      <MutationError error={unlock.error} />
    </Modal>
  );
}

const FIELD_LABEL: Record<CorrectionField, string> = {
  player: 'Igrač',
  line: 'Granica',
  direction: 'Smer',
  odds: 'Pojedinačna kvota',
  stake: 'Uplata',
  totalOdds: 'Ukupna kvota',
  payer: 'Uplatilac',
};
const PICK_FIELDS: CorrectionField[] = ['player', 'line', 'direction', 'odds'];

function CorrectionForm({ round, onClose }: { round: RoundDetailDto; onClose: () => void }) {
  const correct = useCorrection(round.id);
  const members = useMemberList();
  const [field, setField] = useState<CorrectionField>('line');
  const [slot, setSlot] = useState(round.picks[0]?.slot ?? 1);
  const [text, setText] = useState('');
  const [direction, setDirection] = useState<Direction>('over');
  const [payer, setPayer] = useState<number | ''>(round.payerMemberId ?? '');
  const [player, setPlayer] = useState<PlayerDto | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CorrectionResponse | null>(null);
  const isPickField = PICK_FIELDS.includes(field);

  // Any change invalidates the previous preview.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPreview(null);
  }, [field, slot, text, direction, payer, player, reason]);

  const value = (): number | string | null | undefined => {
    switch (field) {
      case 'player':
        return player ? player.id : undefined;
      case 'direction':
        return direction;
      case 'payer':
        return payer === '' ? undefined : payer;
      case 'odds':
        if (!text.trim()) return null;
        return parseDecimal(text) ?? undefined;
      default:
        return parseDecimal(text) ?? undefined;
    }
  };

  const run = (dryRun: boolean) => {
    setError(null);
    const v = value();
    if (v === undefined) return setError('Unesite ispravnu novu vrednost.');
    if (field === 'line' && typeof v === 'number' && Math.abs((v % 1) - 0.5) > 1e-9) return setError('Dozvoljene su samo granice x,5');
    if (!reason.trim()) return setError('Razlog je obavezan.');
    correct.mutate(
      { field, slot: isPickField ? slot : undefined, value: v, reason: reason.trim(), dryRun },
      {
        onSuccess: (res) => {
          if (dryRun) setPreview(res);
          else onClose();
        },
      },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(!preview);
  };

  return (
    <Modal title="Ispravi polje" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="field">
          <label htmlFor="corr-field">Polje</label>
          <select id="corr-field" value={field} onChange={(e) => setField(e.target.value as CorrectionField)}>
            {(Object.keys(FIELD_LABEL) as CorrectionField[]).map((f) => (
              <option key={f} value={f}>
                {FIELD_LABEL[f]}
              </option>
            ))}
          </select>
        </div>
        {isPickField && <SlotSelect round={round} value={slot} onChange={setSlot} />}
        {field === 'player' &&
          (player ? (
            <div className="selected-player">
              <PlayerInfo player={player} />
              <button type="button" className="btn btn-small" onClick={() => setPlayer(null)}>
                Promeni
              </button>
            </div>
          ) : (
            <PlayerAutocomplete label="Novi igrač" day={round.gameDay} allowUnselectable onSelect={(it) => setPlayer(it)} />
          ))}
        {field === 'direction' && (
          <div className="field">
            <label htmlFor="corr-dir">Novi smer</label>
            <select id="corr-dir" value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
              <option value="over">Više</option>
              <option value="under">Manje</option>
            </select>
          </div>
        )}
        {field === 'payer' && (
          <div className="field">
            <label htmlFor="corr-payer">Novi uplatilac</label>
            <select id="corr-payer" value={payer} onChange={(e) => setPayer(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— izaberi —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>
        )}
        {(field === 'line' || field === 'odds' || field === 'stake' || field === 'totalOdds') && (
          <div className="field">
            <label htmlFor="corr-value">Nova vrednost</label>
            <input id="corr-value" inputMode="decimal" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        <ReasonField value={reason} onChange={setReason} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <MutationError error={correct.error} />
        {preview && (
          <div className="alert alert-warn" role="status">
            <strong>Posledice po statistiku:</strong>
            {preview.consequences.length ? (
              <ul>
                {preview.consequences.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : (
              <p>Nema promena u statistici.</p>
            )}
          </div>
        )}
        <div className="btn-row">
          <button type="button" className="btn" onClick={onClose}>
            Nazad
          </button>
          <button type="submit" className="btn btn-primary" disabled={correct.isPending}>
            {preview ? 'Potvrdi ispravku' : 'Pregledaj posledice'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResolveForm({ round, onClose, initialSlot }: { round: RoundDetailDto; onClose: () => void; initialSlot?: number }) {
  const resolve = useManualResolve(round.id);
  const [slot, setSlot] = useState(initialSlot ?? round.picks.find((p) => p.result === null)?.slot ?? round.picks[0]?.slot ?? 1);
  const [mode, setMode] = useState<ManualResolveRequest['mode']>('points');
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pick = round.picks.find((p) => p.slot === slot);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const body: ManualResolveRequest = { mode, reason: reason.trim() };
    if (mode === 'points') {
      const n = Number(points);
      if (!points.trim() || !Number.isInteger(n) || n < 0) return setError('Unesite konačne poene (ceo broj ≥ 0).');
      body.points = n;
    }
    if (!body.reason) return setError('Razlog je obavezan.');
    resolve.mutate({ slot, body }, { onSuccess: onClose });
  };

  return (
    <Modal title="Razreši tip ručno" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <SlotSelect round={round} value={slot} onChange={setSlot} />
        {pick && (
          <p className="small muted">
            <PickOwner pick={pick} />
          </p>
        )}
        <fieldset className="radio-group">
          <legend>Način</legend>
          <label>
            <input type="radio" name="mode" checked={mode === 'points'} onChange={() => setMode('points')} /> Unos konačnih poena
          </label>
          <label>
            <input type="radio" name="mode" checked={mode === 'dnp'} onChange={() => setMode('dnp')} /> Igrač nije zaigrao (DNP)
          </label>
          <label>
            <input type="radio" name="mode" checked={mode === 'not_played'} onChange={() => setMode('not_played')} /> Utakmica nije odigrana na dan kola
          </label>
        </fieldset>
        {mode === 'points' && (
          <div className="field">
            <label htmlFor="resolve-points">Konačni poeni</label>
            <input id="resolve-points" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} />
          </div>
        )}
        <ReasonField value={reason} onChange={setReason} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <MutationError error={resolve.error} />
        <div className="btn-row">
          <button type="button" className="btn" onClick={onClose}>
            Nazad
          </button>
          <button type="submit" className="btn btn-primary" disabled={resolve.isPending}>
            Razreši
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ActualWinForm({ round, onClose }: { round: RoundDetailDto; onClose: () => void }) {
  const win = useActualWin(round.id);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = parseDecimal(amount);
    if (n === null || n < 0) return setError('Unesite iznos.');
    if (!reason.trim()) return setError('Razlog je obavezan.');
    win.mutate({ amount: n, reason: reason.trim() }, { onSuccess: onClose });
  };
  return (
    <Modal title="Koriguj stvarni dobitak" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="small muted">
          Trenutno: {formatMoney(round.actualWin)}
          {round.actualWinProvisional && ' (privremeno)'}
        </p>
        <div className="field">
          <label htmlFor="actual-win">Stvarni dobitak (RSD)</label>
          <input id="actual-win" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <ReasonField value={reason} onChange={setReason} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <MutationError error={win.error} />
        <div className="btn-row">
          <button type="button" className="btn" onClick={onClose}>
            Nazad
          </button>
          <button type="submit" className="btn btn-primary" disabled={win.isPending}>
            Sačuvaj
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Admin "⋯" menu on the round detail (EKR-07). */
export function AdminActionsMenu({ round, initialAction, initialSlot }: { round: RoundDetailDto; initialAction?: Action | null; initialSlot?: number }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action | null>(initialAction ?? null);
  const close = () => setAction(null);
  const choose = (a: Action) => {
    setOpen(false);
    setAction(a);
  };
  const resolved = ['won', 'lost', 'void'].includes(round.status);
  return (
    <div className="menu-wrap">
      <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Admin akcije" onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open && (
        <ul className="dropdown" role="menu">
          {round.canUnlock && round.status === 'locked' && (
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose('unlock')}>
                Otključaj kolo
              </button>
            </li>
          )}
          <li role="none">
            <button type="button" role="menuitem" onClick={() => choose('correct')}>
              Ispravi polje
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={() => choose('resolve')}>
              Razreši tip ručno
            </button>
          </li>
          {resolved && (
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose('actualWin')}>
                Koriguj stvarni dobitak
              </button>
            </li>
          )}
        </ul>
      )}
      {action === 'unlock' && <UnlockForm round={round} onClose={close} />}
      {action === 'correct' && <CorrectionForm round={round} onClose={close} />}
      {action === 'resolve' && <ResolveForm round={round} onClose={close} initialSlot={initialSlot} />}
      {action === 'actualWin' && <ActualWinForm round={round} onClose={close} />}
    </div>
  );
}
