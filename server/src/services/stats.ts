import type {
  BlameRowDto,
  Direction,
  MemberStatsDto,
  MemberStatsResponse,
  OutcomeBucket,
  OverviewStatsDto,
  PickResult,
  SeasonsResponse,
  StatsQuery,
  TeamStatsDto,
} from '../api-types.js';
import type { Deps } from '../deps.js';
import type { DerivedState, RoundDerived } from '../domain/derived-types.js';
import { MEMBER_IDS, isResolvedStatus } from '../domain/derived.js';
import { round1, round2, toNum } from '../domain/money.js';
import { seasonForDate, seasonName, todayInBelgrade } from '../domain/season.js';
import { notFound } from '../http/errors.js';

type StatsDeps = Pick<Deps, 'db' | 'derived' | 'now'>;

interface StatPick {
  slot: number;
  kind: 'personal' | 'team';
  memberId: number | null;
  cooldownForMemberId: number | null;
  playerId: number | null;
  playerName: string | null;
  line: number | null;
  direction: Direction | null;
  result: PickResult | null;
}

interface StatRound {
  id: number;
  number: number;
  gameDay: string;
  seasonCode: string;
  status: 'won' | 'lost' | 'void';
  stake: number;
  totalOdds: number | null;
  payerMemberId: number | null;
  /** Amount won (void round = stake). */
  won: number;
  provisional: boolean;
  picks: StatPick[];
}

function currentSeason(deps: StatsDeps): string {
  return seasonForDate(todayInBelgrade(deps.now()));
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? round1((part / whole) * 100) : null;
}

/** Resolved rounds (won/lost/void) matching the query, ordered by number ascending. */
async function loadRounds(deps: StatsDeps, q: StatsQuery): Promise<StatRound[]> {
  let query = deps.db
    .selectFrom('rounds')
    .select([
      'id', 'number', 'game_day', 'season_code', 'status', 'stake', 'total_odds',
      'payer_member_id', 'actual_win', 'actual_win_provisional',
    ])
    .where('status', 'in', ['won', 'lost', 'void']);
  const season = q.season ?? currentSeason(deps);
  if (season !== 'all') query = query.where('season_code', '=', season);
  if (q.from) query = query.where('game_day', '>=', q.from);
  if (q.to) query = query.where('game_day', '<=', q.to);
  const rows = await query.orderBy('number').execute();
  if (rows.length === 0) return [];

  const picks = await deps.db
    .selectFrom('picks')
    .leftJoin('players', 'players.id', 'picks.player_id')
    .select([
      'picks.round_id', 'picks.slot', 'picks.kind', 'picks.member_id', 'picks.cooldown_for_member_id',
      'picks.player_id', 'picks.import_player_name', 'picks.line', 'picks.direction', 'picks.result',
      'players.full_name',
    ])
    .where('picks.round_id', 'in', rows.map((r) => r.id))
    .orderBy('picks.round_id')
    .orderBy('picks.slot')
    .execute();
  const byRound = new Map<number, StatPick[]>();
  for (const p of picks) {
    const list = byRound.get(p.round_id) ?? [];
    list.push({
      slot: p.slot,
      kind: p.kind,
      memberId: p.member_id,
      cooldownForMemberId: p.cooldown_for_member_id,
      playerId: p.player_id,
      playerName: p.full_name ?? p.import_player_name,
      line: toNum(p.line),
      direction: p.direction,
      result: p.result,
    });
    byRound.set(p.round_id, list);
  }

  return rows.map((r) => {
    const status = r.status as StatRound['status'];
    const stake = toNum(r.stake) ?? 0;
    const totalOdds = toNum(r.total_odds);
    let won = toNum(r.actual_win);
    if (won === null) {
      if (status === 'void') won = stake;
      else if (status === 'won') won = totalOdds !== null ? round2(stake * totalOdds) : 0;
      else won = 0;
    }
    return {
      id: r.id,
      number: r.number,
      gameDay: r.game_day,
      seasonCode: r.season_code,
      status,
      stake,
      totalOdds,
      payerMemberId: r.payer_member_id,
      won,
      provisional: Boolean(r.actual_win_provisional),
      picks: byRound.get(r.id) ?? [],
    };
  });
}

type BucketKey = OutcomeBucket['key'];
const BUCKET_KEYS: BucketKey[] = ['4/4', '3/4', '2/4', '1/4', '0/4', 'with_void'];

