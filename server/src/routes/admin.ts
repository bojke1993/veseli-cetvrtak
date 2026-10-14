import type { FastifyInstance } from 'fastify';
import type { AdminTasksResponse, SyncRunDto, SyncRunsResponse } from '../api-types.js';
import type { Deps } from '../deps.js';
import { requireAdmin } from '../http/auth.js';
import { HttpError } from '../http/errors.js';
import { writeAudit } from '../services/audit.js';
import { iso } from '../services/dto.js';
import { syncPlayers, syncSchedule } from '../services/sync.js';
import { listAdminTasks } from '../services/tasks.js';

const SYNC_TYPES = ['players', 'schedule', 'live', 'final', 'recheck', 'backup'] as const;

export async function registerAdminRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/admin/tasks', { preHandler: requireAdmin }, async (): Promise<AdminTasksResponse> => ({
    tasks: await listAdminTasks(deps),
  }));

  app.get('/admin/sync-runs', { preHandler: requireAdmin }, async (): Promise<SyncRunsResponse> => {
    const rows = await deps.db.selectFrom('sync_runs').selectAll().orderBy('started_at', 'desc').orderBy('id', 'desc').limit(50).execute();
    const runs: SyncRunDto[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      startedAt: r.started_at.toISOString(),
      finishedAt: iso(r.finished_at),
      status: r.status,
      errorMessage: r.error_message,
      itemsChanged: r.items_changed,
    }));
    const lastOk: Record<string, string | null> = {};
    for (const type of SYNC_TYPES) {
      const ok = await deps.db
        .selectFrom('sync_runs')
        .select(['finished_at', 'started_at'])
        .where('type', '=', type)
        .where('status', '=', 'ok')
        .orderBy('started_at', 'desc')
        .executeTakeFirst();
      lastOk[type] = ok ? iso(ok.finished_at ?? ok.started_at) : null;
    }
    return { runs, lastOk };
  });

  const runSync = (label: string, fn: (d: Deps) => Promise<{ changed: number }>) => async () => {
    try {
      const res = await fn(deps);
      return { ok: true, changed: res.changed };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpError(502, 'provider', `Sinhronizacija ${label} nije uspela: ${msg}`);
    }
  };
  app.post('/admin/sync/players', { preHandler: requireAdmin }, runSync('igrača', syncPlayers));
  app.post('/admin/sync/schedule', { preHandler: requireAdmin }, runSync('rasporeda', (d) => syncSchedule(d)));

  app.post('/admin/recalc', { preHandler: requireAdmin }, async (request) => {
    deps.derived.invalidate();
    const derived = await deps.derived.get();
    await writeAudit(deps.db, {
      at: deps.now(),
      actorMemberId: request.member!.id,
      action: 'full_recalc',
      entity: 'derived',
      newValue: { rounds: derived.rounds.size },
    });
    return { ok: true };
  });
}
