import type {
  CorrectionRequest,
  CurrentRoundResponse,
  ManualResolveRequest,
  PickDto,
  PickLiveDto,
  ProposalDto,
  RoundDetailDto,
  RoundSummaryDto,
  SetPickRequest,
  UpdateRoundRequest,
} from '../api-types.js';
import type { DB } from '../db/kysely.js';
import type {
  Direction,
  Game,
  Pick,
  PickResult,
  PickUpdate,
  Player,
  Round,
  RoundStatus,
  RoundUpdate,
  VoidReason,
} from '../db/schema.js';
import type { Deps } from '../deps.js';
import { computeDerived } from '../domain/derived.js';
import type { DerivedRoundInput, DerivedState } from '../domain/derived-types.js';
import { round2, toNum } from '../domain/money.js';
import { isValidLine, liveStatus, resolvePick } from '../domain/pick.js';
import { seasonForDate, seasonName, seasonStartDate } from '../domain/season.js';
import { potentialWin, ticketOutcome } from '../domain/ticket.js';
import type { SessionMember } from '../http/auth.js';
import { conflict, notFound, unprocessable } from '../http/errors.js';
import { writeAudit } from './audit.js';
import { loadDerivedInputs } from './derived.js';
import {
  auditDto,
  gameDto,
  gameNotStarted,
  iso,
  isMoney,
  loadClubs,
  num,
  playerDto,
  shortDay,
  type ClubMap,
} from './dto.js';
import { listGameDays } from './games.js';
import { applyPickResult, refreshRoundOutcome } from './resolution.js';

export const LINE_MESSAGE = 'Dozvoljene su samo granice x,5 (npr. 14,5 ili 15,5).';
export const RESOLVED_STATUSES: RoundStatus[] = ['won', 'lost', 'void'];
export const ACTIVE_STATUSES: RoundStatus[] = ['open', 'locked', 'in_progress'];
/** Limits keep stake × odds within DECIMAL(12,2) (max 9.999.999.999,99). */
export const MAX_STAKE = 1_000_000;
export const MAX_ODDS = 1_000;
export const MAX_AMOUNT = 9_999_999_999;

const STATUS_LABEL: Record<RoundStatus, string> = {
  open: 'Otvoreno',
  locked: 'Zaključano',
  in_progress: 'U toku',
  won: 'Dobitno',
  lost: 'Gubitno',
  void: 'Poništeno',
};
const RESULT_LABEL: Record<PickResult, string> = { hit: 'pogodak', miss: 'promašaj', void: 'poništen' };
const DIRECTION_LABEL: Record<Direction, string> = { over: 'više', under: 'manje' };

// ---------- loading helpers ----------

export async function getRoundOr404(db: DB, roundId: number): Promise<Round> {
  const r = await db.selectFrom('rounds').selectAll().where('id', '=', roundId).executeTakeFirst();
  if (!r) throw notFound('Kolo nije pronađeno.');
  return r;
}

async function memberNames(db: DB): Promise<Map<number, string>> {
  const rows = await db.selectFrom('members').select(['id', 'name']).execute();
  return new Map(rows.map((m) => [m.id, m.name]));
}

interface RoundData {
  picks: Map<number, Pick[]>;
  players: Map<number, Player>;
  games: Map<number, Game>;
  clubs: ClubMap;
}

async function loadRoundData(db: DB, roundIds: number[], withGames: boolean): Promise<RoundData> {
  const picks = new Map<number, Pick[]>();
  if (roundIds.length === 0) return { picks, players: new Map(), games: new Map(), clubs: new Map() };
  const pickRows = await db.selectFrom('picks').selectAll().where('round_id', 'in', roundIds).orderBy('slot').execute();
  for (const p of pickRows) {
    const list = picks.get(p.round_id) ?? [];
    list.push(p);
    picks.set(p.round_id, list);
  }
  const playerIds = [...new Set(pickRows.map((p) => p.player_id).filter((x): x is number => x !== null))];
  const players = new Map<number, Player>();
  if (playerIds.length > 0) {
    for (const p of await db.selectFrom('players').selectAll().where('id', 'in', playerIds).execute()) players.set(p.id, p);
  }
  const games = new Map<number, Game>();
  const gameIds = [...new Set(pickRows.map((p) => p.game_id).filter((x): x is number => x !== null))];
  if (withGames && gameIds.length > 0) {
    for (const g of await db.selectFrom('games').selectAll().where('id', 'in', gameIds).execute()) games.set(g.id, g);
  }
  const clubs = await loadClubs(db, [
    ...[...players.values()].map((p) => p.club_code),
    ...[...games.values()].flatMap((g) => [g.home_club_code, g.away_club_code]),
  ]);
  return { picks, players, games, clubs };
}

function pickComplete(p: Pick): boolean {
  return p.player_id !== null && p.game_id !== null && p.line !== null && p.direction !== null;
}

function slotLabel(p: Pick, names: Map<number, string>): string {
  if (p.kind === 'team') return `Tip ekipe (umesto: ${names.get(p.cooldown_for_member_id ?? 0) ?? '?'})`;
  return `Tip: ${names.get(p.member_id ?? 0) ?? '?'}`;
}

/** REQ-11.1: what is still missing before locking, in Serbian. */
export function missingForLock(round: Round, picks: Pick[], names: Map<number, string>): string[] {
  const missing: string[] = [];
  for (const p of picks) {
    if (p.player_id === null) missing.push(`${slotLabel(p, names)} — igrač`);
    else if (p.game_id === null) missing.push(`${slotLabel(p, names)} — utakmica`);
    if (p.player_id !== null && p.line === null) missing.push(`${slotLabel(p, names)} — granica`);
    if (p.player_id !== null && p.direction === null) missing.push(`${slotLabel(p, names)} — smer`);
  }
  if (picks.length < 4) missing.push('Kolo nema 4 tipa');
  if (round.stake === null) missing.push('Uplata');
  if (round.total_odds === null) missing.push('Ukupna kvota');
  if (round.payer_member_id === null) missing.push('Uplatilac');
  return missing;
}

function outcomeLabel(round: Round, picks: Pick[]): string | null {
  if (!RESOLVED_STATUSES.includes(round.status)) return null;
  return ticketOutcome(picks.map((p) => p.result)).label;
}

function potential(round: { stake: string | null; total_odds: string | null }): number | null {
  const stake = toNum(round.stake);
  const odds = toNum(round.total_odds);
  return stake !== null && odds !== null ? potentialWin(stake, odds) : null;
}

