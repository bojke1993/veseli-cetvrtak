import type { LiveStatus } from '../api-types.js';
import type { Direction, GameStatus, PickResult } from '../db/schema.js';

/** BR-09: positive line of the form x.5. */
export function isValidLine(line: number): boolean {
  if (!Number.isFinite(line) || line <= 0) return false;
  return Math.abs(line - Math.floor(line) - 0.5) < 1e-9;
}

/** BR-12, BR-13: final resolution of a pick from the final box score. */
export function resolvePick(i: {
  direction: Direction;
  line: number;
  points: number;
  secondsPlayed: number;
}): { result: PickResult; voidReason: 'dnp' | null } {
  if (i.secondsPlayed <= 0) return { result: 'void', voidReason: 'dnp' };
  const hit = i.direction === 'over' ? i.points > i.line : i.points < i.line;
  return { result: hit ? 'hit' : 'miss', voidReason: null };
}

/** BR-16, FR-13: live indicator of a pick while its game is played. */
export function liveStatus(i: {
  direction: Direction;
  line: number;
  gameStatus: GameStatus;
  points: number | null;
  secondsPlayed: number | null;
  result: PickResult | null;
}): { status: LiveStatus; pointsNeeded: number | null } {
  if (i.result === 'hit') return { status: 'final_hit', pointsNeeded: null };
  if (i.result === 'miss') return { status: 'final_miss', pointsNeeded: null };
  if (i.result === 'void') return { status: 'void', pointsNeeded: null };

  const points = i.points ?? 0;
  const needed = i.direction === 'over' && points <= i.line ? Math.ceil(i.line - points) : null;

  if (i.gameStatus === 'scheduled' || i.gameStatus === 'postponed' || i.gameStatus === 'cancelled') {
    return { status: 'not_started', pointsNeeded: needed };
  }
  if (!i.secondsPlayed) return { status: 'not_entered', pointsNeeded: needed };
  if (points > i.line) return { status: i.direction === 'over' ? 'sure_hit' : 'sure_miss', pointsNeeded: null };
  // points < line here (line is x.5)
  return { status: i.direction === 'over' ? 'failing' : 'passing', pointsNeeded: needed };
}
