import type { Deps } from '../deps.js';
import {
  logJob,
  runAutoLock,
  runBackup,
  runLivePoll,
  runNotPlayed,
  runPlayers,
  runRecheck,
  runResolvePending,
  runSchedule,
} from './jobs.js';

export const DEFAULT_TICK_MS = 30_000;

const JOBS: Array<[string, (deps: Deps) => Promise<unknown>]> = [
  ['schedule', runSchedule],
  ['players', runPlayers],
  ['notPlayed', runNotPlayed],
  ['autoLock', runAutoLock],
  ['livePoll', runLivePoll],
  ['resolvePending', runResolvePending],
  ['recheck', runRecheck],
  ['backup', runBackup],
];

/** Runs every job once, sequentially; a failing job is logged and does not stop the others. */
export async function runTick(deps: Deps): Promise<void> {
  for (const [name, job] of JOBS) {
    const started = Date.now();
    try {
      const result = await job(deps);
      if (isInteresting(result)) logJob(name, 'info', { result, ms: Date.now() - started });
    } catch (e) {
      logJob(name, 'error', { error: e instanceof Error ? e.stack ?? e.message : String(e) });
    }
  }
}

function isInteresting(result: unknown): boolean {
  if (result === null || result === undefined || result === false || result === 0) return false;
  if (Array.isArray(result)) return result.length > 0;
  if (typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if ('polled' in r) return (r.polled as unknown[]).length > 0 || (r.errors as number) > 0;
    if ('checked' in r) return (r.checked as number) > 0;
  }
  return true;
}

/**
 * Starts the background scheduler (design §8): one tick immediately, then every `tickMs`.
 * Ticks never overlap; all state lives in the DB, so a restart simply resumes (REQ-38.6).
 */
export function startScheduler(deps: Deps, opts: { tickMs?: number } = {}): { stop(): Promise<void> } {
  const tickMs = opts.tickMs ?? DEFAULT_TICK_MS;
  let running: Promise<void> | null = null;
  let stopped = false;

  const tick = (): void => {
    if (stopped || running) return;
    running = runTick(deps)
      .catch((e) => logJob('scheduler', 'error', { error: String(e) }))
      .finally(() => {
        running = null;
      });
  };

  tick();
  const timer = setInterval(tick, tickMs);
  timer.unref?.();

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      if (running) await running;
    },
  };
}