function summaryBase(round: Round, picks: Pick[], derived: DerivedState): Omit<RoundSummaryDto, 'picks'> {
  const rd = derived.rounds.get(round.id);
  return {
    id: round.id,
    number: round.number,
    openedAt: round.opened_at.toISOString(),
    gameDay: round.game_day,
    seasonCode: round.season_code,
    euroleagueRound: round.euroleague_round,
    source: round.source,
    status: round.status,
    stake: num(round.stake),
    totalOdds: num(round.total_odds),
    payerMemberId: round.payer_member_id,
    potentialWin: potential(round),
    actualWin: num(round.actual_win),
    actualWinProvisional: round.actual_win_provisional === 1,
    hits: round.hits,
    misses: round.misses,
    voids: round.voids,
    outcomeLabel: outcomeLabel(round, picks),
    blame: rd?.blame ?? null,
    cooldownMemberIds:
      rd?.cooldownMemberIds ??
      picks.filter((p) => p.kind === 'team' && p.cooldown_for_member_id !== null).map((p) => p.cooldown_for_member_id!),
    hasCorrections: round.has_corrections === 1,
    cooldownInconsistent: rd?.cooldownInconsistent ?? false,
  };
}

/** List rows (history, home). */
export async function buildRoundSummaries(deps: Deps, rounds: Round[], derived?: DerivedState): Promise<RoundSummaryDto[]> {
  const d = derived ?? (await deps.derived.get());
  const data = await loadRoundData(deps.db, rounds.map((r) => r.id), false);
  return rounds.map((r) => {
    const picks = data.picks.get(r.id) ?? [];
    return {
      ...summaryBase(r, picks, d),
      picks: picks.map((p) => ({
        slot: p.slot,
        kind: p.kind,
        memberId: p.member_id,
        cooldownForMemberId: p.cooldown_for_member_id,
        line: num(p.line),
        direction: p.direction,
        result: p.result,
        playerName: p.player_id !== null ? (data.players.get(p.player_id)?.full_name ?? null) : p.import_player_name,
      })),
    };
  });
}

/** Full round view incl. live data (REQ-28, REQ-13). */
export async function buildRoundDetail(deps: Deps, roundId: number, viewer: SessionMember | null): Promise<RoundDetailDto> {
  const round = await getRoundOr404(deps.db, roundId);
  const derived = await deps.derived.get();
  const data = await loadRoundData(deps.db, [round.id], true);
  const picks = data.picks.get(round.id) ?? [];
  const names = await memberNames(deps.db);
  const now = deps.now();

  // Live stats for the picks.
  const gameIds = [...new Set(picks.map((p) => p.game_id).filter((x): x is number => x !== null))];
  const stats =
    gameIds.length > 0
      ? await deps.db.selectFrom('player_game_stats').selectAll().where('game_id', 'in', gameIds).execute()
      : [];
  const statKey = (g: number, p: number) => `${g}:${p}`;
  const statsMap = new Map(stats.map((s) => [statKey(s.game_id, s.player_id), s]));

  const pickDtos: PickDto[] = picks.map((p) => {
    const game = p.game_id !== null ? data.games.get(p.game_id) ?? null : null;
    const player = p.player_id !== null ? data.players.get(p.player_id) ?? null : null;
    const line = num(p.line);
    let live: PickLiveDto | null = null;
    if (game && player && line !== null && p.direction !== null) {
      const s = statsMap.get(statKey(game.id, player.id));
      const ls = liveStatus({
        direction: p.direction,
        line,
        gameStatus: game.status,
        points: s?.points ?? null,
        secondsPlayed: s?.seconds_played ?? null,
        result: p.result,
      });
      live = {
        points: s?.points ?? null,
        secondsPlayed: s?.seconds_played ?? null,
        fouls: s?.fouls ?? null,
        status: ls.status,
        pointsNeeded: ls.pointsNeeded,
        updatedAt: iso(s?.updated_at),
      };
    }
    return {
      id: p.id,
      slot: p.slot,
      kind: p.kind,
      memberId: p.member_id,
      cooldownForMemberId: p.cooldown_for_member_id,
      player: player ? playerDto(player, data.clubs) : null,
      importPlayerName: p.import_player_name,
      game: game ? gameDto(game, data.clubs) : null,
      line,
      direction: p.direction,
      odds: num(p.odds),
      finalPoints: p.final_points,
      result: p.result,
      voidReason: p.void_reason,
      resolution: p.resolution,
      live,
    };
  });

  // Proposals.
  const proposals = await deps.db
    .selectFrom('proposals')
    .selectAll()
    .where('round_id', '=', round.id)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  const proposalDtos: ProposalDto[] = [];
  if (proposals.length > 0) {
    const votes = await deps.db
      .selectFrom('proposal_votes')
      .selectAll()
      .where('proposal_id', 'in', proposals.map((p) => p.id))
      .execute();
    const pPlayers = await deps.db
      .selectFrom('players')
      .selectAll()
      .where('id', 'in', [...new Set(proposals.map((p) => p.player_id))])
      .execute();
    const pPlayerMap = new Map(pPlayers.map((p) => [p.id, p]));
    const dayGames = await deps.db.selectFrom('games').selectAll().where('game_day', '=', round.game_day).execute();
    const clubs = await loadClubs(deps.db, [
      ...pPlayers.map((p) => p.club_code),
      ...dayGames.flatMap((g) => [g.home_club_code, g.away_club_code]),
    ]);
    for (const pr of proposals) {
      const pl = pPlayerMap.get(pr.player_id);
      if (!pl) continue;
      const g = pl.club_code
        ? dayGames.find((x) => x.home_club_code === pl.club_code || x.away_club_code === pl.club_code)
        : undefined;
      proposalDtos.push({
        id: pr.id,
        kind: pr.kind,
        proposedBy: pr.proposed_by,
        cooldownForMemberId: pr.cooldown_for_member_id,
        player: playerDto(pl, clubs),
        game: g ? gameDto(g, clubs) : null,
        line: Number(pr.line),
        direction: pr.direction,
        comment: pr.comment,
        status: pr.status,
        votes: votes.filter((v) => v.proposal_id === pr.id).map((v) => v.member_id).sort((a, b) => a - b),
        createdAt: pr.created_at.toISOString(),
      });
    }
  }

  // Ticket indicator while in progress (REQ-13.6).
  let ticketAlive: boolean | null = null;
  let passingCount: number | null = null;
  if (round.status === 'in_progress' || round.status === 'locked') {
    const statuses = pickDtos.map((p) => p.live?.status ?? null);
    ticketAlive = !statuses.some((s) => s === 'sure_miss' || s === 'final_miss');
    passingCount = statuses.filter((s) => s === 'passing' || s === 'sure_hit' || s === 'final_hit').length;
  }

  const pickGames = [...data.games.values()];
  const polled = pickGames.map((g) => g.last_polled_at?.getTime() ?? 0).filter((t) => t > 0);
  const firstGame = pickGames.length > 0 ? Math.min(...pickGames.map((g) => g.scheduled_at.getTime())) : null;
  const anyStarted = pickGames.some((g) => !gameNotStarted(g, now) && g.status !== 'postponed' && g.status !== 'cancelled');

  const audit = viewer
    ? (
        await deps.db
          .selectFrom('audit_log')
          .selectAll()
          .where('round_id', '=', round.id)
          .orderBy('at', 'desc')
          .orderBy('id', 'desc')
          .execute()
      ).map(auditDto)
    : [];

  const rd = derived.rounds.get(round.id);
  return {
    ...summaryBase(round, picks, derived),
    lockedAt: iso(round.locked_at),
    lockedBy: round.locked_by,
    resolvedAt: iso(round.resolved_at),
    picks: pickDtos,
    proposals: proposalDtos,
    fireChanges: rd?.fireChanges ?? [],
    ticketAlive,
    passingCount,
    liveUpdatedAt: polled.length > 0 ? new Date(Math.max(...polled)).toISOString() : null,
    canUnlock: round.status === 'locked' && !anyStarted,
    firstGameAt: firstGame !== null ? new Date(firstGame).toISOString() : null,
    missingForLock: round.status === 'open' ? missingForLock(round, picks, names) : [],
    audit,
  };
}

