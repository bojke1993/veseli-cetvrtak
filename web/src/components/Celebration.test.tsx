import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Celebration, CELEBRATE_WITHIN_MS, ticketJustWon } from './Celebration';
import { TicketIndicator } from './LiveView';

const NOW = new Date('2026-11-20T22:00:00Z').getTime();
const base = { id: 1, status: 'in_progress' as const, resolvedAt: null, ticketAlive: true, ticketChance: 100 };

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FR-30 — proslava i šanse', () => {
  it('ticketJustWon: certain in progress, or won recently; old wins are not news', () => {
    expect(ticketJustWon(base, NOW)).toBe(true);
    expect(ticketJustWon({ ...base, ticketChance: 60 }, NOW)).toBe(false);
    expect(ticketJustWon({ ...base, status: 'won', resolvedAt: new Date(NOW - 3600_000).toISOString() }, NOW)).toBe(true);
    expect(ticketJustWon({ ...base, status: 'won', resolvedAt: new Date(NOW - CELEBRATE_WITHIN_MS - 1).toISOString() }, NOW)).toBe(false);
    expect(ticketJustWon({ ...base, status: 'lost' }, NOW)).toBe(false);
  });

  it('celebrates once per round and vibrates', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const { unmount } = render(<Celebration round={base} />);
    expect(screen.getByRole('status')).toHaveTextContent('Tiket je prošao!');
    expect(document.querySelectorAll('.confetti-piece').length).toBeGreaterThan(0);
    expect(vibrate).toHaveBeenCalledTimes(1);
    unmount();
    render(<Celebration round={base} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('reduced motion: banner without confetti', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }) as MediaQueryList);
    render(<Celebration round={{ ...base, id: 2 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Tiket je prošao!');
    expect(document.querySelector('.confetti')).toBeNull();
  });

  it('ticket indicator shows the rough chance only while undecided', () => {
    const { rerender } = render(<TicketIndicator round={{ ticketAlive: true, passingCount: 2, picks: [], ticketChance: 35 }} />);
    expect(screen.getByText('~35%')).toBeInTheDocument();
    expect(screen.getByText('(gruba procena)')).toBeInTheDocument();
    rerender(<TicketIndicator round={{ ticketAlive: true, passingCount: 4, picks: [], ticketChance: 100 }} />);
    expect(screen.queryByText(/Šanse/)).not.toBeInTheDocument();
    rerender(<TicketIndicator round={{ ticketAlive: false, passingCount: 1, picks: [], ticketChance: 0 }} />);
    expect(screen.getByText(/Tiket pao/)).toBeInTheDocument();
  });
});
