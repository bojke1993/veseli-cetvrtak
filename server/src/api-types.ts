/**
 * HTTP API contract shared by server routes and the web client (docs/design.md §6).
 * Type-only module: no runtime code. All routes are under /api.
 *
 * Conventions:
 * - Instants are ISO 8601 UTC strings; days are 'YYYY-MM-DD' (Europe/Belgrade).
 * - Money and odds are numbers (RSD, 2 decimals); lines are numbers like 14.5.
 * - Errors: { error: { code, message } } with HTTP 400/401/403/404/409/422.
 * - Mutating requests must send header `X-Requested-With: vc`.
 */

export type MemberId = 1 | 2 | 3 | 4;
export type Direction = 'over' | 'under';
export type PickKind = 'personal' | 'team';
export type PickResult = 'hit' | 'miss' | 'void';
export type VoidReason = 'dnp' | 'game_not_played';
export type Resolution = 'auto' | 'manual' | 'import';
export type RoundStatus = 'open' | 'locked' | 'in_progress' | 'won' | 'lost' | 'void';
export type GameStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled';

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

// ---------- Auth ----------

export interface LoginRequest { username: string; password: string }
export interface ChangePasswordRequest { currentPassword: string; newPassword: string }

export interface Me {
  memberId: number;
  name: string;
  displayName: string;
  username: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
}
/** GET /auth/me returns { me: null } for guests (no 401). */
export interface MeResponse { me: Me | null }

// ---------- Members ----------

export interface MemberStatus {
  /** Current streak within the current season: positive = hits in a row, negative = misses in a row. */
  streak: number;
  hasFire: boolean;
  /** On cooldown in the current open/active round, or scheduled for the next round. */
  onCooldown: boolean;
}

export interface MemberDto {
  id: number;
  name: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  sortOrder: number;
  status: MemberStatus;
}
export interface MembersResponse { members: MemberDto[] }
export interface UpdateMemberRequest { displayName?: string; avatarUrl?: string | null }
export interface ResetPasswordResponse { temporaryPassword: string }

// ---------- Players & games ----------

export interface ClubDto { code: string; name: string; shortName: string; crestUrl: string | null }

export interface GameDto {
  id: number;
  seasonCode: string;
  gameCode: number;
  euroleagueRound: number | null;
  home: ClubDto;
  away: ClubDto;
  scheduledAt: string;
  gameDay: string;
  status: GameStatus;
  homeScore: number | null;
  awayScore: number | null;
  liveQuarter: string | null;
  liveClock: string | null;
  isManual: boolean;
}

export interface PlayerDto {
  id: number;
  fullName: string;
  club: ClubDto | null;
  position: string | null;
  jersey: string | null;
  photoUrl: string | null;
  isActive: boolean;
  isManual: boolean;
}

export interface PlayerSearchItem extends PlayerDto {
  /** Game of the player's club on the requested day, if any. */
  game: GameDto | null;
  /** False when the club does not play that day or the game already started (REQ-07.3). */
  selectable: boolean;
  /** Reason shown when not selectable, e.g. "Ne igra 16.10." */
  note: string | null;
}
/** GET /players/search?q=&day=&roundId= (roundId marks players already used in that round). */
export interface PlayerSearchResponse { items: PlayerSearchItem[] }
export interface CreatePlayerRequest { firstName: string; lastName: string; clubCode: string | null; position?: string | null }

export interface GameDayDto { day: string; games: GameDto[] }
/** GET /games/days — upcoming days with at least one not-started game. */
export interface GameDaysResponse { days: GameDayDto[] }
/** GET /games?day= */
export interface GamesResponse { games: GameDto[] }
export interface CreateGameRequest { homeClubCode: string; awayClubCode: string; scheduledAt: string }

// ---------- Rounds ----------

export type LiveStatus =
  | 'not_started'
  | 'passing'
  | 'failing'
  | 'sure_hit'
  | 'sure_miss'
  | 'not_entered'
  | 'final_hit'
  | 'final_miss'
  | 'void';

export interface PickLiveDto {
  points: number | null;
  secondsPlayed: number | null;
  fouls: number | null;
  status: LiveStatus;
  /** For 'over' picks not yet hit: points still needed. */
  pointsNeeded: number | null;
  updatedAt: string | null;
}

export interface PickDto {
  id: number;
  slot: number;
  kind: PickKind;
  /** Personal pick owner. */
  memberId: number | null;
  /** Team pick: the member on cooldown it replaces. */
  cooldownForMemberId: number | null;
  player: PlayerDto | null;
  /** Free-text player name for imported picks that were not matched to a player. */
  importPlayerName: string | null;
  game: GameDto | null;
  line: number | null;
  direction: Direction | null;
  odds: number | null;
  finalPoints: number | null;
  result: PickResult | null;
  voidReason: VoidReason | null;
  resolution: Resolution | null;
  live: PickLiveDto | null;
}

