import { sql, type Kysely } from 'kysely';

/** BR-37 / P-24: disciplinary measures (warnings and round suspensions) issued by the admin. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TABLE sanctions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    member_id TINYINT UNSIGNED NOT NULL,
    kind ENUM('warning','suspension') NOT NULL,
    round_id INT UNSIGNED NULL,
    reason VARCHAR(1000) NOT NULL,
    issued_by TINYINT UNSIGNED NOT NULL,
    issued_at DATETIME NOT NULL,
    escalation TINYINT(1) NOT NULL DEFAULT 0,
    consumed_by_id INT UNSIGNED NULL,
    served_round_id INT UNSIGNED NULL,
    revoked_at DATETIME NULL,
    revoked_by TINYINT UNSIGNED NULL,
    revoke_reason VARCHAR(1000) NULL,
    CONSTRAINT fk_sanctions_member FOREIGN KEY (member_id) REFERENCES members(id),
    CONSTRAINT fk_sanctions_round FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE SET NULL,
    CONSTRAINT fk_sanctions_served FOREIGN KEY (served_round_id) REFERENCES rounds(id) ON DELETE SET NULL,
    INDEX ix_sanctions_member (member_id, issued_at)
  )`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE sanctions`.execute(db);
}