// ---------- current round / opening ----------

async function latestRound(db: DB): Promise<Round | undefined> {
  return db.selectFrom('rounds').selectAll().orderBy('number', 'desc').limit(1).executeTakeFirst();
}

export async function canOpenNewRound(deps: Deps): Promise<{ canOpenNew: boolean; reasonCannotOpen: string | null }> {
  const last = await latestRound(deps.db);
  if (last && !RESOLVED_STATUSES.includes(last.status)) {
    return { canOpenNew: false, reasonCannotOpen: `Prethodno kolo (${last.number}) još nije razrešeno.` };
  }
  const days = await listGameDays(deps);
  if (days.length === 0) {
    return { canOpenNew: false, reasonCannotOpen: 'Nema narednih dana sa nezapočetim utakmicama Evrolige.' };
  }
  return { canOpenNew: true, reasonCannotOpen: null };
}

export async function getCurrentRound(deps: Deps, viewer: SessionMember | null): Promise<CurrentRoundResponse> {
  const active = await deps.db
    .selectFrom('rounds')
    .select('id')
    .where('status', 'in', ACTIVE_STATUSES)
    .orderBy('number', 'desc')
    .limit(1)
    .executeTakeFirst();
  const target = active ?? (await latestRound(deps.db));
  const round = target ? await buildRoundDetail(deps, target.id, viewer) : null;
  return { round, ...(await canOpenNewRound(deps)) };
}

async function notStartedGamesOnDay(db: DB, day: string, now: Date): Promise<Game[]> {
  const games = await db.selectFrom('games').selectAll().where('game_day', '=', day).execute();
  return games.filter((g) => gameNotStarted(g, now));
}

function mostCommonRound(games: Game[]): number | null {
  const counts = new Map<number, number>();
  for (const g of games) if (g.euroleague_round !== null) counts.set(g.euroleague_round, (counts.get(g.euroleague_round) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [r, c] of counts) {
    if (c > bestCount) {
      best = r;
      bestCount = c;
    }
  }
  return best;
}

/** REQ-10.4: suggest the member who paid least recently (never paid first, then by sort order). */
export async function suggestPayer(db: DB): Promise<number | null> {
  const members = await db.selectFrom('members').select(['id']).orderBy('sort_order').execute();
  const last = await db
    .selectFrom('rounds')
    .select(['payer_member_id', (eb) => eb.fn.max('number').as('last')])
    .where('payer_member_id', 'is not', null)
    .groupBy('payer_member_id')
    .execute();
  const lastBy = new Map(last.map((r) => [r.payer_member_id, Number(r.last)]));
  let best: { id: number; last: number } | null = null;
  for (const m of members) {
    const l = lastBy.get(m.id) ?? 0;
    if (!best || l < best.last) best = { id: m.id, last: l };
  }
  return best?.id ?? null;
}

/** Serializes round creation (single Node process): a double click must not open two rounds. */
let createRoundQueue: Promise<unknown> = Promise.resolve();

/** REQ-06: opens a new round with 4 slots (personal or team for members on cooldown). */
export function createRound(deps: Deps, actor: SessionMember, gameDay: string): Promise<number> {
  const run = createRoundQueue.then(() => createRoundExclusive(deps, actor, gameDay));
  createRoundQueue = run.catch(() => undefined);
  return run.catch((e: unknown) => {
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY') {
      throw conflict('Kolo je upravo otvoreno; osvežite stranicu.');
    }
    throw e;
  });
}

async function createRoundExclusive(deps: Deps, actor: SessionMember, gameDay: string): Promise<number> {
  const now = deps.now();
  const last = await latestRound(deps.db);
  if (last && !RESOLVED_STATUSES.includes(last.status)) {
    throw conflict(`Novo kolo se ne može otvoriti dok prethodno kolo (${last.number}) nije razrešeno.`);
  }
  const open = await notStartedGamesOnDay(deps.db, gameDay, now);
  if (open.length === 0) throw unprocessable('Izabrani dan nema nijednu nezapočetu utakmicu Evrolige.');
  const allDay = await deps.db.selectFrom('games').selectAll().where('game_day', '=', gameDay).execute();
  const season = seasonForDate(gameDay);
  const derived = await deps.derived.get();
  const cooldown = new Set(derived.cooldownForNextRound(season));
  const members = await deps.db.selectFrom('members').select(['id']).orderBy('sort_order').execute();
  const payer = await suggestPayer(deps.db);

  const roundId = await deps.db.transaction().execute(async (trx) => {
    await trx
      .insertInto('seasons')
      .values({ code: season, name: seasonName(season), start_date: seasonStartDate(season) })
      .onDuplicateKeyUpdate({ code: season })
      .execute();
    const max = await trx
      .selectFrom('rounds')
      .select((eb) => eb.fn.max('number').as('max'))
      .executeTakeFirst();
    const number = Number(max?.max ?? 0) + 1;
    const res = await trx
      .insertInto('rounds')
      .values({
        number,
        opened_at: now,
        game_day: gameDay,
        season_code: season,
        euroleague_round: mostCommonRound(allDay),
        source: 'app',
        status: 'open',
        stake: null,
        total_odds: null,
        payer_member_id: payer,
        actual_win: null,
        actual_win_provisional: 0,
        actual_win_manual: 0,
        hits: 0,
        misses: 0,
        voids: 0,
        locked_at: null,
        locked_by: null,
        resolved_at: null,
        has_corrections: 0,
      })
      .executeTakeFirstOrThrow();
    const id = Number(res.insertId);
    await trx
      .insertInto('picks')
      .values(
        members.map((m, i) => ({
          round_id: id,
          slot: i + 1,
          kind: cooldown.has(m.id) ? ('team' as const) : ('personal' as const),
          member_id: cooldown.has(m.id) ? null : m.id,
          cooldown_for_member_id: cooldown.has(m.id) ? m.id : null,
        })),
      )
      .execute();
    return id;
  });
  void actor;
  deps.derived.invalidate();
  deps.bus.roundChanged(roundId);
  return roundId;
}

