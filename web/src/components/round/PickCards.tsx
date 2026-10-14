import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Direction, GameDto, PickDto, PickKind, PlayerDto, ProposalDto, RoundDetailDto } from '@api';
import { useAcceptProposal, useCreateProposal, useDeletePick, useSetPick, useVote } from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { formatDateTime, formatOdds, lineLabel, parseDecimal, parseLine, toInputText } from '../../lib/format';
import { MemberName } from '../MemberName';
import { PlayerAutocomplete } from '../PlayerAutocomplete';
import { gameStarted, PlayerInfo } from '../PlayerInfo';
import { MutationError } from '../ui';
import { DecimalInput, DirectionToggle, LineInput } from './PickFields';
import { useSave } from './SaveContext';

interface Draft {
  player: PlayerDto | null;
  game: GameDto | null;
  lineText: string;
  direction: Direction | null;
  oddsText: string;
}

function draftFromPick(p: PickDto): Draft {
  return {
    player: p.player,
    game: p.game,
    lineText: toInputText(p.line),
    direction: p.direction,
    oddsText: p.odds != null ? toInputText(p.odds, 2) : '',
  };
}

function draftFromProposal(p: ProposalDto, odds: string): Draft {
  return { player: p.player, game: p.game, lineText: toInputText(p.line), direction: p.direction, oddsText: odds };
}

function SelectedPlayer({ player, game, onClear, disabled }: { player: PlayerDto; game: GameDto | null; onClear: () => void; disabled?: boolean }) {
  return (
    <div className="selected-player">
      <PlayerInfo player={player} game={game} />
      {!disabled && (
        <button type="button" className="btn btn-small" onClick={onClear}>
          Promeni igrača
        </button>
      )}
    </div>
  );
}

/** Admin form for one slot — every valid change is saved immediately (REQ-08.7). */
function PickForm({ round, pick, prefill, onPrefillUsed }: { round: RoundDetailDto; pick: PickDto; prefill: Draft | null; onPrefillUsed: () => void }) {
  const setPick = useSetPick(round.id);
  const delPick = useDeletePick(round.id);
  const save = useSave();
  const [draft, setDraft] = useState<Draft>(() => draftFromPick(pick));
  const [lineError, setLineError] = useState<string | null>(null);
  const [oddsError, setOddsError] = useState<string | null>(null);
  const dirty = useRef(false);
  const serverSig = `${pick.player?.id ?? ''}|${pick.line ?? ''}|${pick.direction ?? ''}|${pick.odds ?? ''}`;

  useEffect(() => {
    if (!dirty.current) setDraft(draftFromPick(pick));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSig]);

  useEffect(() => {
    if (prefill) {
      dirty.current = true;
      setDraft(prefill);
      onPrefillUsed();
    }
  }, [prefill, onPrefillUsed]);

  const started = gameStarted(pick.game);

  const commit = (d: Draft) => {
    setDraft(d);
    dirty.current = true;
    if (!d.player) return;
    const line = parseLine(d.lineText);
    if ('error' in line) {
      setLineError(d.lineText.trim() ? line.error : null);
      return;
    }
    setLineError(null);
    let odds: number | null = null;
    if (d.oddsText.trim()) {
      odds = parseDecimal(d.oddsText);
      if (odds === null || odds < 1) {
        setOddsError('Kvota mora biti broj veći ili jednak 1,00');
        return;
      }
    }
    setOddsError(null);
    if (!d.direction) return;
    if (pick.player?.id === d.player.id && pick.line === line.value && pick.direction === d.direction && (pick.odds ?? null) === odds) {
      dirty.current = false;
      return;
    }
    save
      .track(setPick.mutateAsync({ slot: pick.slot, body: { playerId: d.player.id, line: line.value, direction: d.direction, odds } }))
      .then(() => {
        dirty.current = false;
      })
      .catch(() => undefined);
  };

  const clear = () => {
    const d = { ...draft, player: null, game: null };
    setDraft(d);
    dirty.current = true;
    if (pick.player) {
      save
        .track(delPick.mutateAsync(pick.slot))
        .then(() => {
          dirty.current = false;
        })
        .catch(() => undefined);
    }
  };

  if (started) {
    return (
      <div>
        {pick.player ? <PlayerInfo player={pick.player} game={pick.game} /> : <p className="muted">Tip nije unet.</p>}
        <p className="small alert alert-warn">Utakmica je počela — tip se ne može menjati. Poništenje: „Razreši ručno” u detalju kola.</p>
      </div>
    );
  }

  return (
    <div className="pick-form">
      {draft.player ? (
        <SelectedPlayer player={draft.player} game={draft.game} onClear={clear} />
      ) : (
        <PlayerAutocomplete day={round.gameDay} roundId={round.id} onSelect={(it) => commit({ ...draft, player: it, game: it.game })} />
      )}
      <div className="pick-form-row">
        <LineInput
          value={draft.lineText}
          error={lineError}
          onChange={(v) => {
            dirty.current = true;
            setDraft({ ...draft, lineText: v });
          }}
          onBlur={() => commit(draft)}
        />
        <DirectionToggle value={draft.direction} onChange={(dir) => commit({ ...draft, direction: dir })} />
        <DecimalInput
          label="Kvota (opciono)"
          value={draft.oddsText}
          placeholder="1,85"
          error={oddsError}
          onChange={(v) => {
            dirty.current = true;
            setDraft({ ...draft, oddsText: v });
          }}
          onBlur={() => commit(draft)}
        />
      </div>
      <MutationError error={setPick.error ?? delPick.error} />
    </div>
  );
}

