import type { Deps } from '../../src/deps.js';
import { EventBus } from '../../src/live/bus.js';
import { FakeProvider } from '../../src/provider/fake.js';
import { DerivedService } from '../../src/services/derived.js';
import { createTestDb, type TestDb } from './db.js';

export interface TestDeps extends Deps {
  provider: FakeProvider;
  t: TestDb;
  /** Move the injected clock. */
  setNow(date: Date | string): void;
}

/** Fresh DB + fake provider + fixed clock (default 2026-10-15T10:00:00Z). */
export async function createTestDeps(opts: { now?: Date | string; seed?: boolean } = {}): Promise<TestDeps> {
  let current = new Date(opts.now ?? '2026-10-15T10:00:00Z');
  const t = await createTestDb({ seed: opts.seed, now: current });
  const deps: TestDeps = {
    t,
    db: t.db,
    config: t.config,
    provider: new FakeProvider(),
    bus: new EventBus(),
    derived: new DerivedService(t.db),
    now: () => current,
    setNow(date) {
      current = new Date(date);
    },
  };
  return deps;
}
