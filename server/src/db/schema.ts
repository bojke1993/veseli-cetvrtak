import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * Kysely table types. Conventions (docs/design.md §4):
 * - DATETIME columns are UTC and surface as JS Date.
 * - DATE columns (game_day, start_date) are 'YYYY-MM-DD' strings (mysql2 `dateStrings: ['DATE']`).
 * - DECIMAL columns surface as strings from mysql2; use domain/money helpers to convert.
 * - Booleans are TINYINT(1) -> number 0/1.
 */

type Decimal = ColumnType<string, string | number, string | number>;
type NullableDecimal = ColumnType<string | null, string | number | null, string | number | null>;
type CreatedAt = ColumnType<Date, Date | undefined, never>;
type Bool = ColumnType<number, number | boolean, number | boolean>;

export type GameStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled';
export type RoundStatus = 'open' | 'locked' | 'in_progress' | 'won' | 'lost' | 'void';
export type RoundSource = 'app' | 'import';
export type PickKind = 'personal' | 'team';
export type Direction = 'over' | 'under';
export type PickResult = 'hit' | 'miss' | 'void';
export type VoidReason = 'dnp' | 'game_not_played';
export type Resolution = 'auto' | 'manual' | 'import';
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'superseded';
export type SyncType = 'players' | 'schedule' | 'live' | 'final' | 'recheck' | 'backup';

export type AuditAction =
  | 'lock'
  | 'auto_lock'
  | 'unlock'
  | 'correct'
  | 'manual_resolve'
  | 'auto_recheck_fix'
  | 'actual_win_override'
  | 'admin_transfer'
  | 'password_reset'
  | 'round_delete'
  | 'full_recalc'
  | 'history_import';

export interface MembersTable {
  id: number; // 1..4, fixed
  name: string;
  display_name: string;
  avatar_url: string | null;
  username: string;
  password_hash: string;
  must_change_password: Bool;
  is_admin: Bool;
  sort_order: number;
  failed_attempts: Generated<number>;
  locked_until: Date | null;
  created_at: CreatedAt;
}

export interface SessionsTable {
  id: string; // sha256(token) hex
  member_id: number;
  expires_at: Date;
  created_at: CreatedAt;
}

export interface SeasonsTable {
  code: string; // E2026
  name: string; // 2026/27
  start_date: string; // YYYY-MM-DD
}

export interface ClubsTable {
  code: string;
  name: string;
  short_name: string;
  crest_url: string | null;
}

export interface PlayersTable {
  id: Generated<number>;
  external_code: string | null; // Euroleague person.code, e.g. '007200'
  first_name: string;
  last_name: string;
  full_name: string; // 'Shane Larkin'
  search_name: string; // normalized, see domain/text.normalizeName
  club_code: string | null;
  position: string | null;
  jersey: string | null;
  photo_url: string | null;
  is_active: Bool;
  is_manual: Bool;
  last_synced_at: Date | null;
}

export interface GamesTable {
  id: Generated<number>;
  season_code: string;
  game_code: number;
  euroleague_round: number | null;
  home_club_code: string;
  away_club_code: string;
  scheduled_at: Date;
  game_day: string; // YYYY-MM-DD in Europe/Belgrade
  status: GameStatus;
  home_score: number | null;
  away_score: number | null;
  live_quarter: string | null;
  live_clock: string | null;
  started_at: Date | null;
  final_at: Date | null;
  recheck_done_at: Date | null;
  last_polled_at: Date | null;
  is_manual: Bool;
}

export interface PlayerGameStatsTable {
  game_id: number;
  player_id: number;
  points: number;
  seconds_played: number;
  fouls: number | null;
  is_final: Bool;
  updated_at: Date;
}

export interface RoundsTable {
  id: Generated<number>;
  number: number;
  opened_at: Date;
  game_day: string;
  season_code: string;
  euroleague_round: number | null;
  source: RoundSource;
  status: RoundStatus;
  stake: NullableDecimal;
  total_odds: NullableDecimal;
  payer_member_id: number | null;
  actual_win: NullableDecimal;
  actual_win_provisional: Bool;
  actual_win_manual: Bool;
  hits: number;
  misses: number;
  voids: number;
  locked_at: Date | null;
  locked_by: number | null; // null with locked_at set = system
  resolved_at: Date | null;
  has_corrections: Bool;
}

export interface PicksTable {
  id: Generated<number>;
  round_id: number;
  slot: number; // 1..4
  kind: PickKind;
  member_id: number | null; // personal pick owner
  cooldown_for_member_id: number | null; // team pick: member on cooldown
  player_id: number | null;
  game_id: number | null;
  line: NullableDecimal;
  direction: Direction | null;
  odds: NullableDecimal;
  final_points: number | null;
  result: PickResult | null;
  void_reason: VoidReason | null;
  resolution: Resolution | null;
  resolved_at: Date | null;
  import_player_name: string | null;
}

export interface ProposalsTable {
  id: Generated<number>;
  round_id: number;
  proposed_by: number;
  kind: PickKind;
  cooldown_for_member_id: number | null;
  player_id: number;
  line: Decimal;
  direction: Direction;
  comment: string | null;
  status: ProposalStatus;
  created_at: CreatedAt;
}

export interface ProposalVotesTable {
  proposal_id: number;
  member_id: number;
}

export interface AuditLogTable {
  id: Generated<number>;
  at: Date;
  actor_member_id: number | null; // null = system
  action: AuditAction;
  round_id: number | null;
  entity: string | null;
  entity_id: string | null;
  field: string | null;
  old_value: ColumnType<unknown, string | null, string | null>; // JSON
  new_value: ColumnType<unknown, string | null, string | null>; // JSON
  reason: string | null;
}

export interface SyncRunsTable {
  id: Generated<number>;
  type: SyncType;
  started_at: Date;
  finished_at: Date | null;
  status: 'running' | 'ok' | 'error';
  error_message: string | null;
  items_changed: number | null;
}

export interface Database {
  members: MembersTable;
  sessions: SessionsTable;
  seasons: SeasonsTable;
  clubs: ClubsTable;
  players: PlayersTable;
  games: GamesTable;
  player_game_stats: PlayerGameStatsTable;
  rounds: RoundsTable;
  picks: PicksTable;
  proposals: ProposalsTable;
  proposal_votes: ProposalVotesTable;
  audit_log: AuditLogTable;
  sync_runs: SyncRunsTable;
}

export type Member = Selectable<MembersTable>;
export type Player = Selectable<PlayersTable>;
export type Game = Selectable<GamesTable>;
export type Round = Selectable<RoundsTable>;
export type NewRound = Insertable<RoundsTable>;
export type RoundUpdate = Updateable<RoundsTable>;
export type Pick = Selectable<PicksTable>;
export type PickUpdate = Updateable<PicksTable>;
export type Proposal = Selectable<ProposalsTable>;
export type AuditEntry = Selectable<AuditLogTable>;
