import { sql, type Kysely } from 'kysely';

/**
 * BR-42 / P-27: a round can be marked "ticket not placed" (it then does not count in the balance)
 * and carry a public note; disciplinary measures gain the mild "notice" (two notices = a warning).
 *
 * One-off data fix (P-27): round #18 (24.11.2026.) — Tozislav did not deliver his pick in time, so
 * the payer (Lakićević; the round wrongly had Tozislav as payer) did not place the ticket. Applied
 * only if that round exists exactly as recorded.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE rounds
    ADD COLUMN ticket_not_placed TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN note VARCHAR(1000) NULL`.execute(db);
  await sql`ALTER TABLE sanctions MODIFY kind ENUM('notice','warning','suspension') NOT NULL`.execute(db);

  const found = await sql<{ id: number }>`SELECT id FROM rounds
    WHERE number = 18 AND game_day = '2026-11-24' AND payer_member_id = 2 AND source = 'app'
      AND status IN ('won','lost','void')`.execute(db);
  const round = found.rows[0];
  const tozislav = await sql<{ id: number }>`SELECT id FROM members WHERE id = 2 AND name = 'Tozislav'`.execute(db);
  const lakicevic = await sql<{ id: number }>`SELECT id FROM members WHERE id = 3 AND name = 'Lakićević'`.execute(db);
  const admin = await sql<{ id: number }>`SELECT id FROM members WHERE is_admin = 1 LIMIT 1`.execute(db);
  if (!round || !tozislav.rows[0] || !lakicevic.rows[0] || !admin.rows[0]) return;
  const adminId = admin.rows[0].id;
  const note = 'Tiket nije uplaćen — Tozislav nije na vreme dostavio svoj par, pa uplatilac (Lakićević) nije uplatio tiket. Kolo se ne računa u bilans.';
  const reason = 'Nije na vreme dostavio par za kolo #18, pa tiket nije uplaćen. Sledeće upozorenje ove vrste je opomena 🟨.';
  await sql`UPDATE rounds SET ticket_not_placed = 1, note = ${note}, payer_member_id = 3 WHERE id = ${round.id}`.execute(db);
  await sql`INSERT INTO audit_log (at, actor_member_id, action, round_id, entity, entity_id, field, old_value, new_value, reason)
    VALUES (UTC_TIMESTAMP(), ${adminId}, 'correct', ${round.id}, 'round', ${String(round.id)}, 'payer',
      ${JSON.stringify(2)}, ${JSON.stringify(3)}, 'Uplatilac u kolu #18 je bio Lakićević.')`.execute(db);
  await sql`INSERT INTO audit_log (at, actor_member_id, action, round_id, entity, entity_id, field, old_value, new_value, reason)
    VALUES (UTC_TIMESTAMP(), ${adminId}, 'round_note', ${round.id}, 'round', ${String(round.id)}, 'ticket_not_placed',
      ${JSON.stringify({ notPlaced: false, note: null })}, ${JSON.stringify({ notPlaced: true, note })}, ${note})`.execute(db);
  const ins = await sql`INSERT INTO sanctions (member_id, kind, round_id, reason, issued_by, issued_at)
    VALUES (2, 'notice', ${round.id}, ${reason}, ${adminId}, UTC_TIMESTAMP())`.execute(db);
  const sanctionId = Number(ins.insertId);
  await sql`INSERT INTO audit_log (at, actor_member_id, action, round_id, entity, entity_id, field, old_value, new_value, reason)
    VALUES (UTC_TIMESTAMP(), ${adminId}, 'sanction_issue', ${round.id}, 'sanction', ${String(sanctionId)}, 'notice', NULL,
      ${JSON.stringify({ memberId: 2, kind: 'notice', escalation: false })}, ${reason})`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DELETE FROM sanctions WHERE kind = 'notice'`.execute(db);
  await sql`ALTER TABLE sanctions MODIFY kind ENUM('warning','suspension') NOT NULL`.execute(db);
  await sql`ALTER TABLE rounds DROP COLUMN ticket_not_placed, DROP COLUMN note`.execute(db);
}
