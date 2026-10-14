import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, api, createApiCtx, insertResolvedRound, seedFixtures, type ApiCtx } from './api-helpers.js';

describe('API: history filters', () => {
  let ctx: ApiCtx;
  let fx: Awaited<ReturnType<typeof seedFixtures>>;
  const ids: number[] = [];
  beforeAll(async () => {
    ctx = await createApiCtx();
    fx = await seedFixtures(ctx.deps);
    ids.push(await insertResolvedRound(ctx.deps, 1, '2026-03-05', {}, { payer: 2 })); // E2025, 4/4
    ids.push(await insertResolvedRound(ctx.deps, 2, '2026-10-01', { 2: 'miss' }, { payer: 1 })); // 3/4, blame 2
    ids.push(await insertResolvedRound(ctx.deps, 3, '2026-10-02', {}, { payer: 2 })); // 4/4
    ids.push(await insertResolvedRound(ctx.deps, 4, '2026-10-03', { 1: 'miss', 3: 'miss' }, { payer: 3 })); // 2/4
    ids.push(await insertResolvedRound(ctx.deps, 5, '2026-10-04', { 4: 'void' }, { payer: 1 })); // 3/3 (+1)
    ids.push(await insertResolvedRound(ctx.deps, 6, '2026-10-05', { 3: 'miss' }, { payer: 1, cooldown: [2] })); // team slot
    await ctx.deps.db.updateTable('picks').set({ player_id: fx.players.vezenkov, import_player_name: null }).where('round_id', '=', ids[3]!).where('slot', '=', 1).execute();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const numbers = async (qs: string) => {
    const r = await api(ctx, null, 'GET', `/rounds${qs}`);
    expect(r.status, qs).toBe(200);
    return r.body.items.map((i: any) => i.number);
  };

  it('lists newest first with summaries; default season = all', async () => {
    const r = await api(ctx, null, 'GET', '/rounds');
    expect(r.body).toMatchObject({ page: 1, pageSize: 20, total: 6 });
    expect(r.body.items.map((i: any) => i.number)).toEqual([6, 5, 4, 3, 2, 1]);
    const r2 = r.body.items.find((i: any) => i.number === 2);
    expect(r2).toMatchObject({ outcomeLabel: '3/4', blame: 2, potentialWin: 5000, status: 'lost' });
    expect(r2.picks[0]).toMatchObject({ slot: 1, playerName: 'Igrac 2-1', result: 'hit' });
    const r5 = r.body.items.find((i: any) => i.number === 5);
    expect(r5.outcomeLabel).toBe('3/3 (+1 poništen)');
    expect((await api(ctx, null, 'GET', '/rounds?page=2')).body.items).toEqual([]);
  });

  it('combines filters', async () => {
    expect(await numbers('?season=E2026')).toEqual([6, 5, 4, 3, 2]);
    expect(await numbers('?season=E2025')).toEqual([1]);
    expect(await numbers('?from=2026-10-02&to=2026-10-04')).toEqual([5, 4, 3]);
    expect(await numbers('?status=won')).toEqual([5, 3, 1]);
    expect(await numbers('?outcome=4/4')).toEqual([3, 1]);
    expect(await numbers('?outcome=3/4')).toEqual([6, 2]);
    expect(await numbers('?outcome=2/4')).toEqual([4]);
    expect(await numbers('?outcome=with_void')).toEqual([5]);
    expect(await numbers('?member=2&memberFilter=blame')).toEqual([2]);
    expect(await numbers('?member=3&memberFilter=miss')).toEqual([6, 4]);
    expect(await numbers('?member=2&memberFilter=cooldown')).toEqual([6]);
    expect(await numbers('?member=2&memberFilter=hit')).toEqual([5, 4, 3, 1]);
    expect(await numbers('?teamPick=true')).toEqual([6]);
    expect(await numbers('?teamPick=false&season=E2026')).toEqual([5, 4, 3, 2]);
    expect(await numbers('?payer=1&status=lost')).toEqual([6, 2]);
    expect(await numbers(`?player=${fx.players.vezenkov}`)).toEqual([4]);
    expect(await numbers('?club=OLY')).toEqual([4]);
    expect(await numbers('?direction=under&season=E2025')).toEqual([1]);
    expect(await numbers('?status=open')).toEqual([]);
  });

  it('serves stats routes', async () => {
    const seasons = await api(ctx, null, 'GET', '/stats/seasons');
    expect(seasons.body.current).toBe('E2026');
    expect(seasons.body.seasons.map((s: any) => s.code)).toEqual(expect.arrayContaining(['E2026', 'E2025']));
    const ov = await api(ctx, null, 'GET', '/stats/overview?season=E2026');
    expect(ov.status).toBe(200);
    expect(ov.body.stats.rounds).toBe(5);
    expect((await api(ctx, null, 'GET', '/stats/members/2')).status).toBe(200);
    expect((await api(ctx, null, 'GET', '/stats/blame?season=all')).body.rows.length).toBeGreaterThan(0);
  });
});

describe('API: admin tasks, sync and recalc', () => {
  let ctx: ApiCtx;
  let fx: Awaited<ReturnType<typeof seedFixtures>>;
  beforeAll(async () => {
    ctx = await createApiCtx();
    fx = await seedFixtures(ctx.deps);
  });
  afterAll(async () => {
    await ctx.close();
  });

  const kinds = async () => (await api(ctx, ADMIN, 'GET', '/admin/tasks')).body.tasks.map((t: any) => t.kind);

  it('derives lock_soon, manual_resolve, cooldown_inconsistent tasks', async () => {
    expect(await kinds()).toEqual([]);
    // A round with a team slot although nobody had 5 misses → inconsistent cooldown.
    await insertResolvedRound(ctx.deps, 1, '2026-10-01', {}, { cooldown: [4] });
    expect(await kinds()).toEqual(['cooldown_inconsistent']);

    const r = await api(ctx, ADMIN, 'POST', '/rounds', { gameDay: '2026-10-15' });
    const id = r.body.round.id;
    expect(await kinds()).toEqual(['cooldown_inconsistent']);
    ctx.deps.setNow('2026-10-15T17:30:00Z');
    const t = (await api(ctx, ADMIN, 'GET', '/admin/tasks')).body.tasks;
    expect(t[0]).toMatchObject({ kind: 'lock_soon', roundId: id, link: '/kolo' });
    expect(t[0].message).toContain('30 min');

    await api(ctx, ADMIN, 'PUT', `/rounds/${id}/picks/1`, { playerId: fx.players.vezenkov, line: 14.5, direction: 'over' });
    await api(ctx, ADMIN, 'PUT', `/rounds/${id}/picks/2`, { playerId: fx.players.jones, line: 9.5, direction: 'over' });
    await api(ctx, ADMIN, 'PUT', `/rounds/${id}/picks/3`, { playerId: fx.players.nedovic, line: 7.5, direction: 'over' });
    await api(ctx, ADMIN, 'PUT', `/rounds/${id}/picks/4`, { playerId: fx.players.sloukas, line: 10.5, direction: 'over' });
    await api(ctx, ADMIN, 'PATCH', `/rounds/${id}`, { stake: 300, totalOdds: 5.5, payerMemberId: 2 });
    expect((await api(ctx, ADMIN, 'POST', `/rounds/${id}/lock`)).status).toBe(200);
    expect(await kinds()).toEqual(['cooldown_inconsistent']);

    ctx.deps.setNow('2026-10-15T20:30:00Z');
    await ctx.deps.db.updateTable('games').set({ status: 'final' }).where('id', '=', fx.games.g1).execute();
    const t2 = (await api(ctx, ADMIN, 'GET', '/admin/tasks')).body.tasks;
    const mr = t2.filter((x: any) => x.kind === 'manual_resolve');
    expect(mr.map((x: any) => x.slot)).toEqual([1, 2]);
    expect(mr[0].message).toContain('Saša Vezenkov');
  });

  it('reports failing syncs and live polling', async () => {
    const now = ctx.deps.now();
    const run = (type: string, status: 'ok' | 'error', hoursAgo: number) =>
      ctx.deps.db
        .insertInto('sync_runs')
        .values({
          type: type as any,
          started_at: new Date(now.getTime() - hoursAgo * 3_600_000),
          finished_at: new Date(now.getTime() - hoursAgo * 3_600_000 + 1000),
          status,
          error_message: status === 'error' ? 'HTTP 500' : null,
          items_changed: 0,
        })
        .execute();
    await run('players', 'ok', 2);
    await run('players', 'error', 1);
    await run('schedule', 'ok', 40);
    for (let i = 0; i < 5; i++) await run('live', 'error', 0.1 * (i + 1));
    const t = (await api(ctx, ADMIN, 'GET', '/admin/tasks')).body.tasks;
    const sync = t.filter((x: any) => x.kind === 'sync_failing');
    expect(sync).toHaveLength(2);
    expect(t.some((x: any) => x.kind === 'live_failing')).toBe(true);

    const runs = await api(ctx, ADMIN, 'GET', '/admin/sync-runs');
    expect(runs.body.runs.length).toBe(8);
    expect(runs.body.lastOk.players).not.toBeNull();
    expect(runs.body.lastOk.live).toBeNull();
  });

  it('sync now returns 502 on provider error; recalc writes audit', async () => {
    ctx.deps.provider.failWith = new Error('API nije dostupan');
    const fail = await api(ctx, ADMIN, 'POST', '/admin/sync/schedule');
    expect(fail.status).toBe(502);
    expect(fail.body.error.message).toMatch(/Sinhronizacija rasporeda nije uspela/);
    ctx.deps.provider.failWith = null;
    const ok = await api(ctx, ADMIN, 'POST', '/admin/sync/schedule');
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    expect((await api(ctx, 'simara', 'POST', '/admin/recalc')).status).toBe(403);
    expect((await api(ctx, ADMIN, 'POST', '/admin/recalc')).status).toBe(200);
    const audit = await api(ctx, 'simara', 'GET', '/audit?actor=1');
    expect(audit.body.items[0].action).toBe('full_recalc');
    expect((await api(ctx, 'simara', 'GET', '/audit?actor=system')).status).toBe(200);
  });

  it('manual players and games (admin)', async () => {
    const p = await api(ctx, ADMIN, 'POST', '/players', { firstName: 'Marko', lastName: 'Gudurić', clubCode: 'RED' });
    expect(p.status).toBe(200);
    expect(p.body.player).toMatchObject({ fullName: 'Marko Gudurić', isManual: true, isActive: true });
    expect((await api(ctx, null, 'GET', '/players/search?q=guduric')).body.items[0].id).toBe(p.body.player.id);
    expect((await api(ctx, ADMIN, 'POST', '/players', { firstName: 'X', lastName: 'Y', clubCode: 'NOPE' })).status).toBe(422);

    const g = await api(ctx, ADMIN, 'POST', '/games', { homeClubCode: 'MAD', awayClubCode: 'PAR', scheduledAt: '2026-10-21T18:45:00Z' });
    expect(g.status).toBe(200);
    expect(g.body.game).toMatchObject({ gameDay: '2026-10-21', seasonCode: 'E2026', isManual: true, status: 'scheduled' });
    expect(g.body.game.gameCode).toBeLessThan(0);
    const g2 = await api(ctx, ADMIN, 'POST', '/games', { homeClubCode: 'BAR', awayClubCode: 'OLY', scheduledAt: '2026-10-21T20:00:00Z' });
    expect(g2.body.game.gameCode).toBe(g.body.game.gameCode - 1);
    const day = await api(ctx, null, 'GET', '/games?day=2026-10-21');
    expect(day.body.games).toHaveLength(2);
  });
});