function requireOpen(round: Round): void {
  if (round.status !== 'open') {
    throw conflict('Kolo je zaključano; izmene su moguće samo kroz ispravku.');
  }
}

function validateStake(v: number | null): void {
  if (v === null) return;
  if (!(v > 0) || v > MAX_STAKE || !isMoney(v)) throw unprocessable('Uplata mora biti pozitivan iznos sa najviše 2 decimale.');
}

function validateOdds(v: number | null, label: string): void {
  if (v === null) return;
  if (!(v >= 1.01) || v > MAX_ODDS || !isMoney(v)) throw unprocessable(`${label} mora biti broj od najmanje 1,01 (najviše 2 decimale).`);
}

async function validatePayer(db: DB, v: number | null): Promise<void> {
  if (v === null) return;
  const m = await db.selectFrom('members').select('id').where('id', '=', v).executeTakeFirst();
  if (!m) throw unprocessable('Uplatilac mora biti jedan od četiri člana.');
}

/** PATCH /rounds/:id (open rounds only). */
export async function updateRound(deps: Deps, roundId: number, input: UpdateRoundRequest): Promise<void> {
  const round = await getRoundOr404(deps.db, roundId);
  requireOpen(round);
  const now = deps.now();
  const set: RoundUpdate = {};
  const pickUpdates: Array<{ id: number; set: PickUpdate }> = [];

  if (input.stake !== undefined) {
    validateStake(input.stake);
    set.stake = input.stake;
  }
  if (input.totalOdds !== undefined) {
    validateOdds(input.totalOdds, 'Ukupna kvota');
    set.total_odds = input.totalOdds;
  }
  if (input.payerMemberId !== undefined) {
    await validatePayer(deps.db, input.payerMemberId);
    set.payer_member_id = input.payerMemberId;
  }
  if (input.gameDay !== undefined && input.gameDay !== round.game_day) {
    const open = await notStartedGamesOnDay(deps.db, input.gameDay, now);
    if (open.length === 0) throw unprocessable('Izabrani dan nema nijednu nezapočetu utakmicu Evrolige.');
    const allDay = await deps.db.selectFrom('games').selectAll().where('game_day', '=', input.gameDay).execute();
    const picks = await deps.db.selectFrom('picks').selectAll().where('round_id', '=', round.id).orderBy('slot').execute();
    const playerIds = picks.map((p) => p.player_id).filter((x): x is number => x !== null);
    const players = playerIds.length
      ? await deps.db.selectFrom('players').selectAll().where('id', 'in', playerIds).execute()
      : [];
    const dropped: Array<{ slot: number; playerName: string }> = [];
    for (const p of picks) {
      if (p.player_id === null) continue;
      const pl = players.find((x) => x.id === p.player_id);
      const g = pl?.club_code ? open.find((x) => x.home_club_code === pl.club_code || x.away_club_code === pl.club_code) : undefined;
      if (g) pickUpdates.push({ id: p.id, set: { game_id: g.id } });
      else {
        dropped.push({ slot: p.slot, playerName: pl?.full_name ?? '?' });
        pickUpdates.push({ id: p.id, set: { player_id: null, game_id: null, line: null, direction: null, odds: null } });
      }
    }
    if (dropped.length > 0 && !input.confirmDropPicks) {
      throw conflict(
        `Sledeći tipovi nisu sa utakmica novog dana i biće obrisani: ${dropped.map((d) => d.playerName).join(', ')}. Potvrdite izmenu.`,
        { dropPicks: dropped },
      );
    }
    const season = seasonForDate(input.gameDay);
    set.game_day = input.gameDay;
    set.season_code = season;
    set.euroleague_round = mostCommonRound(allDay);
    await deps.db
      .insertInto('seasons')
      .values({ code: season, name: seasonName(season), start_date: seasonStartDate(season) })
      .onDuplicateKeyUpdate({ code: season })
      .execute();
  }

  await deps.db.transaction().execute(async (trx) => {
    for (const u of pickUpdates) await trx.updateTable('picks').set(u.set).where('id', '=', u.id).execute();
    if (Object.keys(set).length > 0) await trx.updateTable('rounds').set(set).where('id', '=', round.id).execute();
  });
  if (set.season_code !== undefined) deps.derived.invalidate();
  deps.bus.roundChanged(round.id);
}

// ---------- picks ----------

export interface Selection {
  playerId: number;
  line: number;
  direction: Direction;
}

