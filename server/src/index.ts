import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import type { Deps } from './deps.js';
import { createDb } from './db/kysely.js';
import { migrateToLatest } from './db/migrate.js';
import { seed } from './db/seed.js';
import { EventBus } from './live/bus.js';
import { EuroleagueLiveProvider } from './provider/euroleague.js';
import { DerivedService } from './services/derived.js';
import { startScheduler } from './worker/scheduler.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config.db);

  await migrateToLatest(db);
  const { generatedPasswords } = await seed(db, { initialPassword: config.initialPassword });

  const deps: Deps = {
    db,
    config,
    provider: new EuroleagueLiveProvider(config.euroleague),
    bus: new EventBus(),
    derived: new DerivedService(db),
    now: () => new Date(),
  };

  const app = await buildApp(deps, { logger: true });

  for (const [username, password] of Object.entries(generatedPasswords)) {
    // Printed once on first start only; members must change it at first login.
    app.log.warn({ username }, `Početna lozinka za ${username}: ${password}`);
  }

  const scheduler = config.enableWorker ? startScheduler(deps) : null;

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Gašenje...');
    await scheduler?.stop();
    await app.close();
    await db.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
