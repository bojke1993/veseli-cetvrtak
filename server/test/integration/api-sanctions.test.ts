import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, api, createApiCtx, insertResolvedRound, seedFixtures, type ApiCtx } from './api-helpers.js';

describe('API: disciplinary measures (BR-37)', () => {
  let ctx: ApiCtx;
  let lastRound: number;
  beforeAll(async () => {
    ctx = await createApiCtx();
    await seedFixtures(ctx.deps);
    lastRound = await insertResolvedRound(ctx.deps, 1, '2026-10-08', {});
  });
  afterAll(async () => {
    await ctx.close();
  });

  const member = async (id: number) => (await api(ctx, null, 'GET', '/members')).body.members.find((m: any) => m.id === id).status;

  it('only the admin issues measures, a reason is mandatory, the list is public', async () => {
    const body = { memberId: 3, kind: 'warning', roundId: lastRound, reason: 'Odigrao Dobrića umesto Rivera.' };
    expect((await api(ctx, null, 'POST', '/sanctions', body)).status).toBe(401);
    expect((await api(ctx, 'tozislav', 'POST', '/sanctions', body)).status).toBe(403);
    expect((await api(ctx, ADMIN, 'POST', '/sanctions', { ...body, reason: '  ' })).status).toBe(422);

    const r = await api(ctx, ADMIN, 'POST', '/sanctions', body);
    expect(r.status).toBe(200);
    expect(r.body.createdIds).toHaveLength(1);
    expect(r.body.items[0]).toMatchObject({ memberId: 3, kind: 'warning', status: 'active', roundNumber: 1, issuedBy: 1 });
    expect(await member(3)).toMatchObject({ warnings: 1, suspended: false });

    const pub = await api(ctx, null, 'GET', '/sanctions?member=3');
    expect(pub.status).toBe(200);
    expect(pub.body.items).toHaveLength(1);
    expect(pub.body.warningsForSuspension).toBe(2);
    const audit = await ctx.deps.db.selectFrom('audit_log').selectAll().where('action', '=', 'sanction_issue').execute();
    expect(audit).toHaveLength(1);
    expect(audit[0]!.reason).toBe('Odigrao Dobrića umesto Rivera.');
  });

  it('the second warning becomes a suspension; revoking it restores the first warning', async () => {
    const r = await api(ctx, ADMIN, 'POST', '/sanctions', { memberId: 3, kind: 'warning', reason: 'Kasnio sa predlogom.' });
    expect(r.body.createdIds).toHaveLength(2);
    const [warnId, suspId] = r.body.createdIds;
    const susp = r.body.items.find((s: any) => s.id === suspId);
    expect(susp).toMatchObject({ kind: 'suspension', status: 'pending', escalation: true });
    expect(r.body.items.filter((s: any) => s.kind === 'warning').every((s: any) => s.status === 'escalated')).toBe(true);
    expect(await member(3)).toMatchObject({ warnings: 0, suspended: true });

    const rv = await api(ctx, ADMIN, 'POST', `/sanctions/${warnId}/revoke`, { reason: 'Greška, predlog je stigao na vreme.' });
    expect(rv.status).toBe(200);
    expect(rv.body.items.find((s: any) => s.id === suspId).status).toBe('revoked');
    expect(rv.body.items.find((s: any) => s.id === warnId).status).toBe('revoked');
    expect(await member(3)).toMatchObject({ warnings: 1, suspended: false });
    expect((await api(ctx, ADMIN, 'POST', `/sanctions/${warnId}/revoke`, { reason: 'opet' })).status).toBe(409);
  });

  it('a pending suspension gives the member slot to the team in the next round, without a cooldown', async () => {
    const r = await api(ctx, ADMIN, 'POST', '/sanctions', { memberId: 3, kind: 'warning', reason: 'Opet odigrao drugog igrača.' });
    const suspId = r.body.createdIds[1];
    const open = await api(ctx, ADMIN, 'POST', '/rounds', { gameDay: '2026-10-15' });
    expect(open.status).toBe(200);
    const slot3 = open.body.round.picks.find((p: any) => p.slot === 3);
    expect(slot3).toMatchObject({ kind: 'team', memberId: null, cooldownForMemberId: 3 });
    expect(open.body.round.suspendedMemberIds).toEqual([3]);
    expect(open.body.round.cooldownMemberIds).toEqual([]);
    expect(open.body.round.cooldownInconsistent).toBe(false);
    expect(await member(3)).toMatchObject({ suspended: true, onCooldown: false });

    const list = await api(ctx, null, 'GET', '/sanctions?member=3');
    expect(list.body.items.find((s: any) => s.id === suspId)).toMatchObject({ status: 'served', servedRoundNumber: 2 });
    expect((await api(ctx, ADMIN, 'POST', `/sanctions/${suspId}/revoke`, { reason: 'Pomilovanje.' })).status).toBe(409);

    // The suspended member cannot propose; the others can propose the team pick for the slot.
    const players = await ctx.deps.db.selectFrom('players').select(['id', 'full_name']).execute();
    const jones = players.find((p) => p.full_name === 'Carlik Jones')!.id;
    const own = await api(ctx, 'lakicevic', 'POST', `/rounds/${open.body.round.id}/proposals`, {
      kind: 'personal', playerId: jones, line: 10.5, direction: 'over', odds: 1.8,
    });
    expect(own.status).toBe(403);
    const team = await api(ctx, 'tozislav', 'POST', `/rounds/${open.body.round.id}/proposals`, {
      kind: 'team', cooldownForMemberId: 3, playerId: jones, line: 10.5, direction: 'over', odds: 1.8,
    });
    expect(team.status).toBe(200);
  });
});
