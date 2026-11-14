import { describe, expect, it } from 'vitest';
import {
  COOLDOWN_MESSAGES,
  DOUBLE_FIRE_MESSAGES,
  FIRE_MESSAGES,
  TWO_HITS_MESSAGES,
  TWO_MISSES_MESSAGES,
  memberMood,
} from './memberPhotos';

const cooldown = { streak: -5, hasFire: false, onCooldown: true };
const fire = { streak: 3, hasFire: true, onCooldown: false };

describe('memberMood', () => {
  it.each([0, 0.34, 0.999])('roll %d picks from the matching pool', (roll) => {
    const at = (list: string[]) => list[Math.floor(roll * list.length)];
    expect(memberMood(cooldown, roll)).toEqual({ emoji: '❄', text: at(COOLDOWN_MESSAGES) });
    expect(memberMood(fire, roll)).toEqual({ emoji: '🔥', text: at(FIRE_MESSAGES) });
    expect(memberMood({ streak: 2, hasFire: false, onCooldown: false }, roll).text).toBe(at(TWO_HITS_MESSAGES));
    expect(memberMood({ streak: -2, hasFire: false, onCooldown: false }, roll).text).toBe(at(TWO_MISSES_MESSAGES));
  });

  it('roll near 1 stays inside every pool', () => {
    expect(memberMood(cooldown, 0.9999).text).toBe(COOLDOWN_MESSAGES.at(-1));
  });

  it('shows double fire from 6 hits in a row', () => {
    const mood = memberMood({ streak: 6, hasFire: true, onCooldown: false }, 0);
    expect(mood.emoji).toBe('🔥🔥');
    expect(mood.text).toBe(`6 pogodaka zaredom! ${DOUBLE_FIRE_MESSAGES[0]}`);
    expect(memberMood({ streak: 5, hasFire: true, onCooldown: false }, 0).emoji).toBe('🔥');
  });

  it('keeps the streak text for other statuses', () => {
    expect(memberMood({ streak: 0, hasFire: false, onCooldown: false }, 0.5).text).toBe('Čist list — bez niza.');
  });
});