export interface ProposalDto {
  id: number;
  kind: PickKind;
  proposedBy: number;
  cooldownForMemberId: number | null;
  player: PlayerDto;
  game: GameDto | null;
  line: number;
  direction: Direction;
  comment: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'superseded';
  votes: number[];
  createdAt: string;
}

export interface RoundSummaryDto {
  id: number;
  number: number;
  openedAt: string;
  gameDay: string;
  seasonCode: string;
  euroleagueRound: number | null;
  source: 'app' | 'import';
  status: RoundStatus;
  stake: number | null;
  totalOdds: number | null;
  payerMemberId: number | null;
  potentialWin: number | null;
  actualWin: number | null;
  actualWinProvisional: boolean;
  hits: number;
  misses: number;
  voids: number;
  /** '3/4' or '3/3 (+1 poništen)'; null while unresolved. */
  outcomeLabel: string | null;
  /** Member blamed in this round, 'team' for a team pick, or null. */
  blame: number | 'team' | null;
  cooldownMemberIds: number[];
  hasCorrections: boolean;
  cooldownInconsistent: boolean;
  picks: Array<Pick<PickDto, 'slot' | 'kind' | 'memberId' | 'cooldownForMemberId' | 'line' | 'direction' | 'result'> & { playerName: string | null }>;
}

export interface FireChangeDto { memberId: number; change: 'gained' | 'lost' }

export interface RoundDetailDto extends Omit<RoundSummaryDto, 'picks'> {
  lockedAt: string | null;
  /** null with lockedAt set = locked by the system. */
  lockedBy: number | null;
  resolvedAt: string | null;
  picks: PickDto[];
  proposals: ProposalDto[];
  fireChanges: FireChangeDto[];
  /** Ticket indicator while in progress (REQ-13.6). */
  ticketAlive: boolean | null;
  passingCount: number | null;
  /** Last successful live refresh among the round's games. */
  liveUpdatedAt: string | null;
  /** Whether the whole round can still be unlocked (no game started). */
  canUnlock: boolean;
  /** Earliest game start among the round's picks. */
  firstGameAt: string | null;
  /** What is still missing before locking (REQ-11.1), Serbian labels. */
  missingForLock: string[];
  /** Audit entries for this round; empty for guests. */
  audit: AuditEntryDto[];
}
export interface RoundResponse { round: RoundDetailDto }
/** GET /rounds/current → the open/locked/in-progress round, or the latest resolved one. */
export interface CurrentRoundResponse { round: RoundDetailDto | null; canOpenNew: boolean; reasonCannotOpen: string | null }

export interface RoundsQuery {
  season?: string; // 'all' or season code
  from?: string;
  to?: string;
  status?: RoundStatus;
  outcome?: '4/4' | '3/4' | '2/4' | '1/4' | '0/4' | 'with_void';
  member?: number;
  memberFilter?: 'hit' | 'miss' | 'blame' | 'cooldown';
  payer?: number;
  player?: number;
  club?: string;
  direction?: Direction;
  teamPick?: boolean;
  page?: number; // 1-based, 20 per page
}
export interface RoundsResponse { items: RoundSummaryDto[]; page: number; pageSize: number; total: number }

export interface CreateRoundRequest { gameDay: string }
export interface UpdateRoundRequest {
  gameDay?: string;
  /** Required to confirm removal of picks not on the new day. */
  confirmDropPicks?: boolean;
  stake?: number | null;
  totalOdds?: number | null;
  payerMemberId?: number | null;
}
export interface SetPickRequest { playerId: number; line: number; direction: Direction; odds?: number | null }
export interface UnlockRequest { reason: string }

export type CorrectionField =
  | 'player'
  | 'line'
  | 'direction'
  | 'odds'
  | 'stake'
  | 'totalOdds'
  | 'payer';
export interface CorrectionRequest {
  /** Required for pick fields. */
  slot?: number;
  field: CorrectionField;
  value: number | string | null;
  reason: string;
  /** When true nothing is saved; the response lists consequences only. */
  dryRun?: boolean;
}
export interface CorrectionResponse {
  applied: boolean;
  /** Human-readable consequences, e.g. "Tozislav: niz promašaja 4 → 5, ulazi na hlađenje". */
  consequences: string[];
  round: RoundDetailDto;
}

export interface ManualResolveRequest {
  mode: 'points' | 'dnp' | 'not_played';
  points?: number;
  reason: string;
}
export interface ActualWinRequest { amount: number; reason: string }
export interface DeleteRoundRequest { confirmNumber: number }

export interface CreateProposalRequest {
  kind: PickKind;
  /** Required for kind 'team'. */
  cooldownForMemberId?: number;
  playerId: number;
  line: number;
  direction: Direction;
  comment?: string;
}

// ---------- Stats ----------

export interface StatsQuery { season?: string; from?: string; to?: string }