function bucketOf(r: StatRound): BucketKey {
  if (r.status === 'void' || r.picks.some((p) => p.result === 'void')) return 'with_void';
  const hits = Math.min(4, r.picks.filter((p) => p.result === 'hit').length);
  return `${hits}/4` as BucketKey;
}

/** Percentages at 1 decimal that sum to exactly 100 (largest remainder). */
function distribute(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const raw = counts.map((c) => (c * 1000) / total); // tenths of a percent
  const floors = raw.map(Math.floor);
  let rest = 1000 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - floors[i]! })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (rest <= 0) break;
    floors[o.i]! += 1;
    rest--;
  }
  return floors.map((f) => f / 10);
}

function teamStats(rounds: StatRound[], derived: DerivedState): TeamStatsDto {
  let picks = 0;
  let hits = 0;
  let misses = 0;
  let voids = 0;
  let blames = 0;
  for (const r of rounds) {
    for (const p of r.picks) {
      if (p.kind !== 'team') continue;
      picks++;
      if (p.result === 'hit') hits++;
      else if (p.result === 'miss') misses++;
      else if (p.result === 'void') voids++;
    }
    if (derived.rounds.get(r.id)?.blame === 'team') blames++;
  }
  return { picks, hits, misses, voids, hitPercent: pct(hits, hits + misses), blames };
}

export async function listSeasons(deps: StatsDeps): Promise<SeasonsResponse> {
  const current = currentSeason(deps);
  const [fromRounds, fromTable] = await Promise.all([
    deps.db.selectFrom('rounds').select('season_code').distinct().execute(),
    deps.db.selectFrom('seasons').select(['code', 'name']).execute(),
  ]);
  const names = new Map<string, string>();
  for (const s of fromTable) names.set(s.code, s.name);
  const codes = new Set<string>([current, ...fromTable.map((s) => s.code), ...fromRounds.map((r) => r.season_code)]);
  const seasons = [...codes]
    .sort((a, b) => b.localeCompare(a))
    .map((code) => ({ code, name: names.get(code) ?? seasonName(code) }));
  return { seasons, current };
}

export async function getOverview(deps: StatsDeps, q: StatsQuery): Promise<OverviewStatsDto> {
  const [rounds, derived] = await Promise.all([loadRounds(deps, q), deps.derived.get()]);

  let totalStaked = 0;
  let totalWon = 0;
  let wonRounds = 0;
  let biggestWin: OverviewStatsDto['biggestWin'] = null;
  let run = 0;
  let longestLosingRun = 0;
  let cumulative = 0;
  const balanceSeries: OverviewStatsDto['balanceSeries'] = [];
  const counts = new Map<BucketKey, number>(BUCKET_KEYS.map((k) => [k, 0]));

  for (const r of rounds) {
    totalStaked += r.stake;
    totalWon += r.won;
    if (r.status === 'won') {
      wonRounds++;
      if (r.won > 0 && (biggestWin === null || r.won > biggestWin.amount)) {
        biggestWin = { roundId: r.id, number: r.number, amount: round2(r.won) };
      }
    }
    if (r.status === 'lost') {
      run++;
      longestLosingRun = Math.max(longestLosingRun, run);
    } else {
      run = 0;
    }
    cumulative += r.won - r.stake;
    balanceSeries.push({ roundId: r.id, number: r.number, gameDay: r.gameDay, balance: round2(cumulative) });
    const key = bucketOf(r);
    counts.set(key, counts.get(key)! + 1);
  }

  const countList = BUCKET_KEYS.map((k) => counts.get(k)!);
  const percents = distribute(countList);
  const balance = round2(totalWon - totalStaked);

  return {
    totalStaked: round2(totalStaked),
    totalWon: round2(totalWon),
    balance,
    roiPercent: totalStaked > 0 ? round1((balance / totalStaked) * 100) : null,
    rounds: rounds.length,
    wonRounds,
    wonPercent: pct(wonRounds, rounds.length),
    distribution: BUCKET_KEYS.map((key, i) => ({ key, count: countList[i]!, percent: percents[i]! })),
    biggestWin,
    longestLosingRun,
    balanceSeries,
    team: teamStats(rounds, derived),
    hasProvisional: rounds.some((r) => r.provisional),
  };
}

