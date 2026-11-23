import { sql, type Kysely } from 'kysely';

/** P-25 / FR-29: final box scores of all players are kept for the player form (last 5 games). */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE games ADD COLUMN boxscore_saved_at DATETIME NULL AFTER last_polled_at`.execute(db);
  await sql`CREATE INDEX ix_player_game_stats_player ON player_game_stats (player_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX ix_player_game_stats_player ON player_game_stats`.execute(db);
  await sql`ALTER TABLE games DROP COLUMN boxscore_saved_at`.execute(db);
}
