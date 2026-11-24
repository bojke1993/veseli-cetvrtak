import { sql, type Kysely } from 'kysely';

/** BR-41 / P-26: team chat (members only) plus per-member read marker and last-seen time. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TABLE chat_messages (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    member_id TINYINT UNSIGNED NOT NULL,
    body VARCHAR(1000) NOT NULL,
    created_at DATETIME NOT NULL,
    deleted_at DATETIME NULL,
    deleted_by TINYINT UNSIGNED NULL,
    CONSTRAINT fk_chat_member FOREIGN KEY (member_id) REFERENCES members(id)
  )`.execute(db);
  await sql`ALTER TABLE members
    ADD COLUMN chat_read_id INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN last_seen_at DATETIME NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE members DROP COLUMN chat_read_id, DROP COLUMN last_seen_at`.execute(db);
  await sql`DROP TABLE chat_messages`.execute(db);
}
