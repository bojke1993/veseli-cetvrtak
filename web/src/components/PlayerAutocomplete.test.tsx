import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlayerSearchItem, PlayerSearchResponse } from '@api';
import { PlayerAutocomplete } from './PlayerAutocomplete';
import { calledPaths, mockFetch, renderWithProviders } from '../test/utils';
import { GAME, PLAYER } from '../test/fixtures';

const ITEMS: PlayerSearchItem[] = [
  { ...PLAYER, game: GAME, selectable: true, note: null },
  {
    ...PLAYER,
    id: 101,
    fullName: 'Saša Avramović',
    club: { code: 'ZAL', name: 'Žalgiris', shortName: 'ZAL', crestUrl: null },
    game: null,
    selectable: false,
    note: 'Ne igra 15.10.',
  },
];

function setup(onSelect = vi.fn()) {
  const fetchMock = mockFetch({
    '/auth/me': { me: null },
    '/players/search': (): PlayerSearchResponse => ({ items: ITEMS }),
  });
  renderWithProviders(<PlayerAutocomplete day="2026-10-15" roundId={7} onSelect={onSelect} />);
  return { fetchMock, onSelect };
}

const searchCalls = (f: ReturnType<typeof mockFetch>) => calledPaths(f).filter((p) => p.startsWith('/api/players/search'));

afterEach(() => vi.unstubAllGlobals());

describe('PlayerAutocomplete', () => {
  it('waits for 2 characters and debounces typing into a single request', async () => {
    const user = userEvent.setup();
    const { fetchMock } = setup();
    const input = screen.getByRole('combobox', { name: 'Igrač' });

    await user.type(input, 's');
    await new Promise((r) => setTimeout(r, 250));
    expect(searchCalls(fetchMock)).toHaveLength(0);
    expect(screen.getByText('Ukucaj bar 2 slova.')).toBeInTheDocument();

    await user.type(input, 'asa');
    await screen.findByText('Saša Marković');
    const calls = searchCalls(fetchMock);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('q=sasa');
    expect(calls[0]).toContain('day=2026-10-15');
    expect(calls[0]).toContain('roundId=7');
  });

  it('shows non-selectable players greyed with a note and ignores clicks on them', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    await user.type(screen.getByRole('combobox'), 'sasa');
    const disabled = (await screen.findByText('Saša Avramović')).closest('[role="option"]')!;
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    expect(disabled).toHaveClass('is-disabled');
    expect(screen.getByText('Ne igra 15.10.')).toBeInTheDocument();

    await user.click(disabled);
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(screen.getByText('Saša Marković'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0].id).toBe(100);
  });

  it('supports keyboard selection and skips non-selectable items', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    const input = screen.getByRole('combobox');
    await user.type(input, 'sasa');
    await screen.findByText('Saša Marković');
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    // Second ArrowDown wraps around past the disabled item back to the first.
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0].id).toBe(100);
  });

  it('shows at most 10 suggestions', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 14 }, (_, i) => ({ ...ITEMS[0]!, id: 200 + i, fullName: `Igrač ${i}` }));
    mockFetch({ '/auth/me': { me: null }, '/players/search': { items: many } });
    renderWithProviders(<PlayerAutocomplete day="2026-10-15" onSelect={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'ig');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(10));
  });
});
