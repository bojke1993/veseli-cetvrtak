import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { PlayerFormDto } from '@api';
import { FormBars, PlayerForm } from './PlayerForm';
import { mockFetch, renderWithProviders } from '../test/utils';

afterEach(() => vi.unstubAllGlobals());

const form: PlayerFormDto = {
  playerId: 7,
  games: [
    { gameId: 1, gameDay: '2026-10-01', opponent: 'Real Madrid', home: false, points: 8, dnp: false },
    { gameId: 2, gameDay: '2026-10-08', opponent: 'Milan', home: true, points: 0, dnp: true },
    { gameId: 3, gameDay: '2026-10-15', opponent: 'Barcelona', home: true, points: 17, dnp: false },
  ],
  average: 12.5,
  averageMinutes: 24,
  ourPicks: 3,
  ourHits: 2,
};

describe('FR-29 — forma igrača', () => {
  it('draws games chronologically: oldest left, newest right (BR-40)', () => {
    renderWithProviders(<FormBars form={form} />);
    const list = screen.getByRole('list', { name: /od najstarije do najnovije/ });
    const values = within(list)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.form-bar-value')!.textContent);
    expect(values).toEqual(['8', 'DNP', '17']);
    expect(within(list).getAllByRole('listitem').at(-1)).toHaveClass('is-latest');
  });

  it('shows the average, games over the line and our history', async () => {
    mockFetch({ '/players/7/form': { form } });
    renderWithProviders(<PlayerForm playerId={7} line={10.5} />);
    expect(await screen.findByText('prosek 12,5')).toBeInTheDocument();
    expect(screen.getByText(/Iznad 10,5 u/)).toHaveTextContent('Iznad 10,5 u 1 od 2.');
    expect(screen.getByText(/Birali smo ga 3×, 2 pogođena/)).toBeInTheDocument();
    expect(document.querySelectorAll('.form-bar.is-over')).toHaveLength(1);
  });

  it('empty state', async () => {
    mockFetch({ '/players/7/form': { form: { ...form, games: [], average: null, ourPicks: 0, ourHits: 0 } } });
    renderWithProviders(<PlayerForm playerId={7} />);
    expect(await screen.findByText('Nema podataka o formi.')).toBeInTheDocument();
    expect(screen.getByText('Nismo ga još birali.')).toBeInTheDocument();
  });
});
