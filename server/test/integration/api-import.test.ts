import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { ADMIN, api, createApiCtx, login, seedFixtures, type ApiCtx } from './api-helpers.js';

function xlsx(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function multipart(fields: Record<string, string | Buffer>): { payload: Buffer; contentType: string } {
  const boundary = '----vcboundary' + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    if (Buffer.isBuffer(value)) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="istorija.xlsx"\r\n` +
            'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n',
        ),
        value,
        Buffer.from('\r\n'),
      );
    } else {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

const serial = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;

const HEADER = ['Kolo', 'Datum', 'Član', 'Umesto', 'Igrač', 'Tim', 'Granica', 'Tip', 'Poeni', 'Ishod', 'Uplata', 'Kvota', 'Uplatio', 'Dobitak'];
const GOOD = [
  HEADER,
  [7, '01.10.2026.', 'Ivanišević', null, 'Saša Vezenkov', 'Olympiacos', '14,5', 'više', 17, 'pogodak', 500, '12,40', 'Lakićević', null],
  [7, null, 'Tozislav', null, 'Nepoznati Igrač', 'Monaco', 9.5, 'manje', 12, 'promašaj', null, null, null, null],
  [7, null, 'Lakićević', null, 'Carlik Jones', 'Partizan', 9.5, 'manje', null, 'Poništen', null, null, null, null],
  [7, null, 'Simara', null, 'Kostas Sloukas', null, 10, 'Više', 14, 'pogodak', null, null, null, null],
  [8, serial(2026, 10, 8), 'Ivanišević', null, 'Evan Fournier', 'OLY', 11.5, 'vise', 15, 'pogodak', 400, 15, 'Simara', 6000],
  [8, serial(2026, 10, 8), 'Ekipa', 'Tozislav', 'Nemanja Nedović', null, 6.5, 'više', 9, 'pogodak', null, null, null, null],
  [8, serial(2026, 10, 8), 'Lakićević', null, 'Saša Vezenkov', null, 13.5, 'manje', 10, 'pogodak', null, null, null, null],
  [8, serial(2026, 10, 8), 'Simara', null, 'Carlik Jones', null, 8.5, 'manje', 7, 'pogodak', null, null, null, null],
];

describe('API: history import', () => {
  let ctx: ApiCtx;
  beforeAll(async () => {
    ctx = await createApiCtx();
    await seedFixtures(ctx.deps);
    await login(ctx, ADMIN);
  });
  afterAll(async () => {
    await ctx.close();
  });

  const preview = async (fields: Record<string, string | Buffer>, as = ADMIN) => {
    const mp = multipart(fields);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/import/preview',
      headers: { 'x-requested-with': 'vc', 'content-type': mp.contentType, cookie: `vc_session=${ctx.cookies.get(as)}` },
      payload: mp.payload,
    });
    return { status: res.statusCode, body: res.json() };
  };

  it('downloads the template', async () => {
    const r = await api(ctx, ADMIN, 'GET', '/import/template');
    expect(r.status).toBe(200);
    expect(r.res.headers['content-type']).toContain('spreadsheetml');
    expect(r.res.headers['content-disposition']).toContain('attachment');
    const wb = XLSX.read(r.res.rawPayload, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1 });
    expect(rows[0]).toEqual(['kolo', 'datum', 'clan', 'umesto', 'igrac', 'tim', 'granica', 'tip', 'poeni', 'ishod', 'uplata', 'kvota', 'uplatio', 'dobitak']);
    expect((await api(ctx, 'simara', 'GET', '/import/template')).status).toBe(403);
  });

  it('reports errors in a bad file', async () => {
    const bad = xlsx([
      HEADER,
      [1, '01.10.2026.', 'Ivanišević', null, 'A B', null, 10.5, 'više', null, 'pogodak', 500, 10, 'Simara', null],
      [1, null, 'Pera', null, 'C D', null, 10.5, 'više', null, 'pogodak', null, null, null, null],
      [1, null, 'Simara', null, 'E F', null, 10.5, 'više', null, 'možda', null, null, null, null],
      [2, '32.13.2026', 'Ekipa', null, 'G H', null, 10.5, 'više', null, 'pogodak', 500, 10, 'Simara', null],
    ]);
    const r = await preview({ file: bad });
    expect(r.status).toBe(200);
    expect(r.body.canCommit).toBe(false);
    const msgs = r.body.errors.map((e: any) => e.message);
    expect(msgs).toEqual(
      expect.arrayContaining([
        'Nepoznat član "Pera".',
        'Neispravan ishod "možda" (pogodak/promašaj/poništen).',
        'Tip ekipe mora imati popunjeno "umesto".',
        expect.stringMatching(/Neispravan datum/),
      ]),
    );
    expect(r.body.errors.find((e: any) => e.message === 'Nepoznat član "Pera".').row).toBe(3);
  });

  it('previews and commits a valid file atomically, then replaces it on confirmation', async () => {
    const file = xlsx(GOOD);
    const p = await preview({ file });
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ rounds: 2, from: '2026-10-01', to: '2026-10-08', canCommit: true });
    expect(p.body.mapping).toMatchObject({ kolo: 'Kolo', clan: 'Član', igrac: 'Igrač', dobitak: 'Dobitak' });
    expect(p.body.errors).toHaveLength(1);
    expect(p.body.errors[0].message).toMatch(/^Upozorenje: cela granica 10/);
    expect(p.body.unmatchedPlayers.map((u: any) => u.name)).toEqual(['Nepoznati Igrač']);

    // Re-run preview with the token and a custom mapping (no "dobitak" column).
    const p2 = await preview({ token: p.body.token, mapping: JSON.stringify({ dobitak: null }) });
    expect(p2.body.mapping.dobitak).toBeNull();
    expect(p2.body.token).toBe(p.body.token);

    const commit = await api(ctx, ADMIN, 'POST', '/import/commit', {
      token: p.body.token,
      mapping: p.body.mapping,
      playerMatches: { 'Nepoznati Igrač': 'manual' },
    });
    expect(commit.status).toBe(200);
    expect(commit.body).toEqual({ imported: 2 });

    const list = await api(ctx, null, 'GET', '/rounds');
    expect(list.body.items.map((i: any) => [i.number, i.source, i.status])).toEqual([
      [2, 'import', 'won'],
      [1, 'import', 'lost'],
    ]);
    const r1 = list.body.items[1];
    expect(r1).toMatchObject({ outcomeLabel: '2/3 (+1 poništen)', blame: 2, stake: 500, totalOdds: 12.4, payerMemberId: 3, actualWin: 0 });
    expect(r1.picks.map((x: any) => x.playerName)).toEqual(['Saša Vezenkov', 'Nepoznati Igrač', 'Carlik Jones', 'Kostas Sloukas']);
    const r2 = list.body.items[0];
    expect(r2).toMatchObject({ actualWin: 6000, cooldownMemberIds: [2] });
    expect(r2.picks[1]).toMatchObject({ kind: 'team', cooldownForMemberId: 2 });
    const detail = await api(ctx, null, 'GET', `/rounds/${r1.id}`);
    expect(detail.body.round.picks[1].player).toMatchObject({ fullName: 'Nepoznati Igrač', isManual: true });
    expect(detail.body.round.picks[0]).toMatchObject({ resolution: 'import', finalPoints: 17, live: null });
    const audit = await api(ctx, ADMIN, 'GET', '/audit');
    expect(audit.body.items[0]).toMatchObject({ action: 'history_import', newValue: { rounds: 2, from: '2026-10-01', to: '2026-10-08' } });

    // Token is single use.
    expect((await api(ctx, ADMIN, 'POST', '/import/commit', { token: p.body.token, mapping: p.body.mapping, playerMatches: {} })).status).toBe(404);

    // Replacing requires confirmation.
    const again = await preview({ file });
    const noConfirm = await api(ctx, ADMIN, 'POST', '/import/commit', { token: again.body.token, mapping: again.body.mapping, playerMatches: {} });
    expect(noConfirm.status).toBe(409);
    const replaced = await api(ctx, ADMIN, 'POST', '/import/commit', { token: again.body.token, mapping: again.body.mapping, playerMatches: {}, confirmReplace: true });
    expect(replaced.body.imported).toBe(2);
    const list2 = await api(ctx, null, 'GET', '/rounds');
    expect(list2.body.total).toBe(2);
    expect(list2.body.items[1].picks[1].playerName).toBe('Nepoznati Igrač');

    // Correcting an imported pick keeps the outcome from the file (no box scores exist).
    const won = list2.body.items[0];
    const other = await ctx.deps.db
      .selectFrom('players')
      .select('id')
      .where('is_manual', '=', 0)
      .where('id', 'not in', (eb) => eb.selectFrom('picks').select('player_id').where('round_id', '=', won.id).where('player_id', 'is not', null).$narrowType<{ player_id: number }>())
      .executeTakeFirstOrThrow();
    const corr = await api(ctx, ADMIN, 'POST', `/rounds/${won.id}/corrections`, {
      slot: 1,
      field: 'player',
      value: other.id,
      reason: 'Pogrešan igrač u tabeli',
    });
    expect(corr.status).toBe(200);
    expect(corr.body.round.status).toBe('won');
    expect(corr.body.round.picks[0].result).toBe('hit');

    // Members' streaks follow the imported history.
    const members = await api(ctx, null, 'GET', '/members');
    expect(members.body.members[0].status.streak).toBe(2);
  });

  it('refuses import once a round was entered in the app', async () => {
    const opened = await api(ctx, ADMIN, 'POST', '/rounds', { gameDay: '2026-10-15' });
    expect(opened.body.round.number).toBe(3);
    const p = await preview({ file: xlsx(GOOD) });
    expect(p.body.canCommit).toBe(false);
    expect(p.body.errors[0].message).toMatch(/već postoje kola uneta kroz aplikaciju/);
    const c = await api(ctx, ADMIN, 'POST', '/import/commit', { token: p.body.token, mapping: p.body.mapping, playerMatches: {}, confirmReplace: true });
    expect(c.status).toBe(409);
  });
});

describe('API: history import of older seasons (missing line, direction, odds, payer)', () => {
  let ctx: ApiCtx;
  beforeAll(async () => {
    ctx = await createApiCtx();
    await seedFixtures(ctx.deps);
    await login(ctx, ADMIN);
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('imports with warnings and no cooldown inconsistency for imported rounds', async () => {
    const H = ['Kolo', 'Datum', 'Član', 'Igrač', 'Tip', 'Ishod', 'Uplata', 'Dobitak'];
    const rows: unknown[][] = [H];
    // Tozislav misses 6 rounds in a row and keeps playing (no cooldown rule in 2025/26).
    for (let k = 1; k <= 6; k++) {
      const day = `${String(k).padStart(2, '0')}.12.2025.`;
      rows.push([k, day, 'Tozislav', `Igrac T${k}`, '-', 'promašaj', '1.000', 0]);
      rows.push([k, null, 'Ivanišević', `Igrac I${k}`, '+', 'pogodak', null, null]);
      rows.push([k, null, 'Lakićević', `Igrac L${k}`, k === 2 ? null : '+', 'pogodak', null, null]);
      rows.push([k, null, 'Simara', `Igrac S${k}`, '-', 'poništen', null, null]);
    }
    const mp = multipart({ file: xlsx(rows) });
    const p = await ctx.app.inject({
      method: 'POST',
      url: '/api/import/preview',
      headers: { 'x-requested-with': 'vc', 'content-type': mp.contentType, cookie: `vc_session=${ctx.cookies.get(ADMIN)}` },
      payload: mp.payload,
    });
    const body = p.json();
    expect(body.canCommit).toBe(true);
    const msgs = body.errors.map((e: any) => e.message);
    expect(msgs.every((m: string) => m.startsWith('Upozorenje: '))).toBe(true);
    expect(msgs.some((m: string) => m.includes('kvota nije upisana'))).toBe(true);
    expect(msgs.some((m: string) => m.includes('uplatilac nije upisan'))).toBe(true);
    expect(msgs.some((m: string) => m.includes('tip (više/manje) nije upisan'))).toBe(true);

    const matches = Object.fromEntries(body.unmatchedPlayers.map((u: any) => [u.name, null]));
    const c = await api(ctx, ADMIN, 'POST', '/import/commit', { token: body.token, mapping: body.mapping, playerMatches: matches });
    expect(c.body).toEqual({ imported: 6 });

    const list = await api(ctx, null, 'GET', '/rounds');
    const first = list.body.items.at(-1);
    expect(first).toMatchObject({ stake: 1000, totalOdds: null, payerMemberId: null, potentialWin: null, actualWin: 0, outcomeLabel: '2/3 (+1 poništen)' });
    expect(list.body.items.every((r: any) => r.cooldownInconsistent === false)).toBe(true);
    const tasks = await api(ctx, ADMIN, 'GET', '/admin/tasks');
    expect(tasks.body.tasks.filter((t: any) => t.kind === 'cooldown_inconsistent')).toEqual([]);
    const detail = await api(ctx, null, 'GET', `/rounds/${list.body.items.at(-2).id}`);
    expect(detail.body.round.picks[2]).toMatchObject({ line: null, direction: null, result: 'hit' });
  });
});
