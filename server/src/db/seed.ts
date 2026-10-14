import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { DB } from './kysely.js';
import { seasonForDate, seasonName, seasonStartDate, todayInBelgrade } from '../domain/season.js';

/** The team is fixed (BR-01); Ivanišević is the initial admin (BR-32). */
export const TEAM = [
  { id: 1, name: 'Ivanišević', username: 'ivanisevic', isAdmin: true },
  { id: 2, name: 'Tozislav', username: 'tozislav', isAdmin: false },
  { id: 3, name: 'Lakićević', username: 'lakicevic', isAdmin: false },
  { id: 4, name: 'Simara', username: 'simara', isAdmin: false },
] as const;

export const BCRYPT_COST = 12;

export interface SeedResult {
  /** Plain passwords generated on first run, to be printed once to the log. */
  generatedPasswords: Record<string, string>;
}

export async function seed(
  db: DB,
  opts: { initialPassword: string | null; bcryptCost?: number; now?: Date },
): Promise<SeedResult> {
  const generatedPasswords: Record<string, string> = {};
  const existing = await db.selectFrom('members').select('id').execute();
  if (existing.length === 0) {
    for (const [i, m] of TEAM.entries()) {
      const password = opts.initialPassword ?? randomBytes(9).toString('base64url');
      if (!opts.initialPassword) generatedPasswords[m.username] = password;
      await db
        .insertInto('members')
        .values({
          id: m.id,
          name: m.name,
          display_name: m.name,
          avatar_url: null,
          username: m.username,
          password_hash: await bcrypt.hash(password, opts.bcryptCost ?? BCRYPT_COST),
          must_change_password: 1,
          is_admin: m.isAdmin ? 1 : 0,
          sort_order: i + 1,
          locked_until: null,
        })
        .execute();
    }
  }

  const code = seasonForDate(todayInBelgrade(opts.now));
  await db
    .insertInto('seasons')
    .values({ code, name: seasonName(code), start_date: seasonStartDate(code) })
    .onDuplicateKeyUpdate({ name: seasonName(code) })
    .execute();

  return { generatedPasswords };
}