/** REQ-08 / REQ-07 validation shared by set pick, proposals and accepting a proposal. */
export async function validateSelection(
  db: DB,
  round: Round,
  sel: Selection,
  now: Date,
  excludeSlot: number | null,
  /**
   * When set (admin accepting a proposal), the game must not have started at this moment
   * instead of now: a proposal given in time stays acceptable after tip-off, so a round
   * whose ticket was really played does not get stuck unlockable.
   */
  submittedAt?: Date,
): Promise<{ player: Player; game: Game }> {
  if (!isValidLine(sel.line)) throw unprocessable(LINE_MESSAGE);
  if (sel.direction !== 'over' && sel.direction !== 'under') throw unprocessable('Izaberite smer: više ili manje.');
  const player = await db.selectFrom('players').selectAll().where('id', '=', sel.playerId).executeTakeFirst();
  if (!player) throw notFound('Igrač nije pronađen.');
  if (player.is_active !== 1) throw unprocessable('Igrač nije aktivan.');
  if (!player.club_code) throw unprocessable('Igrač nema klub.');
  const game = await db
    .selectFrom('games')
    .selectAll()
    .where('game_day', '=', round.game_day)
    .where((eb) => eb.or([eb('home_club_code', '=', player.club_code!), eb('away_club_code', '=', player.club_code!)]))
    .orderBy('scheduled_at')
    .executeTakeFirst();
  if (!game) throw unprocessable(`Klub igrača ne igra ${shortDay(round.game_day)}`);
  if (game.status === 'postponed' || game.status === 'cancelled') throw unprocessable('Utakmica igrača je odložena ili otkazana.');
  if (submittedAt) {
    if (game.scheduled_at.getTime() <= submittedAt.getTime()) throw unprocessable('Predlog je dat posle početka utakmice.');
  } else if (!gameNotStarted(game, now)) throw unprocessable('Utakmica igrača je već počela.');
  let dup = db
    .selectFrom('picks')
    .select('slot')
    .where('round_id', '=', round.id)
    .where('player_id', '=', player.id);
  if (excludeSlot !== null) dup = dup.where('slot', '!=', excludeSlot);
  if (await dup.executeTakeFirst()) throw conflict('Igrač je već izabran u ovom kolu.');
  return { player, game };
}

async function getPickOr404(db: DB, roundId: number, slot: number): Promise<Pick> {
  const p = await db.selectFrom('picks').selectAll().where('round_id', '=', roundId).where('slot', '=', slot).executeTakeFirst();
  if (!p) throw notFound('Tip nije pronađen.');
  return p;
}

/** Writes a pick in an open round (no publish). */
export async function writePick(
  db: DB,
  round: Round,
  slot: number,
  input: SetPickRequest,
  now: Date,
  submittedAt?: Date,
): Promise<{ gameStarted: boolean }> {
  const pick = await getPickOr404(db, round.id, slot);
  const odds = input.odds ?? null;
  validateOdds(odds, 'Kvota tipa');
  const { game } = await validateSelection(db, round, input, now, slot, submittedAt);
  await db
    .updateTable('picks')
    .set({ player_id: input.playerId, game_id: game.id, line: input.line, direction: input.direction, odds })
    .where('id', '=', pick.id)
    .execute();
  return { gameStarted: !gameNotStarted(game, now) };
}

export async function setPick(deps: Deps, roundId: number, slot: number, input: SetPickRequest): Promise<void> {
  const round = await getRoundOr404(deps.db, roundId);
  requireOpen(round);
  try {
    await writePick(deps.db, round, slot, input, deps.now());
  } catch (e) {
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY') throw conflict('Igrač je već izabran u ovom kolu.');
    throw e;
  }
  deps.bus.roundChanged(round.id);
}

export async function clearPick(deps: Deps, roundId: number, slot: number): Promise<void> {
  const round = await getRoundOr404(deps.db, roundId);
  requireOpen(round);
  const pick = await getPickOr404(deps.db, round.id, slot);
  await deps.db
    .updateTable('picks')
    .set({ player_id: null, game_id: null, line: null, direction: null, odds: null })
    .where('id', '=', pick.id)
    .execute();
  deps.bus.roundChanged(round.id);
}

// ---------- lock / unlock ----------

/**
 * Locks a complete open round (REQ-11). `actorMemberId` null = system (auto-lock by the worker).
 * Throws 409 when not open, 422 when incomplete.
 */
export async function lockRound(deps: Deps, roundId: number, actorMemberId: number | null): Promise<void> {
  const round = await getRoundOr404(deps.db, roundId);
  if (round.status !== 'open') throw conflict('Kolo nije otvoreno.');
  const picks = await deps.db.selectFrom('picks').selectAll().where('round_id', '=', round.id).orderBy('slot').execute();
  const missing = missingForLock(round, picks, await memberNames(deps.db));
  if (missing.length > 0 || !picks.every(pickComplete)) {
    throw unprocessable(`Kolo nije kompletno. Nedostaje: ${missing.join(', ')}.`, { missing });
  }
  const now = deps.now();
  const locked = await deps.db.transaction().execute(async (trx) => {
    const res = await trx
      .updateTable('rounds')
      .set({ status: 'locked', locked_at: now, locked_by: actorMemberId })
      .where('id', '=', round.id)
      .where('status', '=', 'open')
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) return false;
    await writeAudit(trx, {
      at: now,
      actorMemberId,
      action: actorMemberId === null ? 'auto_lock' : 'lock',
      roundId: round.id,
      entity: 'round',
      entityId: round.id,
      field: 'status',
      oldValue: 'open',
      newValue: 'locked',
    });
    return true;
  });
  if (!locked) throw conflict('Kolo nije otvoreno.');
  deps.derived.invalidate();
  deps.bus.roundChanged(round.id);
}

async function anyPickGameStarted(db: DB, roundId: number, now: Date): Promise<boolean> {
  const games = await db
    .selectFrom('picks')
    .innerJoin('games', 'games.id', 'picks.game_id')
    .select(['games.status', 'games.scheduled_at'])
    .where('picks.round_id', '=', roundId)
    .execute();
  return games.some((g) => g.status !== 'postponed' && g.status !== 'cancelled' && !gameNotStarted(g, now));
}

function requireReason(reason: string | undefined): string {
  const r = (reason ?? '').trim();
  if (!r) throw unprocessable('Razlog je obavezan.');
  return r;
}

/** REQ-12.1 */
export async function unlockRound(deps: Deps, actor: SessionMember, roundId: number, reasonIn: string): Promise<void> {
  const reason = requireReason(reasonIn);
  const round = await getRoundOr404(deps.db, roundId);
  const now = deps.now();
  if (round.status !== 'locked' || (await anyPickGameStarted(deps.db, round.id, now))) {
    throw conflict('Kolo se ne može otključati jer je utakmica počela ili kolo nije zaključano; moguća je samo ciljana ispravka.');
  }
  await deps.db.transaction().execute(async (trx) => {
    // Guarded by status so a concurrent transition to in_progress (worker) is not overwritten.
    const res = await trx
      .updateTable('rounds')
      .set({ status: 'open', locked_at: null, locked_by: null })
      .where('id', '=', round.id)
      .where('status', '=', 'locked')
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) !== 1) {
      throw conflict('Kolo se ne može otključati jer je utakmica počela ili kolo nije zaključano; moguća je samo ciljana ispravka.');
    }
    await writeAudit(trx, {
      at: now,
      actorMemberId: actor.id,
      action: 'unlock',
      roundId: round.id,
      entity: 'round',
      entityId: round.id,
      field: 'status',
      oldValue: 'locked',
      newValue: 'open',
      reason,
    });
  });
  deps.derived.invalidate();
  deps.bus.roundChanged(round.id);
}

