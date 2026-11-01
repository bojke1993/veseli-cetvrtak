import { sql, type Kysely } from 'kysely';

/** P-22: proposals carry odds; total odds of open rounds become the product of the pick odds. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE proposals ADD COLUMN odds DECIMAL(8,2) NULL AFTER direction`.execute(db);
  await sql`UPDATE rounds r
    LEFT JOIN picks a ON a.round_id = r.id AND a.slot = 1
    LEFT JOIN picks b ON b.round_id = r.id AND b.slot = 2
    LEFT JOIN picks c ON c.round_id = r.id AND c.slot = 3
    LEFT JOIN picks d ON d.round_id = r.id AND d.slot = 4
    SET r.total_odds = ROUND(a.odds * b.odds * c.odds * d.odds, 2)
    WHERE r.status = 'open'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE proposals DROP COLUMN odds`.execute(db);
}
