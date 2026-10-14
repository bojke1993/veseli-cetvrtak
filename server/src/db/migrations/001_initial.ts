import { sql, type Kysely } from 'kysely';

const statements = [
  sql`CREATE TABLE members (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    display_name VARCHAR(64) NOT NULL,
    avatar_url VARCHAR(512) NULL,
    username VARCHAR(32) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    must_change_password TINYINT(1) NOT NULL DEFAULT 1,
    is_admin TINYINT(1) NOT NULL DEFAULT 0,
    sort_order TINYINT UNSIGNED NOT NULL,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  sql`CREATE TABLE sessions (
    id CHAR(64) NOT NULL PRIMARY KEY,
    member_id TINYINT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sessions_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    INDEX ix_sessions_expires (expires_at)
  )`,
  sql`CREATE TABLE seasons (
    code VARCHAR(8) NOT NULL PRIMARY KEY,
    name VARCHAR(16) NOT NULL,
    start_date DATE NOT NULL
  )`,
  sql`CREATE TABLE clubs (
    code VARCHAR(8) NOT NULL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    short_name VARCHAR(64) NOT NULL,
    crest_url VARCHAR(512) NULL
  )`,
  sql`CREATE TABLE players (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    external_code VARCHAR(16) NULL UNIQUE,
    first_name VARCHAR(64) NOT NULL,
    last_name VARCHAR(64) NOT NULL,
    full_name VARCHAR(128) NOT NULL,
    search_name VARCHAR(160) NOT NULL,
    club_code VARCHAR(8) NULL,
    position VARCHAR(16) NULL,
    jersey VARCHAR(4) NULL,
    photo_url VARCHAR(512) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    is_manual TINYINT(1) NOT NULL DEFAULT 0,
    last_synced_at DATETIME NULL,
    INDEX ix_players_search (search_name),
    INDEX ix_players_club (club_code)
  )`,
  sql`CREATE TABLE games (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    season_code VARCHAR(8) NOT NULL,
    game_code INT NOT NULL,
    euroleague_round INT NULL,
    home_club_code VARCHAR(8) NOT NULL,
    away_club_code VARCHAR(8) NOT NULL,
    scheduled_at DATETIME NOT NULL,
    game_day DATE NOT NULL,
    status ENUM('scheduled','live','final','postponed','cancelled') NOT NULL DEFAULT 'scheduled',
    home_score INT NULL,
    away_score INT NULL,
    live_quarter VARCHAR(8) NULL,
    live_clock VARCHAR(8) NULL,
    started_at DATETIME NULL,
    final_at DATETIME NULL,
    recheck_done_at DATETIME NULL,
    last_polled_at DATETIME NULL,
    is_manual TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_games_code (season_code, game_code),
    INDEX ix_games_day (game_day)
  )`,
  sql`CREATE TABLE player_game_stats (
    game_id INT UNSIGNED NOT NULL,
    player_id INT UNSIGNED NOT NULL,
    points INT NOT NULL DEFAULT 0,
    seconds_played INT NOT NULL DEFAULT 0,
    fouls INT NULL,
    is_final TINYINT(1) NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (game_id, player_id),
    CONSTRAINT fk_pgs_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    CONSTRAINT fk_pgs_player FOREIGN KEY (player_id) REFERENCES players(id)
  )`,
  sql`CREATE TABLE rounds (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number INT UNSIGNED NOT NULL UNIQUE,
    opened_at DATETIME NOT NULL,
    game_day DATE NOT NULL,
    season_code VARCHAR(8) NOT NULL,
    euroleague_round INT NULL,
    source ENUM('app','import') NOT NULL DEFAULT 'app',
    status ENUM('open','locked','in_progress','won','lost','void') NOT NULL DEFAULT 'open',
    stake DECIMAL(12,2) NULL,
    total_odds DECIMAL(8,2) NULL,
    payer_member_id TINYINT UNSIGNED NULL,
    actual_win DECIMAL(12,2) NULL,
    actual_win_provisional TINYINT(1) NOT NULL DEFAULT 0,
    actual_win_manual TINYINT(1) NOT NULL DEFAULT 0,
    hits TINYINT UNSIGNED NOT NULL DEFAULT 0,
    misses TINYINT UNSIGNED NOT NULL DEFAULT 0,
    voids TINYINT UNSIGNED NOT NULL DEFAULT 0,
    locked_at DATETIME NULL,
    locked_by TINYINT UNSIGNED NULL,
    resolved_at DATETIME NULL,
    has_corrections TINYINT(1) NOT NULL DEFAULT 0,
    CONSTRAINT fk_rounds_payer FOREIGN KEY (payer_member_id) REFERENCES members(id),
    INDEX ix_rounds_day (game_day),
    INDEX ix_rounds_status (status)
  )`,
  sql`CREATE TABLE picks (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    round_id INT UNSIGNED NOT NULL,
    slot TINYINT UNSIGNED NOT NULL,
    kind ENUM('personal','team') NOT NULL,
    member_id TINYINT UNSIGNED NULL,
    cooldown_for_member_id TINYINT UNSIGNED NULL,
    player_id INT UNSIGNED NULL,
    game_id INT UNSIGNED NULL,
    line DECIMAL(5,1) NULL,
    direction ENUM('over','under') NULL,
    odds DECIMAL(8,2) NULL,
    final_points INT NULL,
    result ENUM('hit','miss','void') NULL,
    void_reason ENUM('dnp','game_not_played') NULL,
    resolution ENUM('auto','manual','import') NULL,
    resolved_at DATETIME NULL,
    import_player_name VARCHAR(128) NULL,
    UNIQUE KEY uq_picks_slot (round_id, slot),
    UNIQUE KEY uq_picks_player (round_id, player_id),
    CONSTRAINT fk_picks_round FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
    CONSTRAINT fk_picks_player FOREIGN KEY (player_id) REFERENCES players(id),
    CONSTRAINT fk_picks_game FOREIGN KEY (game_id) REFERENCES games(id),
    INDEX ix_picks_game (game_id)
  )`,
  sql`CREATE TABLE proposals (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    round_id INT UNSIGNED NOT NULL,
    proposed_by TINYINT UNSIGNED NOT NULL,
    kind ENUM('personal','team') NOT NULL,
    cooldown_for_member_id TINYINT UNSIGNED NULL,
    player_id INT UNSIGNED NOT NULL,
    line DECIMAL(5,1) NOT NULL,
    direction ENUM('over','under') NOT NULL,
    comment VARCHAR(500) NULL,
    status ENUM('pending','accepted','rejected','superseded') NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_proposals_round FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
    CONSTRAINT fk_proposals_player FOREIGN KEY (player_id) REFERENCES players(id)
  )`,
  sql`CREATE TABLE proposal_votes (
    proposal_id INT UNSIGNED NOT NULL,
    member_id TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (proposal_id, member_id),
    CONSTRAINT fk_votes_proposal FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE
  )`,
  sql`CREATE TABLE audit_log (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    at DATETIME NOT NULL,
    actor_member_id TINYINT UNSIGNED NULL,
    action VARCHAR(32) NOT NULL,
    round_id INT UNSIGNED NULL,
    entity VARCHAR(32) NULL,
    entity_id VARCHAR(32) NULL,
    field VARCHAR(64) NULL,
    old_value JSON NULL,
    new_value JSON NULL,
    reason VARCHAR(1000) NULL,
    INDEX ix_audit_round (round_id),
    INDEX ix_audit_at (at)
  )`,
  sql`CREATE TABLE sync_runs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(16) NOT NULL,
    started_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    status ENUM('running','ok','error') NOT NULL,
    error_message VARCHAR(2000) NULL,
    items_changed INT NULL,
    INDEX ix_sync_type (type, started_at)
  )`,
];

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const stmt of statements) await stmt.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const t of [
    'sync_runs', 'audit_log', 'proposal_votes', 'proposals', 'picks', 'rounds',
    'player_game_stats', 'games', 'players', 'clubs', 'seasons', 'sessions', 'members',
  ]) {
    await sql`DROP TABLE IF EXISTS ${sql.table(t)}`.execute(db);
  }
}
