import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Presence } from '../../src/chat/presence.js';
import { normalizeBody } from '../../src/chat/service.js';

describe('Presence (BR-41)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('announces online once per member and offline only after the grace period', () => {
    const changes: Array<[number, boolean]> = [];
    const p = new Presence((id, online) => changes.push([id, online]), 30_000);

    p.connect(2);
    p.connect(2); // second tab
    expect(changes).toEqual([[2, true]]);
    p.disconnect(2);
    expect(p.isOnline(2)).toBe(true);
    p.disconnect(2);
    expect(p.isOnline(2)).toBe(true); // still within grace
    vi.advanceTimersByTime(29_000);
    expect(changes).toEqual([[2, true]]);
    vi.advanceTimersByTime(1_000);
    expect(changes).toEqual([
      [2, true],
      [2, false],
    ]);
    expect(p.isOnline(2)).toBe(false);
  });

  it('a reconnect within the grace period is silent', () => {
    const changes: Array<[number, boolean]> = [];
    const p = new Presence((id, online) => changes.push([id, online]), 30_000);
    p.connect(3);
    p.disconnect(3);
    vi.advanceTimersByTime(5_000);
    p.connect(3);
    vi.advanceTimersByTime(60_000);
    expect(changes).toEqual([[3, true]]);
    expect(p.isOnline(3)).toBe(true);
    p.close();
  });
});

describe('normalizeBody', () => {
  it('trims the ends and keeps inner line breaks', () => {
    expect(normalizeBody('  \r\nćao\r\nekipo 🔥 \n ')).toBe('ćao\nekipo 🔥');
    expect(normalizeBody(' \n\t ')).toBe('');
  });
});