/** Proposal form used by members ("Predloži svoj tip") and for team proposals ("Dodaj predlog"). */
function ProposalForm({
  round,
  kind,
  cooldownForMemberId,
  onDone,
  submitLabel,
}: {
  round: RoundDetailDto;
  kind: PickKind;
  cooldownForMemberId?: number;
  onDone: () => void;
  submitLabel: string;
}) {
  const create = useCreateProposal(round.id);
  const [player, setPlayer] = useState<PlayerDto | null>(null);
  const [game, setGame] = useState<GameDto | null>(null);
  const [lineText, setLineText] = useState('');
  const [direction, setDirection] = useState<Direction | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!player) return setError('Izaberite igrača.');
    const line = parseLine(lineText);
    if ('error' in line) return setError(line.error);
    if (!direction) return setError('Izaberite „Više” ili „Manje”.');
    create.mutate(
      {
        kind,
        cooldownForMemberId: kind === 'team' ? cooldownForMemberId : undefined,
        playerId: player.id,
        line: line.value,
        direction,
        comment: comment.trim() || undefined,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form className="proposal-form" onSubmit={submit}>
      {player ? (
        <SelectedPlayer
          player={player}
          game={game}
          onClear={() => {
            setPlayer(null);
            setGame(null);
          }}
        />
      ) : (
        <PlayerAutocomplete
          day={round.gameDay}
          roundId={round.id}
          onSelect={(it) => {
            setPlayer(it);
            setGame(it.game);
          }}
        />
      )}
      <div className="pick-form-row">
        <LineInput value={lineText} onChange={setLineText} />
        <DirectionToggle value={direction} onChange={setDirection} />
      </div>
      <div className="field">
        <label htmlFor={`comment-${kind}-${cooldownForMemberId ?? 'p'}`}>Komentar (opciono)</label>
        <input id={`comment-${kind}-${cooldownForMemberId ?? 'p'}`} value={comment} maxLength={200} onChange={(e) => setComment(e.target.value)} />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <MutationError error={create.error} />
      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={create.isPending}>
          {submitLabel}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Odustani
        </button>
      </div>
    </form>
  );
}

function ReadOnlyPick({ pick }: { pick: PickDto }) {
  if (!pick.player && !pick.importPlayerName) return <p className="muted">Tip još nije unet.</p>;
  return (
    <div className="readonly-pick">
      <PlayerInfo player={pick.player} fallbackName={pick.importPlayerName} game={pick.game} />
      <p className="pick-line">
        <strong>{lineLabel(pick.direction, pick.line)}</strong>
        {pick.odds != null && <span className="muted"> · kvota {formatOdds(pick.odds)}</span>}
      </p>
    </div>
  );
}

function ProposalSummary({ p }: { p: ProposalDto }) {
  return (
    <div className="proposal-summary">
      <PlayerInfo player={p.player} game={p.game} />
      <p className="pick-line">
        <strong>{lineLabel(p.direction, p.line)}</strong>
        <span className="muted small">
          {' '}
          · predložio <MemberName id={p.proposedBy} showStatus={false} /> · {formatDateTime(p.createdAt)}
        </span>
      </p>
      {p.comment && <p className="small proposal-comment">„{p.comment}”</p>}
    </div>
  );
}

