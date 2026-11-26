import { sql, type Kysely } from 'kysely';

/**
 * BR-41 / P-28: Web Push for new chat messages. One row per device (browser push subscription);
 * `app_settings` keeps the server's VAPID key pair, generated on first use.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TABLE push_subscriptions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    member_id TINYINT UNSIGNED NOT NULL,
    endpoint VARCHAR(700) NOT NULL,
    p256dh VARCHAR(200) NOT NULL,
    auth VARCHAR(100) NOT NULL,
    user_agent VARCHAR(300) NULL,
    created_at DATETIME NOT NULL,
    last_success_at DATETIME NULL,
    UNIQUE KEY uq_push_endpoint (endpoint),
    CONSTRAINT fk_push_member FOREIGN KEY (member_id) REFERENCES members(id)
  )`.execute(db);
  await sql`CREATE TABLE app_settings (
    name VARCHAR(64) NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
  )`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE app_settings`.execute(db);
  await sql`DROP TABLE push_subscriptions`.execute(db);
}
