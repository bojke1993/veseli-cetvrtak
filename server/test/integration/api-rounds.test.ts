import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, api, createApiCtx, insertResolvedRound, seedFixtures, type ApiCtx } from './api-helpers.js';

describe('API: round lifecycle', () => {
  let ctx: ApiCtx;
  let fx: Awaited<ReturnType<typeof seedFixtures>>;
  let roundId: number;
  beforeAll(async () => {
    ctx = await createApiCtx();
    fx = await seedFixtures(ctx.deps);
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('opens a round only on a day with not-started games', async () => {
    const cur = await api(ctx, null, 'GET', '/rounds/current');
    expect(cur.body).toMatchObject({ round: null, canOpenNew: true, reasonCannotOpen: null });
    const days = await api(ctx, null, 'GET', '/games/days');
    expect(days.body.days.map((d: any) => d.day)).toEqual(['2026-10-15', '2026-10-16']);

    expect((await api(ctx, ADMIN, 'POST', '/rounds', { gameDay: '2026-10-20' })).status).toBe(422);
    const r = await api(ctx, ADMIN, 'POST', '/rounds', { gameDay: '2026-10-15' });
    expect(r.status).toBe(200);
    const round = r.body.round;
    roundId = round.id;
    expect(round).toMatchObject({ number: 1, status: 'open', seasonCode: 'E2026', euroleagueRound: 5, gameDay: '2026-10-15' });
    expect(round.picks.map((p: any) => [p.slot, p.kind, p.memberId])).toEqual([
      [1, 'personal', 1],
      [2, 'personal', 2],
      [3, 'personal', 3],
      [4, 'personal', 4],
    ]);
    expect(round.missingForLock).toContain('Uplata');
    expect(round.missingForLock).toContain('Tip: Tozislav — igrač');

    const again = await api(ctx, ADMIN, 'POST', '/rounds', { gameDay: '2026-10-16' });
    expect(again.status).toBe(409);
    const cur2 = await api(ctx, null, 'GET', '/rounds/current');
    expect(cur2.body.canOpenNew).toBe(false);
    expect(cur2.body.reasonCannotOpen).toMatch(/nije razrešeno/);
    expect(cur2.body.round.audit).toEqual([]);
  });

  it('autocomplete: diacritics-insensitive, club search, selectable logic, inactive hidden', async () => {
    const s = await api(ctx, null, 'GET', `/players/search?q=sasa&roundId=${roundId}`);
    expect(s.body.items).toHaveLength(1);
    expect(s.body.items[0]).toMatchObject({ fullName: 'Saša Vezenkov', selectable: true, note: null });
    expect(s.body.items[0].game.home.code).toBe('PAR');

    const c = await api(ctx, null, 'GET', `/players/search?q=campazzo&roundId=${roundId}`);
    expect(c.body.items[0]).toMatchObject({ selectable: false, note: 'Ne igra 15.10.', game: null });

    const club = await api(ctx, null, 'GET', `/players/search?q=olympiacos&day=2026-10-15`);
    expect(club.body.items.map((i: any) => i.fullName).sort()).toEqual(['Evan Fournier', 'Saša Vezenkov']);

    expect((await api(ctx, null, 'GET', '/players/search?q=retired')).body.items).toEqual([]);
    expect((await api(ctx, null, 'GET', '/players/search?q=a')).body.items).toEqual([]);
  });

  it('sets picks with validation (x.5 line, duplicate player, club not playing)', async () => {
    const whole = await api(ctx, ADMIN, 'PUT', `/rounds/${roundId}/picks/1`, { playerId: fx.players.vezenkov, line: 15, direction: 'over' });
    expect(whole.status).toBe(422);
    expect(whole.body.error.message).toBe('Dozvoljene su samo granice x,5 (npr. 14,5 ili 15,5).');

    const ok = await api(ctx, ADMIN, 'PUT', `/rounds/${roundId}/picks/1`, { playerId: fx.players.vezenkov, line: 14.5, direction: 'over', odds: 1.85 });
    expect(ok.status).toBe(200);
    const p1 = ok.body.round.picks[0];
    expect(p1).toMatchObject({ line: 14.5, direction: 'over', odds: 1.85 });
    expect(p1.game.id).toBe(fx.games.g1);
    expect(p1.live.status).toBe('not_started');

    const dup = await api(ctx, ADMIN, 'PUT', `/rounds/${roundId}/picks/2`, { playerId: fx.players.vezenkov, line: 9.5, direction: 'under' });
    expect(dup.status).toBe(409);
    const notPlaying = await api(ctx, ADMIN, 'PUT', `/rounds/${roundId}/picks/2`, { playerId: fx.players.campazzo, line: 9.5, direction: 'under' });
    expect(notPlaying.status).toBe(422);
    const inactive = await api(ctx, ADMIN, 'PUT', `/rounds/${roundId}/picks/2`, { playerId: fx.players.oldguy, line: 9.5, direction: 'under' });
    expect(inactive.status).toBe(422);
    expect((await api(ctx, 'tozislav', 'PUT', `/rounds/${roundId}/picks/2`, { playerId: fx.players.jones, line: 9.5, direction: 'under' })).status).toBe(403);

    expect((await api(ctx, ADMIN, 'PUT', `/rounds/${roundId}/picks/2`, { playerId: fx.players.jones, line: 9.5, direction: 'under' })).status).toBe(200);
    expect((await api(ctx, ADMIN, 'PUT', `/rounds/${roundId}/picks/3`, { playerId: fx.players.nedovic, line: 7.5, direction: 'over' })).status).toBe(200);
    expect((await api(ctx, ADMIN, 'PUT', `/rounds/${roundId}/picks/4`, { playerId: fx.players.fournier, line: 10.5, direction: 'over' })).status).toBe(200);
    // Clear and set again.
    expect((await api(ctx, ADMIN, 'DELETE', `/rounds/${roundId}/picks/4`)).body.round.picks[3].player).toBeNull();
    expect((await api(ctx, ADMIN, 'PUT', `/rounds/${roundId}/picks/4`, { playerId: fx.players.sloukas, line: 10.5, direction: 'over' })).status).toBe(200);

    const used = await api(ctx, null, 'GET', `/players/search?q=vezenkov&roundId=${roundId}`);
    expect(used.body.items[0]).toMatchObject({ selectable: false, note: 'Već izabran u ovom kolu' });
  });

  it('validates stake, odds and payer; refuses to lock while incomplete', async () => {
    const lock = await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/lock`);
    expect(lock.status).toBe(422);
    // REQ-10.4: the payer is pre-filled by rotation, so only stake and odds are missing.
    expect(lock.body.error.details.missing).toEqual(['Uplata', 'Ukupna kvota']);

    expect((await api(ctx, ADMIN, 'PATCH', `/rounds/${roundId}`, { stake: 0 })).status).toBe(422);
    expect((await api(ctx, ADMIN, 'PATCH', `/rounds/${roundId}`, { stake: 100.555 })).status).toBe(422);
    expect((await api(ctx, ADMIN, 'PATCH', `/rounds/${roundId}`, { totalOdds: 1 })).status).toBe(422);
    expect((await api(ctx, ADMIN, 'PATCH', `/rounds/${roundId}`, { payerMemberId: 9 })).status).toBe(422);
    const ok = await api(ctx, ADMIN, 'PATCH', `/rounds/${roundId}`, { stake: 500, totalOdds: 12.4, payerMemberId: 3 });
    expect(ok.status).toBe(200);
    expect(ok.body.round).toMatchObject({ stake: 500, totalOdds: 12.4, payerMemberId: 3, potentialWin: 6200, missingForLock: [] });
  });

  it('PATCH gameDay drops picks not on the new day only after confirmation', async () => {
    const r = await api(ctx, ADMIN, 'PATCH', `/rounds/${roundId}`, { gameDay: '2026-10-16' });
    expect(r.status).toBe(409);
    expect(r.body.error.details.dropPicks).toHaveLength(4);
    const same = await api(ctx, ADMIN, 'PATCH', `/rounds/${roundId}`, { gameDay: '2026-10-15', stake: 500 });
    expect(same.body.round.picks.every((p: any) => p.player !== null)).toBe(true);
  });

  it('locks, refuses edits, unlocks with reason before start', async () => {
    expect((await api(ctx, 'tozislav', 'POST', `/rounds/${roundId}/lock`)).status).toBe(403);
    const lock = await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/lock`);
    expect(lock.status).toBe(200);
    expect(lock.body.round).toMatchObject({ status: 'locked', lockedBy: 1, canUnlock: true, firstGameAt: '2026-10-15T18:00:00.000Z' });
    expect(lock.body.round.audit[0]).toMatchObject({ action: 'lock', actorMemberId: 1 });
    expect((await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/lock`)).status).toBe(409);
    expect((await api(ctx, ADMIN, 'PUT', `/rounds/${roundId}/picks/1`, { playerId: fx.players.fournier, line: 9.5, direction: 'over' })).status).toBe(409);
    expect((await api(ctx, ADMIN, 'PATCH', `/rounds/${roundId}`, { stake: 600 })).status).toBe(409);

    expect((await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/unlock`, { reason: '  ' })).status).toBe(422);
    const un = await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/unlock`, { reason: 'Pogrešna kvota' });
    expect(un.status).toBe(200);
    expect(un.body.round).toMatchObject({ status: 'open', lockedAt: null, lockedBy: null });
    expect(un.body.round.audit[0]).toMatchObject({ action: 'unlock', reason: 'Pogrešna kvota' });
    expect((await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/lock`)).status).toBe(200);
  });

  it('refuses unlock after a game started; manual resolve; correction dry-run and apply', async () => {
    ctx.deps.setNow('2026-10-15T18:05:00Z');
    await ctx.deps.db.updateTable('games').set({ status: 'live' }).where('id', '=', fx.games.g1).execute();
    const un = await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/unlock`, { reason: 'x' });
    expect(un.status).toBe(409);
    expect((await api(ctx, null, 'GET', `/rounds/${roundId}`)).body.round.canUnlock).toBe(false);

    // Manual resolve: reason required.
    expect((await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/picks/1/resolve`, { mode: 'points', points: 20 })).status).toBe(422);
    expect((await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/picks/1/resolve`, { mode: 'points', points: 20, reason: 'euroleague.net' })).status).toBe(200);
    await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/picks/2/resolve`, { mode: 'points', points: 5, reason: 'euroleague.net' });
    await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/picks/4/resolve`, { mode: 'dnp', reason: 'nije igrao' });
    const lost = await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/picks/3/resolve`, { mode: 'points', points: 3, reason: 'euroleague.net' });
    expect(lost.body.round).toMatchObject({ status: 'lost', hits: 2, misses: 1, voids: 1, blame: 3, outcomeLabel: '2/3 (+1 poništen)' });
    expect(lost.body.round.picks[2]).toMatchObject({ result: 'miss', resolution: 'manual', finalPoints: 3 });
    expect(lost.body.round.picks[3]).toMatchObject({ result: 'void', voidReason: 'dnp' });
    expect(lost.body.round.audit.filter((a: any) => a.action === 'manual_resolve')).toHaveLength(4);

    // Correction requires a reason.
    expect((await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/corrections`, { slot: 3, field: 'line', value: 2.5 })).status).toBe(422);
    expect((await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/corrections`, { slot: 3, field: 'line', value: 2, reason: 'x' })).status).toBe(422);

    const dry = await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/corrections`, { slot: 3, field: 'line', value: 2.5, reason: 'Greška u unosu, tiket kaže 2,5', dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.applied).toBe(false);
    expect(dry.body.consequences).toEqual(
      expect.arrayContaining([
        'Tip: Lakićević: promašaj → pogodak',
        'Tiket: Gubitno → Dobitno',
        'Lakićević: niz promašaja 1 → 0, niz pogodaka 0 → 1',
        'Blejm (kolo 1): Lakićević → nema',
      ]),
    );
    expect(dry.body.round.status).toBe('lost');
    expect(dry.body.round.picks[2].line).toBe(7.5);

    const applied = await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/corrections`, { slot: 3, field: 'line', value: 2.5, reason: 'Greška u unosu, tiket kaže 2,5' });
    expect(applied.body.applied).toBe(true);
    expect(applied.body.round).toMatchObject({ status: 'won', hasCorrections: true, blame: null, actualWinProvisional: true });
    expect(applied.body.round.picks[2]).toMatchObject({ line: 2.5, result: 'hit', resolution: 'manual' });
    const corr = applied.body.round.audit.find((a: any) => a.action === 'correct');
    expect(corr).toMatchObject({ field: 'slot3.line', oldValue: 7.5, newValue: 2.5, reason: 'Greška u unosu, tiket kaže 2,5' });

    // Stake correction shows the potential-win consequence.
    const stake = await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/corrections`, { field: 'stake', value: 400, reason: 'tiket', dryRun: true });
    expect(stake.body.consequences).toContain('Potencijalni dobitak: 6.200,00 RSD → 4.960,00 RSD');

    // Actual win override (REQ-15.8).
    const tasks = await api(ctx, ADMIN, 'GET', '/admin/tasks');
    expect(tasks.body.tasks.map((t: any) => t.kind)).toContain('enter_actual_win');
    expect((await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/actual-win`, { amount: 3350.5 })).status).toBe(422);
    const aw = await api(ctx, ADMIN, 'POST', `/rounds/${roundId}/actual-win`, { amount: 3350.5, reason: 'isplata kladionice' });
    expect(aw.body.round).toMatchObject({ actualWin: 3350.5, actualWinProvisional: false });
    expect(aw.body.round.audit[0]).toMatchObject({ action: 'actual_win_override', newValue: 3350.5 });
    const tasks2 = await api(ctx, ADMIN, 'GET', '/admin/tasks');
    expect(tasks2.body.tasks.map((t: any) => t.kind)).not.toContain('enter_actual_win');
  });

  it('delete: only never-locked open rounds, confirmed by number; number reused', async () => {
    expect((await api(ctx, ADMIN, 'DELETE', `/rounds/${roundId}`, { confirmNumber: 1 })).status).toBe(409);
    const r2 = await api(ctx, ADMIN, 'POST', '/rounds', { gameDay: '2026-10-16' });
    expect(r2.body.round.number).toBe(2);
    const id2 = r2.body.round.id;
    expect((await api(ctx, ADMIN, 'DELETE', `/rounds/${id2}`, { confirmNumber: 1 })).status).toBe(422);
    expect((await api(ctx, ADMIN, 'DELETE', `/rounds/${id2}`, { confirmNumber: 2 })).status).toBe(200);
    expect((await api(ctx, null, 'GET', `/rounds/${id2}`)).status).toBe(404);
    const audit = await api(ctx, ADMIN, 'GET', `/audit?roundId=${id2}`);
    expect(audit.body.items[0].action).toBe('round_delete');
    const r3 = await api(ctx, ADMIN, 'POST', '/rounds', { gameDay: '2026-10-16' });
    expect(r3.body.round.number).toBe(2);
    // A round that was locked once (and later unlocked) can no longer be deleted (REQ-30).
    await ctx.deps.db
      .insertInto('audit_log')
      .values({ at: ctx.deps.now(), actor_member_id: 1, action: 'lock', round_id: r3.body.round.id, entity: 'round', entity_id: String(r3.body.round.id), field: null, old_value: null, new_value: null, reason: null })
      .execute();
    expect((await api(ctx, ADMIN, 'DELETE', `/rounds/${r3.body.round.id}`, { confirmNumber: 2 })).status).toBe(409);
  });

  it('a double click on "Novo kolo" opens only one round', async () => {
    const fresh = await createApiCtx();
    try {
      await seedFixtures(fresh.deps);
      const [a, b] = await Promise.all([
        api(fresh, ADMIN, 'POST', '/rounds', { gameDay: '2026-10-15' }),
        api(fresh, ADMIN, 'POST', '/rounds', { gameDay: '2026-10-15' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const count = await fresh.deps.db.selectFrom('rounds').select((eb) => eb.fn.countAll().as('n')).executeTakeFirstOrThrow();
      expect(Number(count.n)).toBe(1);
    } finally {
      await fresh.close();
    }
  });
});

describe('API: cooldown slots, proposals and votes', () => {
  let ctx: ApiCtx;
  let fx: Awaited<ReturnType<typeof seedFixtures>>;
  let roundId: number;
  beforeAll(async () => {
    ctx = await createApiCtx();
    fx = await seedFixtures(ctx.deps);
    for (let n = 1; n <= 5; n++) await insertResolvedRound(ctx.deps, n, `2026-10-0${n}`, { 2: 'miss' });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('opens a round with a team slot for the member on cooldown', async () => {
    const members = await api(ctx, null, 'GET', '/members');
    expect(members.body.members[1].status).toEqual({ streak: -5, hasFire: false, onCooldown: true });
    expect(members.body.members[0].status).toMatchObject({ streak: 5, hasFire: true, onCooldown: false });

    const r = await api(ctx, ADMIN, 'POST', '/rounds', { gameDay: '2026-10-15' });
    expect(r.status).toBe(200);
    roundId = r.body.round.id;
    expect(r.body.round.number).toBe(6);
    expect(r.body.round.cooldownMemberIds).toEqual([2]);
    expect(r.body.round.picks[1]).toMatchObject({ slot: 2, kind: 'team', memberId: null, cooldownForMemberId: 2 });
    expect(r.body.round.missingForLock).toContain('Tip ekipe (umesto: Tozislav) — igrač');
  });

  it('enforces proposal and vote rules, admin accepts', async () => {
    const own = await api(ctx, 'tozislav', 'POST', `/rounds/${roundId}/proposals`, { kind: 'personal', playerId: fx.players.jones, line: 9.5, direction: 'over' });
    expect(own.status).toBe(403);
    const team = await api(ctx, 'tozislav', 'POST', `/rounds/${roundId}/proposals`, { kind: 'team', cooldownForMemberId: 2, playerId: fx.players.jones, line: 9.5, direction: 'over' });
    expect(team.status).toBe(403);
    const wrongSlot = await api(ctx, 'simara', 'POST', `/rounds/${roundId}/proposals`, { kind: 'team', cooldownForMemberId: 3, playerId: fx.players.jones, line: 9.5, direction: 'over' });
    expect(wrongSlot.status).toBe(422);
    const badLine = await api(ctx, 'simara', 'POST', `/rounds/${roundId}/proposals`, { kind: 'team', cooldownForMemberId: 2, playerId: fx.players.jones, line: 9, direction: 'over' });
    expect(badLine.status).toBe(422);

    const p1 = await api(ctx, 'simara', 'POST', `/rounds/${roundId}/proposals`, { kind: 'team', cooldownForMemberId: 2, playerId: fx.players.jones, line: 9.5, direction: 'over', comment: 'Siguran' });
    expect(p1.status).toBe(200);
    const p2 = await api(ctx, 'lakicevic', 'POST', `/rounds/${roundId}/proposals`, { kind: 'team', cooldownForMemberId: 2, playerId: fx.players.sloukas, line: 11.5, direction: 'over' });
    const teamProps = p2.body.round.proposals;
    expect(teamProps).toHaveLength(2);
    const [a, b] = teamProps;

    expect((await api(ctx, 'tozislav', 'POST', `/proposals/${a.id}/vote`)).status).toBe(403);
    expect((await api(ctx, null, 'POST', `/proposals/${a.id}/vote`)).status).toBe(401);
    await api(ctx, 'lakicevic', 'POST', `/proposals/${a.id}/vote`);
    const v = await api(ctx, 'lakicevic', 'POST', `/proposals/${a.id}/vote`);
    await api(ctx, 'simara', 'POST', `/proposals/${a.id}/vote`);
    expect(v.body.round.proposals[0].votes).toEqual([3]);
    const unv = await api(ctx, 'simara', 'DELETE', `/proposals/${a.id}/vote`);
    expect(unv.body.round.proposals[0].votes).toEqual([3]);

    // Personal proposal by Simara; a second one replaces the first.
    await api(ctx, 'simara', 'POST', `/rounds/${roundId}/proposals`, { kind: 'personal', playerId: fx.players.nedovic, line: 7.5, direction: 'under' });
    const pers = await api(ctx, 'simara', 'POST', `/rounds/${roundId}/proposals`, { kind: 'personal', playerId: fx.players.nedovic, line: 8.5, direction: 'under' });
    const personal = pers.body.round.proposals.filter((p: any) => p.kind === 'personal');
    expect(personal.map((p: any) => p.status)).toEqual(['superseded', 'pending']);

    expect((await api(ctx, 'simara', 'POST', `/proposals/${a.id}/accept`)).status).toBe(403);
    const acc = await api(ctx, ADMIN, 'POST', `/proposals/${a.id}/accept`);
    expect(acc.status).toBe(200);
    expect(acc.body.round.picks[1]).toMatchObject({ kind: 'team', line: 9.5, direction: 'over' });
    expect(acc.body.round.picks[1].player.id).toBe(fx.players.jones);
    const statuses = Object.fromEntries(acc.body.round.proposals.map((p: any) => [p.id, p.status]));
    expect(statuses[a.id]).toBe('accepted');
    expect(statuses[b.id]).toBe('superseded');

    const accPers = await api(ctx, ADMIN, 'POST', `/proposals/${personal[1].id}/accept`);
    expect(accPers.body.round.picks[3]).toMatchObject({ memberId: 4, line: 8.5, direction: 'under' });
    expect((await api(ctx, ADMIN, 'POST', `/proposals/${personal[1].id}/accept`)).status).toBe(409);
  });
});
