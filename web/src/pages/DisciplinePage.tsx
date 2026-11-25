import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { SanctionDto, SanctionKind } from '@api';
import { useIssueSanction, useRevokeSanction, useRounds, useSanctions } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { MemberName, useMemberList } from '../components/MemberName';
import { Card, EmptyState, Modal, MutationError, QueryView } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { SANCTION_META } from '../lib/sanctions';

const KIND_LABEL = Object.fromEntries(Object.entries(SANCTION_META).map(([k, v]) => [k, v.label])) as Record<SanctionKind, string>;
const KIND_ICON = Object.fromEntries(Object.entries(SANCTION_META).map(([k, v]) => [k, v.icon])) as Record<SanctionKind, string>;

function statusText(s: SanctionDto): string {
  switch (s.status) {
    case 'active':
      return s.kind === 'notice' ? 'aktivno' : 'aktivna';
    case 'escalated':
      return s.kind === 'notice' ? 'pretvoreno u opomenu' : 'pretvorena u preskakanje kola';
    case 'pending':
      return 'preskače sledeće kolo';
    case 'served':
      return s.servedRoundNumber !== null ? `odsluženo u kolu #${s.servedRoundNumber}` : 'odsluženo';
    case 'revoked':
      return s.kind === 'notice' ? 'poništeno' : 'poništena';
  }
}

