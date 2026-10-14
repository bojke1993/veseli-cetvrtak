import { createDB } from 'mysql-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mysqlPort: number;
    mysqlUser: string;
  }
}

/** Starts one throwaway MySQL server for the whole test run (downloaded on first use). */
export default async function setup(project: TestProject) {
  const db = await createDB({ version: '8.4.x', logLevel: 'ERROR' });
  project.provide('mysqlPort', db.port);
  project.provide('mysqlUser', db.username);
  return async () => {
    await db.stop();
  };
}
