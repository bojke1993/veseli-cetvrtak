import { describe, expect, it } from 'vitest';
import { createTestDb } from '../helpers/db.js';

describe('test infrastructure', () => {
  it('creates a migrated, seeded database', async () => {
    const t = await createTestDb();
    const members = await t.db.selectFrom('members').select(['name', 'is_admin']).orderBy('id').execute();
    expect(members.map((m) => m.name)).toEqual(['Ivanišević', 'Tozislav', 'Lakićević', 'Simara']);
    expect(members[0]?.is_admin).toBe(1);
    await t.destroy();
  });
});