/** Current-season status (REQ-25.7), independent of any filter. */
async function memberStatuses(
  deps: StatsDeps,
  derived: DerivedState,
): Promise<Map<number, { streak: number; hasFire: boolean; onCooldown: boolean }>> {
  const season = currentSeason(deps);
  const active = await deps.db
    .selectFrom('rounds')
    .select(['id', 'status'])
    .where('status', 'in', ['open', 'locked', 'in_progress'])
    .orderBy('number', 'desc')
    .executeTakeFirst();

  let cooldown: Set<number>;
  if (active) {
    const d: RoundDerived | undefined = derived.rounds.get(active.id);
    cooldown = new Set(d?.cooldownMemberIds ?? []);
    // An open round whose team slots are not set up yet still shows the scheduled cooldown.
    if (active.status === 'open') for (const id of d?.expectedCooldownMemberIds ?? []) cooldown.add(id);
  } else {
    cooldown = new Set(derived.cooldownForNextRound(season));
  }

  const out = new Map<number, { streak: number; hasFire: boolean; onCooldown: boolean }>();
  for (const id of MEMBER_IDS) {
    const m = derived.members[id];
    const inSeason = m !== undefined && m.seasonCode === season;
    const streak = !inSeason ? 0 : m.hitStreak > 0 ? m.hitStreak : -m.missStreak;
    out.set(id, { streak, hasFire: inSeason && m.hasFire, onCooldown: cooldown.has(id) });
  }
  return out;
}

