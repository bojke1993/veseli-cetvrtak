import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import type { DB } from './kysely.js';
import * as m001 from './migrations/001_initial.js';

/** Migrations are registered in code so they work identically from src (tsx) and dist (node). */
const migrations: Record<string, Migration> = {
  '001_initial': m001,
};

const provider: MigrationProvider = {
  getMigrations: async () => migrations,
};

export async function migrateToLatest(db: DB): Promise<void> {
  const migrator = new Migrator({ db, provider });
  const { error, results } = await migrator.migrateToLatest();
  for (const r of results ?? []) {
    if (r.status === 'Error') throw new Error(`Migration ${r.migrationName} failed`);
  }
  if (error) throw error instanceof Error ? error : new Error(String(error));
}
