import { useState } from 'react';
import type { ImportColumn, ImportPreviewResponse } from '@api';
import { API_BASE } from '../api/client';
import { useImportCommit, useImportPreview } from '../api/queries';
import { formatDate } from '../lib/format';
import { MutationError } from '../components/ui';

export const IMPORT_COLUMNS: Array<{ key: ImportColumn; label: string }> = [
  { key: 'kolo', label: 'Kolo' },
  { key: 'datum', label: 'Datum' },
  { key: 'clan', label: 'Član' },
  { key: 'umesto', label: 'Umesto (tip ekipe)' },
  { key: 'igrac', label: 'Igrač' },
  { key: 'tim', label: 'Tim' },
  { key: 'granica', label: 'Granica' },
  { key: 'tip', label: 'Tip (više/manje)' },
  { key: 'poeni', label: 'Poeni' },
  { key: 'ishod', label: 'Ishod' },
  { key: 'uplata', label: 'Uplata' },
  { key: 'kvota', label: 'Kvota' },
  { key: 'uplatio', label: 'Uplatio' },
  { key: 'dobitak', label: 'Dobitak' },
];

type Match = number | 'manual' | null;

/** REQ-31 — import wizard: upload → preview → mapping → unmatched players → commit. */
export function ImportWizard() {
  const preview = useImportPreview();
  const commit = useImportCommit();
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<ImportColumn, string | null> | null>(null);
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const runPreview = (f: File, m?: Record<ImportColumn, string | null>) => {
    setDone(null);
    preview.mutate(
      { file: f, mapping: m },
      {
        onSuccess: (res) => {
          setData(res);
          setMapping(res.mapping);
          setMatches((old) => {
            const next: Record<string, Match> = {};
            for (const u of res.unmatchedPlayers) next[u.name] = u.name in old ? old[u.name]! : (u.candidates[0]?.id ?? null);
            return next;
          });
        },
      },
    );
  };

  const mappingChanged = !!data && !!mapping && IMPORT_COLUMNS.some((c) => (data.mapping[c.key] ?? null) !== (mapping[c.key] ?? null));

  return (
    <div className="import-wizard">
      <p className="small">
        <a href={`${API_BASE}/import/template`} download>
          ⇩ Preuzmi prazan XLSX šablon
        </a>
      </p>
      <div className="field">
        <label htmlFor="import-file">XLS/XLSX fajl (do 5 MB)</label>
        <input
          id="import-file"
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setData(null);
            setMapping(null);
            if (f) {
              if (f.size > 5 * 1024 * 1024) return;
              runPreview(f);
            }
          }}
        />
        {file && file.size > 5 * 1024 * 1024 && (
          <small className="form-error" role="alert">
            Fajl je veći od 5 MB.
          </small>
        )}
      </div>
      {preview.isPending && <p role="status">Čitanje fajla…</p>}
      <MutationError error={preview.error} />

      {data && mapping && file && (
        <>
          <h3 className="subhead">Pregled</h3>
          <p>
            Kola: <strong>{data.rounds}</strong>
            {data.from && (
              <>
                {' '}
                · period {formatDate(data.from)} – {formatDate(data.to)}
              </>
            )}
          </p>

          <details open={data.errors.length > 0 || IMPORT_COLUMNS.some((c) => !mapping[c.key])}>
            <summary>Mapiranje kolona</summary>
            <div className="mapping-grid">
              {IMPORT_COLUMNS.map((c) => (
                <div className="field" key={c.key}>
                  <label htmlFor={`map-${c.key}`}>{c.label}</label>
                  <select
                    id={`map-${c.key}`}
                    value={mapping[c.key] ?? ''}
                    onChange={(e) => setMapping({ ...mapping, [c.key]: e.target.value || null })}
                  >
                    <option value="">(nije mapirano)</option>
                    {data.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button type="button" className="btn" disabled={!mappingChanged || preview.isPending} onClick={() => runPreview(file, mapping)}>
              Ponovo pregledaj sa ovim mapiranjem
            </button>
          </details>

          {data.errors.length > 0 && (
            <>
              <h3 className="subhead">Greške ({data.errors.length})</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Red</th>
                      <th scope="col">Kolo</th>
                      <th scope="col">Greška</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.errors.map((e, i) => (
                      <tr key={i}>
                        <td>{e.row ?? '—'}</td>
                        <td>{e.round ?? '—'}</td>
                        <td>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {data.unmatchedPlayers.length > 0 && (
            <>
              <h3 className="subhead">Nepoznati igrači ({data.unmatchedPlayers.length})</h3>
              <ul className="simple-list">
                {data.unmatchedPlayers.map((u) => (
                  <li key={u.name} className="field">
                    <label htmlFor={`um-${u.name}`}>
                      {u.name}
                      {u.club && <span className="muted"> ({u.club})</span>}
                    </label>
                    <select
                      id={`um-${u.name}`}
                      value={matches[u.name] === null || matches[u.name] === undefined ? '' : String(matches[u.name])}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMatches({ ...matches, [u.name]: v === '' ? null : v === 'manual' ? 'manual' : Number(v) });
                      }}
                    >
                      {u.candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName}
                          {c.club ? ` — ${c.club.shortName}` : ''}
                        </option>
                      ))}
                      <option value="manual">Ručni igrač (napravi novog)</option>
                      <option value="">Zadrži kao tekst</option>
                    </select>
                  </li>
                ))}
              </ul>
            </>
          )}

          <label className="checkbox">
            <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} /> Zameni prethodno uvezena kola (ako postoje)
          </label>
          <MutationError error={commit.error} />
          {done !== null && (
            <p className="form-ok" role="status">
              ✔ Uvezeno kola: {done}
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!data.canCommit || mappingChanged || commit.isPending}
            onClick={() =>
              commit.mutate(
                { token: data.token, mapping, playerMatches: matches, confirmReplace },
                { onSuccess: (res) => setDone(res.imported) },
              )
            }
          >
            Potvrdi uvoz
          </button>
          {!data.canCommit && <p className="small muted">Uvoz nije moguć dok postoje greške.</p>}
          {mappingChanged && <p className="small muted">Mapiranje je promenjeno — ponovo pregledajte pre uvoza.</p>}
        </>
      )}
    </div>
  );
}
