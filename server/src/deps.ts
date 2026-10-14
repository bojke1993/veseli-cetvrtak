import type { AppConfig } from './config.js';
import type { DB } from './db/kysely.js';
import type { DerivedState } from './domain/derived-types.js';
import type { EventBus } from './live/bus.js';
import type { EuroleagueProvider } from './provider/types.js';

/** Cached derived state (streaks, cooldowns, fire, blame); see services/derived.ts. */
export interface DerivedProvider {
  get(): Promise<DerivedState>;
  /** Must be called after any change to rounds/picks results or composition. */
  invalidate(): void;
}

/** Everything routes, services and jobs need; injected so tests can swap parts. */
export interface Deps {
  db: DB;
  config: AppConfig;
  provider: EuroleagueProvider;
  bus: EventBus;
  derived: DerivedProvider;
  /** Current time; tests inject a fixed clock. */
  now: () => Date;
}
