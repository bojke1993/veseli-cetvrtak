/**
 * Normalized data from the Euroleague source (docs/design.md §7).
 * Implementations: EuroleagueLiveProvider (real API), FakeProvider (tests), manual fallback.
 */

export interface ProviderClub {
  code: string;
  name: string;
  shortName: string;
  crestUrl: string | null;
}

export interface ProviderGame {
  seasonCode: string;
  gameCode: number;
  round: number | null;
  home: ProviderClub;
  away: ProviderClub;
  /** Scheduled start, UTC. */
  scheduledAt: Date;
  played: boolean;
  homeScore: number | null;
  awayScore: number | null;
}

export interface ProviderPlayer {
  /** person.code without the 'P' prefix, trimmed, e.g. '007200'. */
  code: string;
  firstName: string;
  lastName: string;
  club: ProviderClub | null;
  position: string | null;
  jersey: string | null;
  photoUrl: string | null;
  active: boolean;
}

export interface ProviderHeader {
  live: boolean;
  homeScore: number;
  awayScore: number;
  quarter: string | null;
  clock: string | null;
}

export interface ProviderBoxscoreLine {
  /** Same format as ProviderPlayer.code. */
  playerCode: string;
  /** 'LARKIN, SHANE' as reported by the boxscore. */
  name: string;
  clubCode: string;
  points: number;
  /** 0 for DNP. */
  secondsPlayed: number;
  fouls: number | null;
}

export interface ProviderBoxscore {
  live: boolean;
  lines: ProviderBoxscoreLine[];
}

export interface EuroleagueProvider {
  listGames(seasonCode: string): Promise<ProviderGame[]>;
  listPlayers(seasonCode: string): Promise<ProviderPlayer[]>;
  getHeader(seasonCode: string, gameCode: number): Promise<ProviderHeader>;
  getBoxscore(seasonCode: string, gameCode: number): Promise<ProviderBoxscore>;
}

/** Thrown by providers when a response does not match the expected schema (REQ-33.5). */
export class ProviderSchemaError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = 'ProviderSchemaError';
  }
}
