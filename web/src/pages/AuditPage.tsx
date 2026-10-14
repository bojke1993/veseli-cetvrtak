import { useSearchParams } from 'react-router-dom';
import { useAudit } from '../api/queries';
import { useMemberList } from '../components/MemberName';
import { QueryView } from '../components/ui';
import { AuditList } from './RoundDetailPage';

/** EKR-12 — read-only audit log with round / actor filters. */
export default function AuditPage() {
  const [sp, setSp] = useSearchParams();
  const members = useMemberList();
  const roundId = sp.get('roundId') ? Number(sp.get('roundId')) : undefined;
  const actorRaw = sp.get('actor');
  const actor = actorRaw === 'system' ? 'system' : actorRaw ? Number(actorRaw) : undefined;
  const audit = useAudit({ roundId, actor });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    setSp(next, { replace: true });
  };
  return (
    <div className="page">
      <h1>Audit log</h1>
      <div className="stats-filter">
        <div className="field">
          <label htmlFor="a-round">ID kola</label>
          <input id="a-round" inputMode="numeric" value={sp.get('roundId') ?? ''} onChange={(e) => set('roundId', e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="field">
          <label htmlFor="a-actor">Akter</label>
          <select id="a-actor" value={actorRaw ?? ''} onChange={(e) => set('actor', e.target.value)}>
            <option value="">Svi</option>
            <option value="system">sistem</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>
      <QueryView q={audit}>{({ items }) => <AuditList items={items} />}</QueryView>
    </div>
  );
}
