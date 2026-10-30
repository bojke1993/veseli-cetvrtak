import type { CreateProposalRequest } from '../api-types.js';
import type { DB } from '../db/kysely.js';
import type { Proposal, Round } from '../db/schema.js';
import type { Deps } from '../deps.js';
import type { SessionMember } from '../http/auth.js';
import { conflict, forbidden, notFound, unprocessable } from '../http/errors.js';
import { writeAudit } from './audit.js';
import { getRoundOr404, validateSelection, writePick } from './rounds.js';

function requireOpenRound(round: Round): void {
  if (round.status !== 'open') throw conflict('Predlozi i glasanje su mogući samo dok je kolo otvoreno.');
}

async function cooldownInRound(db: DB, roundId: number): Promise<Set<number>> {
  const rows = await db
    .selectFrom('picks')
    .select('cooldown_for_member_id')
    .where('round_id', '=', roundId)
    .where('kind', '=', 'team')
    .execute();
  return new Set(rows.map((r) => r.cooldown_for_member_id).filter((x): x is number => x !== null));
}

async function slotFor(db: DB, roundId: number, p: Pick<Proposal, 'kind' | 'proposed_by' | 'cooldown_for_member_id'>) {
  let q = db.selectFrom('picks').selectAll().where('round_id', '=', roundId).where('kind', '=', p.kind);
  q = p.kind === 'personal' ? q.where('member_id', '=', p.proposed_by) : q.where('cooldown_for_member_id', '=', p.cooldown_for_member_id);
  return q.executeTakeFirst();
}

/** REQ-09 (personal) and REQ-19 (team) proposals. */
export async function createProposal(
  deps: Deps,
  member: SessionMember,
  roundId: number,
  input: CreateProposalRequest,
): Promise<void> {
  const round = await getRoundOr404(deps.db, roundId);
  requireOpenRound(round);
  const cooldown = await cooldownInRound(deps.db, round.id);
  if (cooldown.has(member.id)) throw forbidden('Član na hlađenju ne može predlagati tipove u ovom kolu.');

  let cooldownFor: number | null = null;
  if (input.kind === 'team') {
    if (input.cooldownForMemberId === undefined || !cooldown.has(input.cooldownForMemberId)) {
      throw unprocessable('Tip ekipe mora biti vezan za člana na hlađenju u ovom kolu.');
    }
    cooldownFor = input.cooldownForMemberId;
  }
  const slot = await slotFor(deps.db, round.id, { kind: input.kind, proposed_by: member.id, cooldown_for_member_id: cooldownFor });
  if (!slot) throw unprocessable('U ovom kolu ne postoji odgovarajuće mesto za predlog.');
  await validateSelection(deps.db, round, input, deps.now(), slot.slot);

  const comment = input.comment?.trim() ? input.comment.trim().slice(0, 500) : null;
  await deps.db.transaction().execute(async (trx) => {
    if (input.kind === 'personal') {
      // A member keeps a single pending personal proposal; a new one replaces it (REQ-09.1).
      await trx
        .updateTable('proposals')
        .set({ status: 'superseded' })
        .where('round_id', '=', round.id)
        .where('kind', '=', 'personal')
        .where('proposed_by', '=', member.id)
        .where('status', '=', 'pending')
        .execute();
    }
    await trx
      .insertInto('proposals')
      .values({
        round_id: round.id,
        proposed_by: member.id,
        kind: input.kind,
        cooldown_for_member_id: cooldownFor,
        player_id: input.playerId,
        line: input.line,
        direction: input.direction,
        comment,
        status: 'pending',
        // Explicit (not the DB default) so acceptance after tip-off compares against the app clock.
        created_at: deps.now(),
      })
      .execute();
  });
  deps.bus.roundChanged(round.id);
}

async function getProposalOr404(db: DB, id: number): Promise<Proposal> {
  const p = await db.selectFrom('proposals').selectAll().where('id', '=', id).executeTakeFirst();
  if (!p) throw notFound('Predlog nije pronađen.');
  return p;
}

/** Vote (👍) on a pending proposal; one per member; members on cooldown cannot vote. Returns roundId. */
export async function vote(deps: Deps, member: SessionMember, proposalId: number, on: boolean): Promise<number> {
  const p = await getProposalOr404(deps.db, proposalId);
  const round = await getRoundOr404(deps.db, p.round_id);
  requireOpenRound(round);
  if ((await cooldownInRound(deps.db, round.id)).has(member.id)) {
    throw forbidden('Član na hlađenju ne može da glasa u ovom kolu.');
  }
  if (on) {
    if (p.status !== 'pending') throw conflict('Glasati se može samo za predlog koji čeka potvrdu.');
    await deps.db
      .insertInto('proposal_votes')
      .values({ proposal_id: p.id, member_id: member.id })
      .onDuplicateKeyUpdate({ member_id: member.id })
      .execute();
  } else {
    await deps.db.deleteFrom('proposal_votes').where('proposal_id', '=', p.id).where('member_id', '=', member.id).execute();
  }
  deps.bus.roundChanged(round.id);
  return round.id;
}

/**
 * Admin accepts a proposal → it becomes the slot's pick; other proposals for the slot are superseded.
 * A proposal given before its game started can be accepted after tip-off (the ticket was played
 * with it); such an acceptance is written to the audit log.
 */
export async function acceptProposal(deps: Deps, proposalId: number, actorMemberId: number | null = null): Promise<number> {
  const p = await getProposalOr404(deps.db, proposalId);
  const round = await getRoundOr404(deps.db, p.round_id);
  requireOpenRound(round);
  if (p.status !== 'pending') throw conflict('Predlog nije na čekanju.');
  const slot = await slotFor(deps.db, round.id, p);
  if (!slot) throw conflict('Mesto za ovaj predlog više ne postoji u kolu.');
  const now = deps.now();
  const { gameStarted } = await writePick(
    deps.db,
    round,
    slot.slot,
    { playerId: p.player_id, line: Number(p.line), direction: p.direction, odds: slot.odds === null ? null : Number(slot.odds) },
    now,
    p.created_at,
  );
  await deps.db.transaction().execute(async (trx) => {
    if (gameStarted) {
      await writeAudit(trx, {
        at: now,
        actorMemberId,
        action: 'late_accept',
        roundId: round.id,
        entity: 'pick',
        entityId: slot.id,
        field: 'proposal',
        oldValue: slot.player_id,
        newValue: { proposalId: p.id, playerId: p.player_id, line: Number(p.line), direction: p.direction },
        reason: 'Predlog dat pre početka utakmice, prihvaćen posle početka.',
      });
    }
    await trx.updateTable('proposals').set({ status: 'accepted' }).where('id', '=', p.id).execute();
    let others = trx
      .updateTable('proposals')
      .set({ status: 'superseded' })
      .where('round_id', '=', round.id)
      .where('id', '!=', p.id)
      .where('status', '=', 'pending')
      .where('kind', '=', p.kind);
    others =
      p.kind === 'personal'
        ? others.where('proposed_by', '=', p.proposed_by)
        : others.where('cooldown_for_member_id', '=', p.cooldown_for_member_id);
    await others.execute();
  });
  deps.bus.roundChanged(round.id);
  return round.id;
}