function buildMemberStats(
  memberId: number,
  rounds: StatRound[],
  derived: DerivedState,
  status: { streak: number; hasFire: boolean; onCooldown: boolean },
): MemberStatsDto {
  let hits = 0;
  let misses = 0;
  let voids = 0;
  let blames = 0;
  let payments = 0;
  let paidTotal = 0;
  let longestHitStreak = 0;
  let longestMissStreak = 0;
  let cooldowns = 0;
  let fires = 0;
  const dir = { over: { hits: 0, misses: 0 }, under: { hits: 0, misses: 0 } };
  const players = new Map<string, { playerId: number | null; name: string; picks: number; hits: number; last: number }>();
  const results: PickResult[] = [];

  for (const r of rounds) {
    const d = derived.rounds.get(r.id);
    if (r.payerMemberId === memberId) {
      payments++;
      paidTotal += r.stake;
    }
    if (d) {
      if (d.blame === memberId) blames++;
      if (d.cooldownMemberIds.includes(memberId)) cooldowns++;
      fires += d.fireChanges.filter((c) => c.memberId === memberId && c.change === 'gained').length;
      const after = d.after[memberId];
      if (after) {
        longestHitStreak = Math.max(longestHitStreak, after.hitStreak);
        longestMissStreak = Math.max(longestMissStreak, after.missStreak);
      }
    }
    for (const p of r.picks) {
      if (p.kind !== 'personal' || p.memberId !== memberId) continue;
      if (p.result === 'hit') hits++;
      else if (p.result === 'miss') misses++;
      else if (p.result === 'void') voids++;
      if (p.result !== null) results.push(p.result);
      if (p.direction && (p.result === 'hit' || p.result === 'miss')) {
        dir[p.direction][p.result === 'hit' ? 'hits' : 'misses']++;
      }
      const name = p.playerName ?? 'Nepoznat igrač';
      const key = p.playerId !== null ? `id:${p.playerId}` : `name:${name.toLowerCase()}`;
      const entry = players.get(key) ?? { playerId: p.playerId, name, picks: 0, hits: 0, last: 0 };
      entry.picks++;
      if (p.result === 'hit') entry.hits++;
      entry.last = r.number;
      players.set(key, entry);
    }
  }

  const favoritePlayers = [...players.values()]
    .sort((a, b) => b.picks - a.picks || b.hits - a.hits || b.last - a.last || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map(({ playerId, name, picks, hits: h }) => ({ playerId, name, picks, hits: h }));

  return {
    memberId,
    hits,
    misses,
    voids,
    hitPercent: pct(hits, hits + misses),
    blames,
    payments,
    paidTotal: round2(paidTotal),
    currentStreak: status.streak,
    longestHitStreak,
    longestMissStreak,
    cooldowns,
    fires,
    onCooldown: status.onCooldown,
    hasFire: status.hasFire,
    last10: results.slice(-10).reverse(),
    overPercent: pct(dir.over.hits, dir.over.hits + dir.over.misses),
    underPercent: pct(dir.under.hits, dir.under.hits + dir.under.misses),
    favoritePlayers,
  };
}

async function memberIdsInOrder(deps: StatsDeps): Promise<number[]> {
  const rows = await deps.db.selectFrom('members').select('id').orderBy('sort_order').orderBy('id').execute();
  return rows.length > 0 ? rows.map((r) => r.id) : [...MEMBER_IDS];
}

export async function getMembersStats(deps: StatsDeps, q: StatsQuery): Promise<MemberStatsDto[]> {
  const [rounds, derived, ids] = await Promise.all([loadRounds(deps, q), deps.derived.get(), memberIdsInOrder(deps)]);
  const statuses = await memberStatuses(deps, derived);
  return ids.map((id) =>
    buildMemberStats(id, rounds, derived, statuses.get(id) ?? { streak: 0, hasFire: false, onCooldown: false }),
  );
}

export async function getMemberStats(deps: StatsDeps, memberId: number, q: StatsQuery): Promise<MemberStatsResponse> {
  const exists = await deps.db.selectFrom('members').select('id').where('id', '=', memberId).executeTakeFirst();
  if (!exists) throw notFound('Član nije pronađen.');
  const [rounds, derived] = await Promise.all([loadRounds(deps, q), deps.derived.get()]);
  const statuses = await memberStatuses(deps, derived);
  const stats = buildMemberStats(
    memberId,
    rounds,
    derived,
    statuses.get(memberId) ?? { streak: 0, hasFire: false, onCooldown: false },
  );
  const picks: MemberStatsResponse['picks'] = [];
  for (const r of [...rounds].reverse()) {
    for (const p of r.picks) {
      if (p.kind !== 'personal' || p.memberId !== memberId) continue;
      picks.push({
        roundId: r.id,
        number: r.number,
        gameDay: r.gameDay,
        playerName: p.playerName,
        line: p.line,
        direction: p.direction,
        result: p.result,
      });
    }
  }
  return { stats, picks };
}

export async function getBlame(deps: StatsDeps, q: StatsQuery): Promise<BlameRowDto[]> {
  const [rounds, derived, ids] = await Promise.all([loadRounds(deps, q), deps.derived.get(), memberIdsInOrder(deps)]);

  type Row = Omit<BlameRowDto, 'rank'> & { order: number };
  const rows = new Map<number | 'team', Row>();
  ids.forEach((id, order) =>
    rows.set(id, { memberId: id, blames: 0, blamePercent: null, lostPotentialWin: 0, rounds: [], order }),
  );
  rows.set('team', { memberId: 'team', blames: 0, blamePercent: null, lostPotentialWin: 0, rounds: [], order: 99 });
  const resolvedPicks = new Map<number | 'team', number>();

  for (const r of [...rounds].reverse()) {
    for (const p of r.picks) {
      if (p.result === null) continue;
      const owner = p.kind === 'team' ? 'team' : p.memberId;
      if (owner !== null) resolvedPicks.set(owner, (resolvedPicks.get(owner) ?? 0) + 1);
    }
    const blame = derived.rounds.get(r.id)?.blame ?? null;
    if (blame === null) continue;
    const row = rows.get(blame);
    if (!row) continue;
    row.blames++;
    row.lostPotentialWin += r.totalOdds !== null ? r.stake * r.totalOdds : 0;
    row.rounds.push({ roundId: r.id, number: r.number, gameDay: r.gameDay });
  }

  const members = ids
    .map((id) => rows.get(id)!)
    .map((row) => ({
      ...row,
      lostPotentialWin: round2(row.lostPotentialWin),
      blamePercent: pct(row.blames, resolvedPicks.get(row.memberId) ?? 0),
    }))
    .sort((a, b) => b.blames - a.blames || b.lostPotentialWin - a.lostPotentialWin || a.order - b.order);

  const team = rows.get('team')!;
  const teamRow = {
    ...team,
    lostPotentialWin: round2(team.lostPotentialWin),
    blamePercent: pct(team.blames, resolvedPicks.get('team') ?? 0),
  };
  const all = team.blames > 0 ? [...members, teamRow] : members;
  return all.map(({ order: _order, ...row }, i) => ({ rank: i + 1, ...row }));
}