function RevokeDialog({ sanction, onClose }: { sanction: SanctionDto; onClose: () => void }) {
  const revoke = useRevokeSanction();
  const [reason, setReason] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    revoke.mutate({ id: sanction.id, body: { reason: reason.trim() } }, { onSuccess: onClose });
  };
  return (
    <Modal title={`Poništi meru — ${KIND_LABEL[sanction.kind].toLowerCase()}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {sanction.kind === 'warning' && sanction.status === 'escalated' && (
          <p className="small">Poništava se i preskakanje kola do kog je ova opomena dovela; ostale opomene ponovo postaju aktivne.</p>
        )}
        {sanction.kind === 'notice' && sanction.status === 'escalated' && (
          <p className="small">
            Poništava se i opomena do koje je ovo upozorenje dovelo (i ono što je ta opomena izazvala); ostala upozorenja ponovo postaju
            aktivna.
          </p>
        )}
        <div className="field">
          <label htmlFor="revoke-reason">Razlog poništavanja</label>
          <textarea id="revoke-reason" value={reason} maxLength={900} rows={3} onChange={(e) => setReason(e.target.value)} required />
        </div>
        <MutationError error={revoke.error} />
        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={revoke.isPending || reason.trim().length < 3}>
            Poništi meru
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Odustani
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** List of measures; `memberId` limits it to one member (profile). */
export function SanctionList({ memberId }: { memberId?: number }) {
  const { isAdmin } = useAuth();
  const q = useSanctions(memberId);
  const [revoking, setRevoking] = useState<SanctionDto | null>(null);
  return (
    <QueryView q={q}>
      {({ items }) =>
        items.length === 0 ? (
          <EmptyState>Nema disciplinskih mera.</EmptyState>
        ) : (
          <ul className="simple-list sanction-list">
            {items.map((s) => {
              const canRevoke = isAdmin && (s.status === 'active' || s.status === 'pending' || s.status === 'escalated');
              return (
                <li key={s.id} className={s.status === 'revoked' ? 'muted' : undefined}>
                  <div>
                    <span role="img" aria-label={KIND_LABEL[s.kind]}>
                      {KIND_ICON[s.kind]}
                    </span>{' '}
                    <strong>{KIND_LABEL[s.kind]}</strong>
                    {memberId === undefined && (
                      <>
                        {' — '}
                        <MemberName id={s.memberId} showStatus={false} />
                      </>
                    )}
                    {s.roundId !== null && (
                      <>
                        {' · '}
                        <Link to={`/kolo/${s.roundId}`}>kolo #{s.roundNumber}</Link>
                      </>
                    )}{' '}
                    <span className="badge tone-neutral">{statusText(s)}</span>
                  </div>
                  <div className={s.status === 'revoked' ? 'sanction-revoked' : undefined}>{s.reason}</div>
                  <div className="small muted">
                    {formatDateTime(s.issuedAt)} · {s.escalation ? (s.kind === 'warning' ? 'automatski (drugo upozorenje)' : 'automatski (druga opomena)') : <>izrekao <MemberName id={s.issuedBy} showStatus={false} /></>}
                    {s.revokedAt && (
                      <>
                        {' · poništeno '}
                        {formatDateTime(s.revokedAt)}: {s.revokeReason}
                      </>
                    )}
                  </div>
                  {canRevoke && (
                    <button type="button" className="btn btn-small" onClick={() => setRevoking(s)}>
                      Poništi
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )
      }
    </QueryView>
  );
}

function IssueForm() {
  const members = useMemberList();
  const rounds = useRounds({});
  const issue = useIssueSanction();
  const [memberId, setMemberId] = useState<number | ''>('');
  const [kind, setKind] = useState<SanctionKind>('notice');
  const [roundId, setRoundId] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const target = members.find((m) => m.id === memberId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (memberId === '') return;
    setDone(null);
    issue.mutate(
      { memberId, kind, roundId: roundId === '' ? null : roundId, reason: reason.trim() },
      {
        onSuccess: (res) => {
          const created = res.createdIds.map((id) => res.items.find((x) => x.id === id)?.kind);
          const who = target?.displayName ?? 'član';
          let msg = `Izrečeno: ${KIND_LABEL[kind].toLowerCase()}.`;
          if (created.includes('warning') && kind === 'notice') msg = `Izrečeno upozorenje — to je ${res.noticesForWarning}. upozorenje, pa ${who} dobija opomenu 🟨.`;
          if (created.includes('suspension') && kind !== 'suspension') msg += ` To je ${res.warningsForSuspension}. opomena, pa ${who} preskače sledeće kolo.`;
          setDone(msg);
          setReason('');
        },
      },
    );
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="sanction-member">Član</label>
        <select id="sanction-member" value={memberId} onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : '')} required>
          <option value="">— izaberi —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
              {m.status.notices > 0 ? ` (upozorenja: ${m.status.notices})` : ''}
              {m.status.warnings > 0 ? ` (opomene: ${m.status.warnings})` : ''}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="field radio-group">
        <legend>Mera</legend>
        <label>
          <input type="radio" name="sanction-kind" checked={kind === 'notice'} onChange={() => setKind('notice')} /> ⚠️ Upozorenje
        </label>
        <label>
          <input type="radio" name="sanction-kind" checked={kind === 'warning'} onChange={() => setKind('warning')} /> 🟨 Opomena
        </label>
        <label>
          <input type="radio" name="sanction-kind" checked={kind === 'suspension'} onChange={() => setKind('suspension')} /> 🟥 Preskakanje
          kola
        </label>
        {kind === 'notice' && target && target.status.notices > 0 && (
          <small className="hint">{target.displayName} već ima upozorenje — ovo upozorenje znači opomenu 🟨.</small>
        )}
        {kind === 'warning' && target && target.status.warnings > 0 && (
          <small className="hint">
            {target.displayName} već ima opomenu — ova opomena znači preskakanje sledećeg kola.
          </small>
        )}
      </fieldset>
      <div className="field">
        <label htmlFor="sanction-round">Povod — kolo (opciono)</label>
        <select id="sanction-round" value={roundId} onChange={(e) => setRoundId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">—</option>
          {(rounds.data?.items ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              #{r.number} · {r.gameDay}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="sanction-reason">Obrazloženje</label>
        <textarea id="sanction-reason" value={reason} rows={3} maxLength={900} onChange={(e) => setReason(e.target.value)} required />
      </div>
      <MutationError error={issue.error} />
      {done && <p className="form-ok">✔ {done}</p>}
      <button type="submit" className="btn btn-primary" disabled={issue.isPending || memberId === '' || reason.trim().length < 3}>
        Izreci meru
      </button>
    </form>
  );
}

/** EKR-14 — disciplinary measures (BR-37). */
export default function DisciplinePage() {
  const { isAdmin } = useAuth();
  return (
    <div className="page">
      <h1>Disciplina</h1>
      <p className="muted">
        ⚠️ Upozorenje · 🟨 opomena · 🟥 preskakanje kola. Drugo aktivno upozorenje postaje opomena, a druga aktivna opomena znači
        preskakanje sledećeg kola — umesto člana igra se tip ekipe.
      </p>
      {isAdmin && (
        <Card title="Nova mera">
          <IssueForm />
        </Card>
      )}
      <Card title="Izrečene mere">
        <SanctionList />
      </Card>
    </div>
  );
}
