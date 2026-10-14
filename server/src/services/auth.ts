import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Me } from '../api-types.js';
import { BCRYPT_COST } from '../db/seed.js';
import type { Deps } from '../deps.js';
import { createSession, type SessionMember } from '../http/auth.js';
import { HttpError, notFound, unauthorized, unprocessable } from '../http/errors.js';
import { writeAudit } from './audit.js';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60_000;
export const MIN_PASSWORD_LENGTH = 10;

const INVALID_LOGIN = 'Pogrešno korisničko ime ili lozinka.';
/**
 * Compared against when the username does not exist, so the response takes as long as
 * a real check (REQ-01.6). Created lazily with the same cost as real password hashes.
 */
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash('dummy-password-for-timing', BCRYPT_COST);
  return dummyHash;
}

/** Failure timestamps per member, per Deps instance (the 15-minute window of REQ-01.5). */
const failures = new WeakMap<Deps, Map<number, number[]>>();

function failureList(deps: Deps, memberId: number): number[] {
  let m = failures.get(deps);
  if (!m) {
    m = new Map();
    failures.set(deps, m);
  }
  let list = m.get(memberId);
  if (!list) {
    list = [];
    m.set(memberId, list);
  }
  return list;
}

export function toMe(m: SessionMember): Me {
  return {
    memberId: m.id,
    name: m.name,
    displayName: m.displayName,
    username: m.username,
    isAdmin: m.isAdmin,
    mustChangePassword: m.mustChangePassword,
  };
}

export async function login(
  deps: Deps,
  username: string,
  password: string,
): Promise<{ me: Me; token: string; expiresAt: Date }> {
  const now = deps.now();
  const member = await deps.db
    .selectFrom('members')
    .selectAll()
    .where('username', '=', username.trim().toLowerCase())
    .executeTakeFirst();
  if (!member) {
    await bcrypt.compare(password, await getDummyHash());
    throw unauthorized(INVALID_LOGIN);
  }
  if (member.locked_until && member.locked_until.getTime() > now.getTime()) {
    throw new HttpError(
      429,
      'locked',
      'Previše neuspešnih pokušaja prijave. Nalog je privremeno blokiran, pokušajte ponovo za 15 minuta.',
    );
  }
  const ok = await bcrypt.compare(password, member.password_hash);
  if (!ok) {
    const list = failureList(deps, member.id);
    list.push(now.getTime());
    while (list.length > 0 && list[0]! <= now.getTime() - LOCKOUT_MS) list.shift();
    if (list.length >= MAX_FAILED_ATTEMPTS) {
      list.length = 0;
      await deps.db
        .updateTable('members')
        .set({ failed_attempts: 0, locked_until: new Date(now.getTime() + LOCKOUT_MS) })
        .where('id', '=', member.id)
        .execute();
      throw new HttpError(
        429,
        'locked',
        'Previše neuspešnih pokušaja prijave. Nalog je privremeno blokiran, pokušajte ponovo za 15 minuta.',
      );
    }
    await deps.db
      .updateTable('members')
      .set({ failed_attempts: list.length })
      .where('id', '=', member.id)
      .execute();
    throw unauthorized(INVALID_LOGIN);
  }
  failureList(deps, member.id).length = 0;
  await deps.db
    .updateTable('members')
    .set({ failed_attempts: 0, locked_until: null })
    .where('id', '=', member.id)
    .execute();
  const { token, expiresAt } = await createSession(deps, member.id);
  return {
    token,
    expiresAt,
    me: {
      memberId: member.id,
      name: member.name,
      displayName: member.display_name,
      username: member.username,
      isAdmin: member.is_admin === 1,
      mustChangePassword: member.must_change_password === 1,
    },
  };
}

export async function changePassword(
  deps: Deps,
  member: SessionMember,
  currentPassword: string,
  newPassword: string,
  keepSessionId: string | null,
): Promise<Me> {
  const row = await deps.db.selectFrom('members').select('password_hash').where('id', '=', member.id).executeTakeFirst();
  if (!row) throw notFound();
  if (!(await bcrypt.compare(currentPassword, row.password_hash))) {
    throw unprocessable('Trenutna lozinka nije ispravna.');
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw unprocessable(`Nova lozinka mora imati najmanje ${MIN_PASSWORD_LENGTH} karaktera.`);
  }
  if (newPassword === currentPassword) throw unprocessable('Nova lozinka mora biti različita od trenutne.');
  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await deps.db.transaction().execute(async (trx) => {
    await trx
      .updateTable('members')
      .set({ password_hash: hash, must_change_password: 0 })
      .where('id', '=', member.id)
      .execute();
    let del = trx.deleteFrom('sessions').where('member_id', '=', member.id);
    if (keepSessionId) del = del.where('id', '!=', keepSessionId);
    await del.execute();
  });
  return toMe({ ...member, mustChangePassword: false });
}

/** REQ-01.3: temporary password shown once to the admin; all sessions of the member end. */
export async function resetPassword(deps: Deps, actor: SessionMember, memberId: number): Promise<string> {
  const target = await deps.db.selectFrom('members').select(['id', 'name']).where('id', '=', memberId).executeTakeFirst();
  if (!target) throw notFound('Član nije pronađen.');
  const temporaryPassword = randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);
  await deps.db.transaction().execute(async (trx) => {
    await trx
      .updateTable('members')
      .set({ password_hash: hash, must_change_password: 1, failed_attempts: 0, locked_until: null })
      .where('id', '=', memberId)
      .execute();
    await trx.deleteFrom('sessions').where('member_id', '=', memberId).execute();
    await writeAudit(trx, {
      at: deps.now(),
      actorMemberId: actor.id,
      action: 'password_reset',
      entity: 'member',
      entityId: memberId,
      field: 'password',
    });
  });
  failureList(deps, memberId).length = 0;
  return temporaryPassword;
}
