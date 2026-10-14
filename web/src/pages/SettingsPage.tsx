import { useState, type FormEvent } from 'react';
import type { MemberDto } from '@api';
import {
  useAdminAction,
  useCreateGame,
  useCreatePlayer,
  useResetPassword,
  useSyncRuns,
  useTransferAdmin,
  useUpdateMember,
} from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { LogoutButton } from '../components/Layout';
import { useMemberList } from '../components/MemberName';
import { Card, Modal, MutationError, QueryView } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { ImportWizard } from './ImportWizard';
import { ChangePasswordForm } from './LoginPage';

function DisplayNameForm({ member, label = 'Prikazno ime' }: { member: Pick<MemberDto, 'id' | 'displayName'>; label?: string }) {
  const update = useUpdateMember();
  const [name, setName] = useState(member.displayName);
  const [saved, setSaved] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    update.mutate({ id: member.id, body: { displayName: name.trim() } }, { onSuccess: () => setSaved(true) });
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor={`dn-${member.id}`}>{label}</label>
        <input id={`dn-${member.id}`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
      </div>
      <button type="submit" className="btn" disabled={update.isPending || !name.trim() || name.trim() === member.displayName}>
        Sačuvaj
      </button>
      {saved && <span className="form-ok">✔ Sačuvano</span>}
      <MutationError error={update.error} />
    </form>
  );
}

function MemberAdminRow({ member, isSelf }: { member: MemberDto; isSelf: boolean }) {
  const reset = useResetPassword();
  const transfer = useTransferAdmin();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <li className="member-admin">
      <div>
        <strong>{member.name}</strong> {member.isAdmin && <span className="badge tone-neutral">admin</span>}
      </div>
      <DisplayNameForm member={member} />
      <div className="btn-row">
        <button type="button" className="btn btn-small" onClick={() => setConfirmReset(true)}>
          Resetuj lozinku
        </button>
        {!isSelf && !member.isAdmin && (
          <button type="button" className="btn btn-small" onClick={() => setConfirmTransfer(true)}>
            Prenesi admin ulogu
          </button>
        )}
      </div>
      <MutationError error={reset.error ?? transfer.error} />
      {confirmReset && (
        <Modal
          title={`Reset lozinke — ${member.displayName}`}
          onClose={() => {
            setConfirmReset(false);
            setTempPassword(null);
          }}
          footer={
            tempPassword ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setConfirmReset(false);
                  setTempPassword(null);
                }}
              >
                Zatvori
              </button>
            ) : (
              <>
                <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
                  Odustani
                </button>
                <button type="button" className="btn btn-primary" disabled={reset.isPending} onClick={() => reset.mutate(member.id, { onSuccess: (r) => setTempPassword(r.temporaryPassword) })}>
                  Resetuj
                </button>
              </>
            )
          }
        >
          {tempPassword ? (
            <>
              <p>Privremena lozinka (prikazuje se samo sada):</p>
              <p className="temp-password">
                <code>{tempPassword}</code>
              </p>
              <p className="small muted">Član će morati da je promeni pri sledećoj prijavi.</p>
            </>
          ) : (
            <p>Biće generisana nova privremena lozinka. Postojeća lozinka prestaje da važi.</p>
          )}
          <MutationError error={reset.error} />
        </Modal>
      )}
      {confirmTransfer && (
        <Modal
          title="Prenos admin uloge"
          onClose={() => setConfirmTransfer(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConfirmTransfer(false)}>
                Odustani
              </button>
              <button type="button" className="btn btn-danger" disabled={transfer.isPending} onClick={() => transfer.mutate(member.id, { onSuccess: () => setConfirmTransfer(false) })}>
                Prenesi ulogu
              </button>
            </>
          }
        >
          <p>
            Admin uloga prelazi na <strong>{member.displayName}</strong>, a vi je gubite. Ova akcija se beleži u audit log.
          </p>
          <MutationError error={transfer.error} />
        </Modal>
      )}
    </li>
  );
}

const SYNC_LABEL: Record<string, string> = { players: 'Igrači', schedule: 'Raspored', live: 'Live', recalc: 'Rekalkulacija', recheck: 'Ponovna provera' };

