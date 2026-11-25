import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, api, createApiCtx, insertResolvedRound, seedFixtures, type ApiCtx } from './api-helpers.js';

describe('API: ticket not placed, round note and notices (BR-42)', () => {
  let ctx: ApiCtx;
  let r1: number;
  let r2: number;
  beforeAll(async () => {
    ctx = await createApiCtx();
    await seedFixtures(ctx.deps);
    r1 = await insertResolvedRound(ctx.deps, 1, '2026-10-08', {}, { stake: 500, odds: 10, payer: 1 }); // won 5000
    r2 = await insertResolvedRound(ctx.deps, 2, '2026-10-15', { 4: 'miss' }, { stake: 500, odds: 12, payer: 2 });
  });
  afterAll(async () => {
    await ctx.close();
  });

  const member = async (id: number) => (await api(ctx, null, 'GET', '/members')).body.members.find((m: any) => m.id === id).status;
  const overview = async () => (await api(ctx, null, 'GET', '/stats/overview?season=all')).body.stats;

  it('a not-placed ticket drops out of the balance but keeps its picks in the statistics', async () => {
    const before = await overview();
    expect(before).toMatchObject({ totalStaked: 1000, totalWon: 5000, balance: 4000 });

    const body = { ticketNotPlaced: true, note: 'Tozislav nije na vreme uplatio tiket.' };
    expect((await api(ctx, null, 'PUT', `/rounds/${r2}/note`, body)).status).toBe(401);
    expect((await api(ctx, 'tozislav', 'PUT', `/rounds/${r2}/note`, body)).status).toBe(403);
    expect((await api(ctx, ADMIN, 'PUT', `/rounds/${r2}/note`, { ticketNotPlaced: true, note: '  ' })).status).toBe(422);

    const res = await api(ctx, ADMIN, 'PUT', `/rounds/${r2}/note`, body);
    expect(res.status).toBe(200);
    expect(res.body.round).toMatchObject({ ticketNotPlaced: true, note: body.note });

    const after = await overview();
    expect(after).toMatchObject({ totalStaked: 500, totalWon: 5000, balance: 4500, rounds: 2 });
    expect(after.balanceSeries.map((p: any) => p.balance)).toEqual([4500, 4500]);
    const toz = (await api(ctx, null, 'GET', '/stats/members/2')).body.stats;
    expect(toz).toMatchObject({ payments: 0, paidTotal: 0, hits: 2 });
    const sim = (await api(ctx, null, 'GET', '/stats/members/4')).body.stats;
    expect(sim).toMatchObject({ misses: 1, blames: 1 });

    const list = await api(ctx, null, 'GET', '/rounds');
    expect(list.body.items.find((r: any) => r.id === r2)).toMatchObject({ ticketNotPlaced: true, note: body.note });
    const audit = await ctx.deps.db.selectFrom('audit_log').selectAll().where('action', '=', 'round_note').execute();
    expect(audit).toHaveLength(1);

    // A note alone (ticket placed) is allowed; undoing restores the balance.
    const undo = await api(ctx, ADMIN, 'PUT', `/rounds/${r2}/note`, { ticketNotPlaced: false, note: 'Samo napomena.' });
    expect(undo.body.round).toMatchObject({ ticketNotPlaced: false, note: 'Samo napomena.' });
    expect((await overview()).balance).toBe(4000);
    await api(ctx, ADMIN, 'PUT', `/rounds/${r2}/note`, body);
  });

  it('the second notice becomes a warning, which can then escalate to a suspension', async () => {
    const first = await api(ctx, ADMIN, 'POST', '/sanctions', { memberId: 2, kind: 'notice', roundId: r2, reason: 'Nije uplatio tiket.' });
    expect(first.status).toBe(200);
    expect(first.body.createdIds).toHaveLength(1);
    expect(first.body.noticesForWarning).toBe(2);
    expect(await member(2)).toMatchObject({ notices: 1, warnings: 0, suspended: false });

    const second = await api(ctx, ADMIN, 'POST', '/sanctions', { memberId: 2, kind: 'notice', reason: 'Opet nije uplatio.' });
    expect(second.body.createdIds).toHaveLength(2);
    const warnId = second.body.createdIds[1];
    expect(second.body.items.find((s: any) => s.id === warnId)).toMatchObject({ kind: 'warning', status: 'active', escalation: true });
    expect(second.body.items.filter((s: any) => s.kind === 'notice').every((s: any) => s.status === 'escalated')).toBe(true);
    expect(await member(2)).toMatchObject({ notices: 0, warnings: 1, suspended: false });

    // Another warning: the escalated warning counts, so this one means a suspension.
    const third = await api(ctx, ADMIN, 'POST', '/sanctions', { memberId: 2, kind: 'warning', reason: 'Kasnio sa predlogom.' });
    expect(third.body.createdIds).toHaveLength(2);
    expect(await member(2)).toMatchObject({ warnings: 0, suspended: true });

    // Revoking the first notice undoes the whole chain: warning and suspension; the other notice and warning are active again.
    const firstId = first.body.createdIds[0];
    const rv = await api(ctx, ADMIN, 'POST', `/sanctions/${firstId}/revoke`, { reason: 'Greška.' });
    expect(rv.status).toBe(200);
    const byId = (id: number) => rv.body.items.find((s: any) => s.id === id);
    expect(byId(warnId).status).toBe('revoked');
    expect(byId(third.body.createdIds[1]).status).toBe('revoked');
    expect(byId(third.body.createdIds[0]).status).toBe('active');
    expect(byId(second.body.createdIds[0]).status).toBe('active');
    expect(await member(2)).toMatchObject({ notices: 1, warnings: 1, suspended: false });
  });
});

describe('migration 006: one-off fix of round #18 (P-27)', () => {
  it('marks round #18 as not placed, sets Lakićević as payer and gives Tozislav a notice', async () => {
    const m006 = await import('../../src/db/migrations/006_round_note_notice.js');
    const ctx = await createApiCtx();
    try {
      await seedFixtures(ctx.deps);
      const id = await insertResolvedRound(ctx.deps, 18, '2026-11-24', { 4: 'miss' }, { payer: 2, odds: 13.03 });
      const db = ctx.deps.db as any;
      await m006.down(db);
      await m006.up(db);
      const round = await ctx.deps.db.selectFrom('rounds').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
      expect(round.ticket_not_placed).toBe(1);
      expect(round.note).toMatch(/Tiket nije uplaćen/);
      expect(round.note).toMatch(/Tozislav nije na vreme dostavio svoj par/);
      expect(round.payer_member_id).toBe(3);
      const list = await api(ctx, null, 'GET', '/sanctions?member=2');
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0]).toMatchObject({ kind: 'notice', status: 'active', roundNumber: 18, issuedBy: 1 });
      expect((await api(ctx, null, 'GET', '/stats/overview?season=all')).body.stats.totalStaked).toBe(0);
    } finally {
      await ctx.close();
    }
  });
});