// ---------- corrections ----------

type NewResult = { result: PickResult; finalPoints: number | null; voidReason: VoidReason | null };

interface CorrectionPlan {
  entity: 'pick' | 'round';
  entityId: number;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  pick: Pick | null;
  pickUpdate: PickUpdate | null;
  roundUpdate: RoundUpdate | null;
  /** undefined = result unchanged; 'reset' = result cleared. */
  newResult: NewResult | 'reset' | undefined;
  /** Human-readable pick result / ticket change lines. */
  extra: string[];
  newPotentialWin?: number | null;
}

async function planCorrection(deps: Deps, round: Round, req: CorrectionRequest): Promise<CorrectionPlan> {
  const db = deps.db;
  const pickFields = ['player', 'line', 'direction', 'odds'];
  if (pickFields.includes(req.field)) {
    if (req.slot === undefined) throw unprocessable('Za ispravku tipa potrebno je navesti mesto (slot).');
    const pick = await getPickOr404(db, round.id, req.slot);
    let pickUpdate: PickUpdate;
    let oldValue: unknown;
    let newValue: unknown;
    const merged = {
      player_id: pick.player_id,
      game_id: pick.game_id,
      line: num(pick.line),
      direction: pick.direction,
    };
    switch (req.field) {
      case 'player': {
        const playerId = Number(req.value);
        if (!Number.isInteger(playerId) || playerId <= 0) throw unprocessable('Neispravan igrač.');
        if (playerId === pick.player_id) throw unprocessable('Nova vrednost je ista kao postojeća.');
        const player = await db.selectFrom('players').selectAll().where('id', '=', playerId).executeTakeFirst();
        if (!player) throw notFound('Igrač nije pronađen.');
        const dup = await db
          .selectFrom('picks')
          .select('slot')
          .where('round_id', '=', round.id)
          .where('player_id', '=', playerId)
          .where('slot', '!=', pick.slot)
          .executeTakeFirst();
        if (dup) throw conflict('Igrač je već izabran u ovom kolu.');
        const game = player.club_code
          ? await db
              .selectFrom('games')
              .selectAll()
              .where('game_day', '=', round.game_day)
              .where((eb) => eb.or([eb('home_club_code', '=', player.club_code!), eb('away_club_code', '=', player.club_code!)]))
              .executeTakeFirst()
          : undefined;
        if (!game && round.source !== 'import') throw unprocessable(`Klub igrača ne igra ${shortDay(round.game_day)}`);
        const oldPlayer = pick.player_id
          ? await db.selectFrom('players').select(['full_name']).where('id', '=', pick.player_id).executeTakeFirst()
          : undefined;
        oldValue = { playerId: pick.player_id, name: oldPlayer?.full_name ?? pick.import_player_name };
        newValue = { playerId, name: player.full_name };
        pickUpdate = { player_id: playerId, game_id: game?.id ?? null, import_player_name: null };
        merged.player_id = playerId;
        merged.game_id = game?.id ?? null;
        break;
      }
      case 'line': {
        const line = Number(req.value);
        if (!isValidLine(line)) throw unprocessable(LINE_MESSAGE);
        oldValue = num(pick.line);
        newValue = line;
        pickUpdate = { line };
        merged.line = line;
        break;
      }
      case 'direction': {
        if (req.value !== 'over' && req.value !== 'under') throw unprocessable('Smer mora biti "over" ili "under".');
        oldValue = pick.direction;
        newValue = req.value;
        pickUpdate = { direction: req.value };
        merged.direction = req.value;
        break;
      }
      default: {
        const odds = req.value === null || req.value === '' ? null : Number(req.value);
        validateOdds(odds, 'Kvota tipa');
        oldValue = num(pick.odds);
        newValue = odds;
        pickUpdate = { odds };
      }
    }

    let newResult: NewResult | 'reset' | undefined;
    const extra: string[] = [];
    if (pick.result !== null && req.field !== 'odds') {
      if (pick.void_reason === 'game_not_played' && req.field !== 'player') {
        newResult = undefined;
      } else if (merged.player_id === null || merged.line === null || merged.direction === null) {
        newResult = 'reset';
      } else {
        const stat =
          merged.game_id !== null
            ? await db
                .selectFrom('player_game_stats')
                .selectAll()
                .where('game_id', '=', merged.game_id)
                .where('player_id', '=', merged.player_id)
                .where('is_final', '=', 1)
                .executeTakeFirst()
            : undefined;
        if (stat) {
          const r = resolvePick({ direction: merged.direction, line: merged.line, points: stat.points, secondsPlayed: stat.seconds_played });
          newResult = { result: r.result, voidReason: r.voidReason, finalPoints: stat.points };
        } else if (req.field !== 'player' && pick.result !== 'void' && pick.final_points !== null) {
          const r = resolvePick({ direction: merged.direction, line: merged.line, points: pick.final_points, secondsPlayed: 1 });
          newResult = { result: r.result, voidReason: null, finalPoints: pick.final_points };
        } else if (req.field !== 'player' && pick.result === 'void') {
          newResult = undefined; // DNP stays DNP regardless of line/direction
        } else if (round.source === 'import') {
          // Imported rounds have no box scores; the file's outcome stays the source of truth.
          newResult = undefined;
          extra.push('Uvezeno kolo: ishod tipa ostaje kako je uvezen; po potrebi ga razrešite ručno.');
        } else {
          newResult = 'reset';
        }
      }
    }
    return {
      entity: 'pick',
      entityId: pick.id,
      field: req.field,
      oldValue,
      newValue,
      pick,
      pickUpdate,
      roundUpdate: null,
      newResult,
      extra,
    };
  }

  const roundUpdate: RoundUpdate = {};
  let oldValue: unknown;
  let newValue: unknown;
  let newPotentialWin: number | null | undefined;
  switch (req.field) {
    case 'stake': {
      const v = Number(req.value);
      if (req.value === null || !Number.isFinite(v)) throw unprocessable('Uplata mora biti pozitivan iznos sa najviše 2 decimale.');
      validateStake(v);
      oldValue = num(round.stake);
      newValue = v;
      roundUpdate.stake = v;
      newPotentialWin = potential({ stake: String(v), total_odds: round.total_odds });
      break;
    }
    case 'totalOdds': {
      const v = Number(req.value);
      if (req.value === null || !Number.isFinite(v)) throw unprocessable('Ukupna kvota mora biti broj od najmanje 1,01.');
      validateOdds(v, 'Ukupna kvota');
      oldValue = num(round.total_odds);
      newValue = v;
      roundUpdate.total_odds = v;
      newPotentialWin = potential({ stake: round.stake, total_odds: String(v) });
      break;
    }
    case 'payer': {
      const v = Number(req.value);
      if (req.value === null || !Number.isInteger(v)) throw unprocessable('Uplatilac mora biti jedan od četiri člana.');
      await validatePayer(db, v);
      oldValue = round.payer_member_id;
      newValue = v;
      roundUpdate.payer_member_id = v;
      break;
    }
    default:
      throw unprocessable('Nepoznato polje za ispravku.');
  }
  if (oldValue === newValue) throw unprocessable('Nova vrednost je ista kao postojeća.');
  return {
    entity: 'round',
    entityId: round.id,
    field: req.field,
    oldValue,
    newValue,
    pick: null,
    pickUpdate: null,
    roundUpdate,
    newResult: undefined,
    extra: [],
    newPotentialWin,
  };
}

