export interface AppConfig {
  port: number;
  host: string;
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  /** Production enables Secure cookies and serves the built SPA. */
  production: boolean;
  /** Initial password for all four members on first seed; generated when empty. */
  initialPassword: string | null;
  /** Directory with the built web app (index.html + assets). */
  publicDir: string | null;
  /** Start the background scheduler together with the HTTP server. */
  enableWorker: boolean;
  /** Directory for daily mysqldump backups; null disables the backup job. */
  backupDir: string | null;
  euroleague: {
    apiBase: string;
    liveBase: string;
    competition: string;
    userAgent: string;
  };
  timezone: string;
}

function int(value: string | undefined, fallback: number): number {
  const n = value === undefined ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: int(env.PORT, 8080),
    host: env.HOST ?? '0.0.0.0',
    db: {
      host: env.DB_HOST ?? '127.0.0.1',
      port: int(env.DB_PORT, 3306),
      user: env.DB_USER ?? 'vc',
      password: env.DB_PASSWORD ?? 'vc',
      database: env.DB_NAME ?? 'veseli_cetvrtak',
    },
    production: env.NODE_ENV === 'production',
    initialPassword: env.INITIAL_PASSWORD || null,
    publicDir: env.PUBLIC_DIR || null,
    enableWorker: env.ENABLE_WORKER !== 'false',
    backupDir: env.BACKUP_DIR || null,
    euroleague: {
      apiBase: env.EL_API_BASE ?? 'https://api-live.euroleague.net',
      liveBase: env.EL_LIVE_BASE ?? 'https://live.euroleague.net',
      competition: 'E',
      userAgent: env.EL_USER_AGENT ?? 'VeseliCetvrtak/1.0 (private, 4 users)',
    },
    timezone: 'Europe/Belgrade',
  };
}
