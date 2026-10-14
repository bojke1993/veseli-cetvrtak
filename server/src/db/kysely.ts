import { Kysely, MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';
import type { AppConfig } from '../config.js';
import type { Database } from './schema.js';

export type DB = Kysely<Database>;

export function createDb(cfg: AppConfig['db']): DB {
  const pool = createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    connectionLimit: 10,
    timezone: 'Z', // DATETIME columns are UTC
    dateStrings: ['DATE'], // DATE columns stay 'YYYY-MM-DD'
    supportBigNumbers: true,
    charset: 'utf8mb4',
  });
  return new Kysely<Database>({ dialect: new MysqlDialect({ pool }) });
}
