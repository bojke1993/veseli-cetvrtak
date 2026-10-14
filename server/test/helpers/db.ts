import { randomBytes } from 'node:crypto';
import { createPool } from 'mysql2/promise';
import { inject } from 'vitest';
import { loadConfig, type AppConfig } from '../../src/config.js';
import { createDb, type DB } from '../../src/db/kysely.js';
import { migrateToLatest } from '../../src/db/migrate.js';
import { seed } from '../../src/db/seed.js';

export const TEST_PASSWORD = 'test-password-123';

export interface TestDb {
  db: DB;
  config: AppConfig;
  destroy(): Promise<void>;
}

/** Creates a fresh, migrated and seeded database on the shared test MySQL server. */
export async function createTestDb(opts: { seed?: boolean; now?: Date } = {}): Promise<TestDb> {
  const port = inject('mysqlPort');
  const user = inject('mysqlUser');
  const name = `t_${randomBytes(6).toString('hex')}`;
  const admin = createPool({ host: '127.0.0.1', port, user, password: '' });
  await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await admin.end();

  const config: AppConfig = {
    ...loadConfig({}),
    db: { host: '127.0.0.1', port, user, password: '', database: name },
    enableWorker: false,
    initialPassword: TEST_PASSWORD,
  };
  const db = createDb(config.db);
  await migrateToLatest(db);
  if (opts.seed !== false) await seed(db, { initialPassword: TEST_PASSWORD, bcryptCost: 4, now: opts.now });

  return {
    db,
    config,
    async destroy() {
      await db.destroy();
      const pool = createPool({ host: '127.0.0.1', port, user, password: '' });
      await pool.query(`DROP DATABASE IF EXISTS \`${name}\``);
      await pool.end();
    },
  };
}
