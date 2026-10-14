import { describe, expect, it } from 'vitest';
import { applyLiveEvent } from './useLiveStream';
import { GAME, PLAYER, pick, roundDetail } from '../test/fixtures';

describe('applyLiveEvent', () => {
  const round = roundDetail({
    status: 'in_progress',
    picks: [pick(1, { player: PLAYER, game: GAME, line: 14.5, direction: 'over' }), pick(2), pick(3), pick(4)],
  });

  it('patches live data of the matching slots and the game', () => {
    const live = { points: 12, secondsPlayed: 900, fouls: 2, status: 'failing' as const, pointsNeeded: 3, updatedAt: '2026-10-15T19:00:00Z' };
    const game = { ...GAME, status: 'live' as const, homeScore: 40, awayScore: 38, liveQuarter: 'Q3', liveClock: '05:12' };
    const next = applyLiveEvent(round, { roundId: 7, picks: [{ slot: 1, live }], game });
    expect(next.picks[0]!.live).toEqual(live);
    expect(next.picks[0]!.game?.homeScore).toBe(40);
    expect(next.picks[1]!.live).toBeNull();
    expect(next.liveUpdatedAt).toBe('2026-10-15T19:00:00Z');
    expect(round.picks[0]!.live).toBeNull(); // immutable
  });

  it('ignores events for other rounds', () => {
    expect(applyLiveEvent(round, { roundId: 99, picks: [] })).toBe(round);
  });
});