const moneyFmt = new Intl.NumberFormat('sr-Latn-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function blameLabel(b: number | 'team' | null, names: Map<number, string>): string {
  if (b === null) return 'nema';
  if (b === 'team') return 'Ekipa';
  return names.get(b) ?? String(b);
}

/** Human-readable differences between two derived states (REQ-12.3). */
export function describeDerivedDiff(
  before: DerivedState,
  after: DerivedState,
  names: Map<number, string>,
  nextSeason: string | null,
): string[] {
  const out: string[] = [];
  const beforeCd = new Set(nextSeason ? before.cooldownForNextRound(nextSeason) : []);
  const afterCd = new Set(nextSeason ? after.cooldownForNextRound(nextSeason) : []);
  for (const [id, name] of [...names.entries()].sort((a, b) => a[0] - b[0])) {
    const b = before.members[id];
    const a = after.members[id];
    const parts: string[] = [];
    const bm = b?.missStreak ?? 0;
    const am = a?.missStreak ?? 0;
    const bh = b?.hitStreak ?? 0;
    const ah = a?.hitStreak ?? 0;
    if (bm !== am) parts.push(`niz promašaja ${bm} → ${am}`);
    if (bh !== ah) parts.push(`niz pogodaka ${bh} → ${ah}`);
    if (!b?.hasFire && a?.hasFire) parts.push('dobija vatricu');
    if (b?.hasFire && !a?.hasFire) parts.push('gubi vatricu');
    if (!beforeCd.has(id) && afterCd.has(id)) parts.push('ulazi na hlađenje');
    if (beforeCd.has(id) && !afterCd.has(id)) parts.push('više ne ide na hlađenje');
    if (parts.length > 0) out.push(`${name}: ${parts.join(', ')}`);
  }
  const rounds = [...after.rounds.values()].sort((x, y) => x.number - y.number);
  for (const ar of rounds) {
    const br = before.rounds.get(ar.roundId);
    if (!br) continue;
    if (br.blame !== ar.blame) {
      out.push(`Blejm (kolo ${ar.number}): ${blameLabel(br.blame, names)} → ${blameLabel(ar.blame, names)}`);
    }
    if (!br.cooldownInconsistent && ar.cooldownInconsistent) out.push(`Kolo ${ar.number}: nekonzistentno hlađenje`);
    if (br.cooldownInconsistent && !ar.cooldownInconsistent) out.push(`Kolo ${ar.number}: hlađenje ponovo usklađeno`);
  }
  return out;
}

function predictStatus(status: RoundStatus, results: Array<PickResult | null>): RoundStatus {
  const o = ticketOutcome(results);
  if (status === 'open') return status;
  if (o.status === 'lost') return 'lost';
  if (o.resolved && (o.status === 'won' || o.status === 'void')) return o.status;
  return RESOLVED_STATUSES.includes(status) ? 'in_progress' : status;
}

/** REQ-12.2–12.6: targeted correction of a locked / in-progress / resolved round. */
export async function correctRound(
  deps: Deps,
  actor: SessionMember,
  roundId: number,
  req: CorrectionRequest,
): Promise<{ applied: boolean; consequences: string[] }> {
  const reason = requireReason(req.reason);
  const round = await getRoundOr404(deps.db, roundId);
  if (round.status === 'open') throw conflict('Kolo je otvoreno; izmene se unose direktno, bez ispravke.');
  const plan = await planCorrection(deps, round, req);
  const names = await memberNames(deps.db);

  // Simulate consequences on the derived state.
  const inputs = await loadDerivedInputs(deps.db);
  const before = computeDerived(inputs);
  const consequences: string[] = [];
  const picks = await deps.db.selectFrom('picks').selectAll().where('round_id', '=', round.id).orderBy('slot').execute();
  if (plan.newResult !== undefined && plan.pick) {
    const nr = plan.newResult === 'reset' ? null : plan.newResult.result;
    const results = picks.map((p) => (p.id === plan.pick!.id ? nr : p.result));
    const newStatus = predictStatus(round.status, results);
    const modified: DerivedRoundInput[] = inputs.map((r) =>
      r.roundId !== round.id
        ? r
        : {
            ...r,
            status: newStatus,
            picks: r.picks.map((p) => (p.slot === plan.pick!.slot ? { ...p, result: nr } : p)),
          },
    );
    const after = computeDerived(modified);
    const label = slotLabel(plan.pick, names);
    const oldR = plan.pick.result ? RESULT_LABEL[plan.pick.result] : 'nerazrešen';
    const newR = nr ? RESULT_LABEL[nr] : 'nerazrešen';
    if (oldR !== newR) consequences.push(`${label}: ${oldR} → ${newR}`);
    if (newStatus !== round.status) consequences.push(`Tiket: ${STATUS_LABEL[round.status]} → ${STATUS_LABEL[newStatus]}`);
    const last = inputs[inputs.length - 1];
    consequences.push(...describeDerivedDiff(before, after, names, last?.seasonCode ?? null));
  }
  if (plan.newPotentialWin !== undefined) {
    const oldPw = potential(round);
    if (oldPw !== plan.newPotentialWin) {
      const f = (v: number | null) => (v === null ? '—' : `${moneyFmt.format(v)} RSD`);
      consequences.push(`Potencijalni dobitak: ${f(oldPw)} → ${f(plan.newPotentialWin)}`);
    }
  }
  if (req.field === 'direction' && plan.pick && typeof plan.newValue === 'string') {
    consequences.unshift(`Smer: ${DIRECTION_LABEL[plan.pick.direction ?? 'over']} → ${DIRECTION_LABEL[plan.newValue as Direction]}`);
  }
  if (consequences.length === 0) consequences.push('Nema promena u statistici.');
  if (req.dryRun) return { applied: false, consequences };

  const now = deps.now();
  await deps.db.transaction().execute(async (trx) => {
    if (plan.pickUpdate && plan.pick) {
      await trx.updateTable('picks').set(plan.pickUpdate).where('id', '=', plan.pick.id).execute();
    }
    await trx
      .updateTable('rounds')
      .set({ ...(plan.roundUpdate ?? {}), has_corrections: 1 })
      .where('id', '=', round.id)
      .execute();
    await writeAudit(trx, {
      at: now,
      actorMemberId: actor.id,
      action: 'correct',
      roundId: round.id,
      entity: plan.entity,
      entityId: plan.entityId,
      field: plan.pick ? `slot${plan.pick.slot}.${plan.field}` : plan.field,
      oldValue: plan.oldValue,
      newValue: plan.newValue,
      reason,
    });
  });
  if (plan.pick && plan.newResult !== undefined) {
    if (plan.newResult === 'reset') {
      await applyPickResult(deps, plan.pick.id, { result: null, finalPoints: null, voidReason: null, resolution: null });
    } else {
      await applyPickResult(deps, plan.pick.id, { ...plan.newResult, resolution: 'manual' });
    }
  } else {
    // Stake / odds changes may change the actual win of a resolved round.
    await refreshRoundOutcome(deps, round.id);
  }
  deps.derived.invalidate();
  deps.bus.roundChanged(round.id);
  return { applied: true, consequences };
}