function SyncSection() {
  const runs = useSyncRuns(true);
  const action = useAdminAction();
  const [lastAction, setLastAction] = useState<string | null>(null);
  const run = (a: 'sync/players' | 'sync/schedule' | 'recalc') => {
    setLastAction(null);
    action.mutate(a, { onSuccess: () => setLastAction(a) });
  };
  return (
    <Card title="Sinhronizacija i statistika">
      <div className="btn-row">
        <button type="button" className="btn" disabled={action.isPending} onClick={() => run('sync/players')}>
          Sinhronizuj igrače sada
        </button>
        <button type="button" className="btn" disabled={action.isPending} onClick={() => run('sync/schedule')}>
          Sinhronizuj raspored sada
        </button>
        <button type="button" className="btn" disabled={action.isPending} onClick={() => run('recalc')}>
          Ponovo izračunaj statistiku
        </button>
      </div>
      {action.isPending && <p role="status">Radi se…</p>}
      {lastAction && (
        <p className="form-ok" role="status">
          ✔ Završeno.
        </p>
      )}
      <MutationError error={action.error} />
      <QueryView q={runs}>
        {(d) => (
          <>
            <ul className="simple-list small">
              {Object.entries(d.lastOk).map(([type, at]) => (
                <li key={type}>
                  Poslednja uspešna — {SYNC_LABEL[type] ?? type}: <strong>{at ? formatDateTime(at) : 'nikad'}</strong>
                </li>
              ))}
            </ul>
            <div className="table-wrap">
              <table className="table small">
                <thead>
                  <tr>
                    <th scope="col">Posao</th>
                    <th scope="col">Početak</th>
                    <th scope="col">Status</th>
                    <th scope="col">Izmena</th>
                    <th scope="col">Greška</th>
                  </tr>
                </thead>
                <tbody>
                  {d.runs.slice(0, 15).map((r) => (
                    <tr key={r.id}>
                      <td>{SYNC_LABEL[r.type] ?? r.type}</td>
                      <td>{formatDateTime(r.startedAt)}</td>
                      <td>
                        <span className={`badge tone-${r.status === 'ok' ? 'great' : r.status === 'error' ? 'awful' : 'neutral'}`}>
                          <span aria-hidden="true">{r.status === 'ok' ? '✔' : r.status === 'error' ? '✘' : '…'}</span>{' '}
                          {r.status === 'ok' ? 'uspešno' : r.status === 'error' ? 'greška' : 'u toku'}
                        </span>
                      </td>
                      <td className="num">{r.itemsChanged ?? '—'}</td>
                      <td>{r.errorMessage ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </QueryView>
    </Card>
  );
}

function ManualDataSection() {
  const createPlayer = useCreatePlayer();
  const createGame = useCreateGame();
  const [p, setP] = useState({ firstName: '', lastName: '', clubCode: '', position: '' });
  const [g, setG] = useState({ home: '', away: '', at: '' });
  const [ok, setOk] = useState<string | null>(null);
  return (
    <Card title="Ručni unos (rezervni režim)">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          setOk(null);
          createPlayer.mutate(
            { firstName: p.firstName.trim(), lastName: p.lastName.trim(), clubCode: p.clubCode.trim().toUpperCase() || null, position: p.position.trim() || null },
            {
              onSuccess: () => {
                setOk('Igrač je dodat.');
                setP({ firstName: '', lastName: '', clubCode: '', position: '' });
              },
            },
          );
        }}
      >
        <h3 className="subhead">Novi igrač</h3>
        <div className="filter-grid">
          <div className="field">
            <label htmlFor="mp-first">Ime</label>
            <input id="mp-first" value={p.firstName} onChange={(e) => setP({ ...p, firstName: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="mp-last">Prezime</label>
            <input id="mp-last" value={p.lastName} onChange={(e) => setP({ ...p, lastName: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="mp-club">Klub (kod)</label>
            <input id="mp-club" value={p.clubCode} onChange={(e) => setP({ ...p, clubCode: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="mp-pos">Pozicija</label>
            <input id="mp-pos" value={p.position} onChange={(e) => setP({ ...p, position: e.target.value })} />
          </div>
        </div>
        <MutationError error={createPlayer.error} />
        <button type="submit" className="btn" disabled={createPlayer.isPending}>
          Dodaj igrača
        </button>
      </form>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          setOk(null);
          const at = new Date(g.at);
          if (Number.isNaN(at.getTime())) return;
          createGame.mutate(
            { homeClubCode: g.home.trim().toUpperCase(), awayClubCode: g.away.trim().toUpperCase(), scheduledAt: at.toISOString() },
            {
              onSuccess: () => {
                setOk('Utakmica je dodata.');
                setG({ home: '', away: '', at: '' });
              },
            },
          );
        }}
      >
        <h3 className="subhead">Nova utakmica</h3>
        <div className="filter-grid">
          <div className="field">
            <label htmlFor="mg-home">Domaćin (kod)</label>
            <input id="mg-home" value={g.home} onChange={(e) => setG({ ...g, home: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="mg-away">Gost (kod)</label>
            <input id="mg-away" value={g.away} onChange={(e) => setG({ ...g, away: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="mg-at">Početak (lokalno vreme)</label>
            <input id="mg-at" type="datetime-local" value={g.at} onChange={(e) => setG({ ...g, at: e.target.value })} required />
          </div>
        </div>
        <MutationError error={createGame.error} />
        <button type="submit" className="btn" disabled={createGame.isPending}>
          Dodaj utakmicu
        </button>
      </form>
      {ok && (
        <p className="form-ok" role="status">
          ✔ {ok}
        </p>
      )}
    </Card>
  );
}

/** EKR-11 */
export default function SettingsPage() {
  const { me, isAdmin } = useAuth();
  const members = useMemberList();
  if (!me) return null;
  return (
    <div className="page">
      <h1>Podešavanja</h1>
      <Card title="Profil">
        <p>
          Korisničko ime: <strong>{me.username}</strong>
        </p>
        <DisplayNameForm member={{ id: me.memberId, displayName: me.displayName }} />
        <LogoutButton />
      </Card>
      <Card title="Promena lozinke">
        <ChangePasswordForm />
      </Card>
      {isAdmin && (
        <>
          <Card title="Članovi">
            <ul className="simple-list">
              {members.map((m) => (
                <MemberAdminRow key={m.id} member={m} isSelf={m.id === me.memberId} />
              ))}
            </ul>
          </Card>
          <SyncSection />
          <Card title="Uvoz istorije (XLS/XLSX)">
            <p className="small muted">Dostupno samo dok ne postoji nijedno kolo uneto kroz aplikaciju.</p>
            <ImportWizard />
          </Card>
          <ManualDataSection />
        </>
      )}
    </div>
  );
}