export interface OutcomeBucket { key: '4/4' | '3/4' | '2/4' | '1/4' | '0/4' | 'with_void'; count: number; percent: number }

export interface TeamStatsDto { picks: number; hits: number; misses: number; voids: number; hitPercent: number | null; blames: number }

export interface OverviewStatsDto {
  totalStaked: number;
  totalWon: number;
  balance: number;
  roiPercent: number | null;
  rounds: number;
  wonRounds: number;
  wonPercent: number | null;
  distribution: OutcomeBucket[];
  biggestWin: { roundId: number; number: number; amount: number } | null;
  longestLosingRun: number;
  balanceSeries: Array<{ roundId: number; number: number; gameDay: string; balance: number }>;
  team: TeamStatsDto;
  hasProvisional: boolean;
}

export interface MemberStatsDto {
  memberId: number;
  hits: number;
  misses: number;
  voids: number;
  hitPercent: number | null;
  blames: number;
  payments: number;
  paidTotal: number;
  /** Current-season streak (see MemberStatus.streak). */
  currentStreak: number;
  longestHitStreak: number;
  longestMissStreak: number;
  cooldowns: number;
  fires: number;
  onCooldown: boolean;
  hasFire: boolean;
  last10: Array<PickResult>;
  overPercent: number | null;
  underPercent: number | null;
  favoritePlayers: Array<{ playerId: number | null; name: string; picks: number; hits: number }>;
}
export interface OverviewResponse { stats: OverviewStatsDto }
export interface MembersStatsResponse { members: MemberStatsDto[] }
export interface MemberStatsResponse { stats: MemberStatsDto; picks: Array<{ roundId: number; number: number; gameDay: string; playerName: string | null; line: number | null; direction: Direction | null; result: PickResult | null }> }

export interface BlameRowDto {
  rank: number;
  memberId: number | 'team';
  blames: number;
  blamePercent: number | null;
  lostPotentialWin: number;
  rounds: Array<{ roundId: number; number: number; gameDay: string }>;
}
export interface BlameResponse { rows: BlameRowDto[] }

export interface SeasonsResponse { seasons: Array<{ code: string; name: string }>; current: string }

// ---------- Audit, admin ----------

export interface AuditEntryDto {
  id: number;
  at: string;
  actorMemberId: number | null;
  action: string;
  roundId: number | null;
  entity: string | null;
  entityId: string | null;
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
}
export interface AuditResponse { items: AuditEntryDto[] }

export type AdminTaskKind =
  | 'lock_soon'
  | 'manual_resolve'
  | 'enter_actual_win'
  | 'cooldown_inconsistent'
  | 'sync_failing'
  | 'live_failing';
export interface AdminTaskDto {
  kind: AdminTaskKind;
  message: string;
  roundId: number | null;
  slot: number | null;
  /** SPA path to resolve the task. */
  link: string;
}
export interface AdminTasksResponse { tasks: AdminTaskDto[] }

export interface SyncRunDto { id: number; type: string; startedAt: string; finishedAt: string | null; status: 'running' | 'ok' | 'error'; errorMessage: string | null; itemsChanged: number | null }
export interface SyncRunsResponse { runs: SyncRunDto[]; lastOk: Record<string, string | null> }

// ---------- Import ----------

export type ImportColumn =
  | 'kolo' | 'datum' | 'clan' | 'umesto' | 'igrac' | 'tim' | 'granica'
  | 'tip' | 'poeni' | 'ishod' | 'uplata' | 'kvota' | 'uplatio' | 'dobitak';

export interface ImportError { row: number | null; round: number | null; message: string }
export interface UnmatchedPlayer { name: string; club: string | null; candidates: PlayerDto[] }

export interface ImportPreviewResponse {
  /** Token referencing the uploaded file kept on the server for commit (valid 1 h). */
  token: string;
  headers: string[];
  /** Suggested mapping: our column -> header in the file (or null). */
  mapping: Record<ImportColumn, string | null>;
  rounds: number;
  from: string | null;
  to: string | null;
  errors: ImportError[];
  unmatchedPlayers: UnmatchedPlayer[];
  canCommit: boolean;
}
/** POST /import/preview — multipart with field `file`; optional field `mapping` (JSON) re-runs preview with a custom mapping. */
export interface ImportCommitRequest {
  token: string;
  mapping: Record<ImportColumn, string | null>;
  /** name (as in file) -> playerId, or 'manual' to create a manual player, or null to keep as free text. */
  playerMatches: Record<string, number | 'manual' | null>;
  /** Must be true when previously imported rounds would be replaced. */
  confirmReplace?: boolean;
}
export interface ImportCommitResponse { imported: number }

// ---------- Live (SSE) ----------

/** SSE on GET /live/stream. Event names: 'round', 'live', 'ping'. */
export interface RoundEvent { roundId: number }
export interface LiveEvent { roundId: number; picks: Array<{ slot: number; live: PickLiveDto }>; game?: GameDto }