// ---------- manual resolution, actual win, delete ----------

/** REQ-16 */
export async function manualResolve(
  deps: Deps,
  actor: SessionMember,
  roundId: number,
  slot: number,
  req: ManualResolveRequest,
): Promise<void> {
  const reason = requireReason(req.reason);
  const round = await getRoundOr404(deps.db, roundId);
  if (round.status === 'open') throw conflict('Tip se ručno razrešava tek kada je kolo zaključeno.');
  const pick = await getPickOr404(deps.db, round.id, slot);
  let next: NewResult;
  if (req.mode === 'points') {
    if (req.points === undefined || !Number.isInteger(req.points) || req.points < 0) {
      throw unprocessable('Unesite konačne poene (ceo broj ≥ 0).');
    }
    const line = num(pick.line);
    if (pick.player_id === null || line === null || pick.direction === null) {
      throw unprocessable('Tip nema igrača, granicu ili smer.');
    }
    const r = resolvePick({ direction: pick.direction, line, points: req.points, secondsPlayed: 1 });
    next = { result: r.result, voidReason: null, finalPoints: req.points };
  } else if (req.mode === 'dnp') {
    if (pick.player_id === null) throw unprocessable('Tip nema igrača.');
    next = { result: 'void', voidReason: 'dnp', finalPoints: null };
  } else {
    next = { result: 'void', voidReason: 'game_not_played', finalPoints: null };
  }
  await applyPickResult(deps, pick.id, { ...next, resolution: 'manual' });
  await writeAudit(deps.db, {
    at: deps.now(),
    actorMemberId: actor.id,
    action: 'manual_resolve',
    roundId: round.id,
    entity: 'pick',
    entityId: pick.id,
    field: `slot${pick.slot}.result`,
    oldValue: { result: pick.result, finalPoints: pick.final_points, voidReason: pick.void_reason, resolution: pick.resolution },
    newValue: { result: next.result, finalPoints: next.finalPoints, voidReason: next.voidReason, resolution: 'manual' },
    reason,
  });
  deps.derived.invalidate();
  deps.bus.roundChanged(round.id);
}

/** REQ-15.8 */
export async function setActualWin(
  deps: Deps,
  actor: SessionMember,
  roundId: number,
  amount: number,
  reasonIn: string,
): Promise<void> {
  const reason = requireReason(reasonIn);
  const round = await getRoundOr404(deps.db, roundId);
  if (!RESOLVED_STATUSES.includes(round.status)) throw conflict('Stvarni dobitak se unosi samo za razrešeno kolo.');
  if (!(amount >= 0) || amount > MAX_AMOUNT || !isMoney(amount)) {
    throw unprocessable('Stvarni dobitak mora biti iznos ≥ 0 sa najviše 2 decimale.');
  }
  await deps.db.transaction().execute(async (trx) => {
    await trx
      .updateTable('rounds')
      .set({ actual_win: round2(amount), actual_win_manual: 1, actual_win_provisional: 0 })
      .where('id', '=', round.id)
      .execute();
    await writeAudit(trx, {
      at: deps.now(),
      actorMemberId: actor.id,
      action: 'actual_win_override',
      roundId: round.id,
      entity: 'round',
      entityId: round.id,
      field: 'actual_win',
      oldValue: num(round.actual_win),
      newValue: round2(amount),
      reason,
    });
  });
  deps.derived.invalidate();
  deps.bus.roundChanged(round.id);
}

/** REQ-30: only an open round that was never locked; confirmed by typing its number. */
export async function deleteRound(deps: Deps, actor: SessionMember, roundId: number, confirmNumber: number): Promise<void> {
  const round = await getRoundOr404(deps.db, roundId);
  const everLocked = await deps.db
    .selectFrom('audit_log')
    .select('id')
    .where('round_id', '=', round.id)
    .where('action', 'in', ['lock', 'auto_lock'])
    .executeTakeFirst();
  if (round.status !== 'open' || round.locked_at !== null || everLocked) {
    throw conflict('Može se obrisati samo otvoreno kolo koje nikada nije bilo zaključano.');
  }
  if (confirmNumber !== round.number) throw unprocessable('Uneti broj se ne poklapa sa brojem kola.');
  await deps.db.transaction().execute(async (trx) => {
    await trx.deleteFrom('rounds').where('id', '=', round.id).execute();
    await writeAudit(trx, {
      at: deps.now(),
      actorMemberId: actor.id,
      action: 'round_delete',
      roundId: round.id,
      entity: 'round',
      entityId: round.id,
      oldValue: { number: round.number, gameDay: round.game_day },
    });
  });
  deps.derived.invalidate();
  deps.bus.roundChanged(round.id);
}