/** Personal pick card (slot of a member not on cooldown). */
export function PersonalPickCard({ round, pick }: { round: RoundDetailDto; pick: PickDto }) {
  const { me, isAdmin } = useAuth();
  const accept = useAcceptProposal();
  const save = useSave();
  const [proposing, setProposing] = useState(false);
  const [prefill, setPrefill] = useState<Draft | null>(null);
  const pending = round.proposals.filter((p) => p.kind === 'personal' && p.proposedBy === pick.memberId && p.status === 'pending');
  const isOwn = !!me && me.memberId === pick.memberId;
  const canPropose = isOwn && !isAdmin && !round.cooldownMemberIds.includes(me.memberId);
  const clearPrefill = () => setPrefill(null);

  return (
    <article className="card pick-card" aria-label={`Tip ${pick.slot}`}>
      <header className="card-header">
        <h3 className="card-title">
          <MemberName id={pick.memberId} />
        </h3>
        <span className="small muted">#{pick.slot}</span>
      </header>

      {pending.map((p) => (
        <div key={p.id} className="proposal pending">
          <span className="badge tone-neutral">
            <span aria-hidden="true">⏳</span> Predlog — čeka potvrdu
          </span>
          <ProposalSummary p={p} />
          {isAdmin && (
            <div className="btn-row">
              <button type="button" className="btn btn-primary btn-small" disabled={accept.isPending} onClick={() => void save.track(accept.mutateAsync(p.id)).catch(() => undefined)}>
                Prihvati
              </button>
              <button type="button" className="btn btn-small" onClick={() => setPrefill(draftFromProposal(p, pick.odds != null ? toInputText(pick.odds, 2) : ''))}>
                Izmeni
              </button>
            </div>
          )}
        </div>
      ))}
      <MutationError error={accept.error} />

      {isAdmin ? (
        <PickForm round={round} pick={pick} prefill={prefill} onPrefillUsed={clearPrefill} />
      ) : (
        <ReadOnlyPick pick={pick} />
      )}

      {canPropose &&
        (proposing ? (
          <ProposalForm round={round} kind="personal" onDone={() => setProposing(false)} submitLabel="Pošalji predlog" />
        ) : (
          <button type="button" className="btn" onClick={() => setProposing(true)}>
            {pending.length ? 'Izmeni svoj predlog' : 'Predloži svoj tip'}
          </button>
        ))}
    </article>
  );
}

/** Team pick card — "Tip ekipe (umesto: X ❄)" with proposals and 👍 votes (REQ-19). */
export function TeamPickCard({ round, pick }: { round: RoundDetailDto; pick: PickDto }) {
  const { me, isAdmin } = useAuth();
  const vote = useVote();
  const accept = useAcceptProposal();
  const save = useSave();
  const [adding, setAdding] = useState(false);
  const proposals = round.proposals.filter(
    (p) => p.kind === 'team' && p.cooldownForMemberId === pick.cooldownForMemberId && (p.status === 'pending' || p.status === 'accepted'),
  );
  const sorted = [...proposals].sort((a, b) => b.votes.length - a.votes.length || a.id - b.id);
  const canParticipate = !!me && !round.cooldownMemberIds.includes(me.memberId);

  return (
    <article className="card pick-card team-card" aria-label={`Tip ${pick.slot}`}>
      <header className="card-header">
        <h3 className="card-title">
          Tip ekipe (umesto: <MemberName id={pick.cooldownForMemberId} showStatus={false} />{' '}
          <span role="img" aria-label="na hlađenju">
            ❄
          </span>
          )
        </h3>
        <span className="small muted">#{pick.slot}</span>
      </header>

      {isAdmin ? <PickForm round={round} pick={pick} prefill={null} onPrefillUsed={noop} /> : <ReadOnlyPick pick={pick} />}

      <h4 className="subhead">Predlozi ({proposals.length})</h4>
      {sorted.length === 0 && <p className="muted small">Još nema predloga.</p>}
      <ul className="proposal-list">
        {sorted.map((p) => {
          const voted = !!me && p.votes.includes(me.memberId);
          return (
            <li key={p.id} className={`proposal${p.status === 'accepted' ? ' accepted' : ''}`}>
              {p.status === 'accepted' && <span className="badge tone-great">✔ Izabran</span>}
              <ProposalSummary p={p} />
              <div className="btn-row">
                <button
                  type="button"
                  className={`btn btn-small vote-btn${voted ? ' is-on' : ''}`}
                  aria-pressed={voted}
                  aria-label={`Glasaj za predlog (${p.votes.length} ${p.votes.length === 1 ? 'glas' : 'glasova'})`}
                  disabled={!canParticipate || vote.isPending || p.status !== 'pending'}
                  hidden={!me}
                  onClick={() => vote.mutate({ proposalId: p.id, on: !voted })}
                >
                  👍 {p.votes.length}
                </button>
                {!me && (
                  <span className="small muted" aria-label={`${p.votes.length} glasova`}>
                    👍 {p.votes.length}
                  </span>
                )}
                {isAdmin && p.status === 'pending' && (
                  <button type="button" className="btn btn-small btn-primary" disabled={accept.isPending} onClick={() => void save.track(accept.mutateAsync(p.id)).catch(() => undefined)}>
                    Izaberi ovaj predlog
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <MutationError error={vote.error ?? accept.error} />
      {canParticipate &&
        (adding ? (
          <ProposalForm round={round} kind="team" cooldownForMemberId={pick.cooldownForMemberId ?? undefined} onDone={() => setAdding(false)} submitLabel="Dodaj predlog" />
        ) : (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + Dodaj predlog
          </button>
        ))}
    </article>
  );
}

function noop() {}
