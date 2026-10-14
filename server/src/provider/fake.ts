import type {
  EuroleagueProvider,
  ProviderBoxscore,
  ProviderGame,
  ProviderHeader,
  ProviderPlayer,
} from './types.js';

/** In-memory provider for tests and local development. Mutate the public fields to simulate the API. */
export class FakeProvider implements EuroleagueProvider {
  games: ProviderGame[] = [];
  players: ProviderPlayer[] = [];
  headers = new Map<number, ProviderHeader>();
  boxscores = new Map<number, ProviderBoxscore>();
  /** When set, every call rejects with this error (simulates an outage). */
  failWith: Error | null = null;
  calls: string[] = [];

  private check(call: string): void {
    this.calls.push(call);
    if (this.failWith) throw this.failWith;
  }

  async listGames(seasonCode: string): Promise<ProviderGame[]> {
    this.check(`listGames:${seasonCode}`);
    return this.games.filter((g) => g.seasonCode === seasonCode);
  }

  async listPlayers(seasonCode: string): Promise<ProviderPlayer[]> {
    this.check(`listPlayers:${seasonCode}`);
    return this.players;
  }

  async getHeader(seasonCode: string, gameCode: number): Promise<ProviderHeader> {
    this.check(`getHeader:${seasonCode}:${gameCode}`);
    return this.headers.get(gameCode) ?? { live: false, homeScore: 0, awayScore: 0, quarter: null, clock: null };
  }

  async getBoxscore(seasonCode: string, gameCode: number): Promise<ProviderBoxscore> {
    this.check(`getBoxscore:${seasonCode}:${gameCode}`);
    return this.boxscores.get(gameCode) ?? { live: false, lines: [] };
  }
}
