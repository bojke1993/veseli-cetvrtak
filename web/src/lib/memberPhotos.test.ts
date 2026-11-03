import { describe, expect, it } from 'vitest';
import { COOLDOWN_MESSAGES, FIRE_MESSAGES, memberMood } from './memberPhotos';

const cooldown = { streak: -5, hasFire: false, onCooldown: true };
const fire = { streak: 3, hasFire: true, onCooldown: false };

describe('memberMood', () => {
  it.each([
    [0, 0],
    [0.34, 1],
    [0.999, 2],
  ])('roll %d picks message %d', (roll, index) => {
    expect(memberMood(cooldown, roll)).toEqual({ emoji: '❄', text: COOLDOWN_MESSAGES[index] });
    expect(memberMood(fire, roll)).toEqual({ emoji: '🔥', text: FIRE_MESSAGES[index] });
  });

  it('keeps the streak text for other statuses', () => {
    expect(memberMood({ streak: 0, hasFire: false, onCooldown: false }, 0.5).text).toBe('Čist list — bez niza.');
  });
});
