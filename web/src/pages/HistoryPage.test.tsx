import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RoundsResponse } from '@api';
import { HistoryPage, queryFromParams } from './HistoryPage';
import { calledPaths, MEMBERS, mockFetch, renderWithProviders } from '../test/utils';
import { roundSummary } from '../test/fixtures';

function setup(route: string, items = [roundSummary(3), roundSummary(2)]) {
  return mockFetch({
    '/auth/me': { me: null },
    '/members': { members: MEMBERS },
    '/stats/seasons': { seasons: [{ code: 'E2026', name: '2026/27' }, { code: 'E2025', name: '2025/26' }], current: 'E2026' },
    '/rounds': (url: URL): RoundsResponse => ({ items, page: Number(url.searchParams.get('page') ?? 1), pageSize: 20, total: items.length }),
  });
}

const roundsCalls = (f: ReturnType<typeof mockFetch>) => calledPaths(f).filter((p) => p.startsWith('/api/rounds'));
const location = () => screen.getByTestId('location').textContent ?? '';

afterEach(() => vi.unstubAllGlobals());

describe('queryFromParams', () => {
  it('maps URL params to the API query and drops invalid values', () => {
    const q = queryFromParams(new URLSearchParams('season=E2025&status=won&outcome=3/4&member=2&memberFilter=blame&direction=under&teamPick=1&page=3&status2=x'));
    expect(q).toEqual({ season: 'E2025', status: 'won', outcome: '3/4', member: 2, memberFilter: 'blame', direction: 'under', teamPick: true, page: 3 });
    expect(queryFromParams(new URLSearchParams('status=bogus&memberFilter=hit'))).toEqual({ season: 'all', page: 1 });
  });
});

describe('HistoryPage filters ↔ URL', () => {
  it('reads filters from the URL, shows chips and sends them to the API', async () => {
    const f = setup('/istorija?season=E2025&status=won&member=3&memberFilter=blame');
    renderWithProviders(<HistoryPage />, { route: '/istorija?season=E2025&status=won&member=3&memberFilter=blame' });
    expect(await screen.findAllByText('Kolo #3')).not.toHaveLength(0);
    const call = roundsCalls(f)[0]!;
    expect(call).toContain('season=E2025');
    expect(call).toContain('status=won');
    expect(call).toContain('member=3');
    expect(call).toContain('memberFilter=blame');
    expect(screen.getByText('Status: Dobitan')).toBeInTheDocument();
    expect(await screen.findByText('Član: Lakićević')).toBeInTheDocument();
    expect(screen.getByText('Član blejm')).toBeInTheDocument();
  });

  it('removing a chip updates the URL and refetches without that filter', async () => {
    const user = userEvent.setup();
    const f = setup('');
    renderWithProviders(<HistoryPage />, { route: '/istorija?status=won&direction=over&page=2' });
    await screen.findByText('Status: Dobitan');
    await user.click(screen.getByRole('button', { name: 'Ukloni filter: Status: Dobitan' }));
    await waitFor(() => expect(location()).toBe('/istorija?direction=over'));
    await waitFor(() => {
      const last = roundsCalls(f).at(-1)!;
      expect(last).not.toContain('status=');
      expect(last).toContain('direction=over');
      expect(last).toContain('page=1');
    });
  });

  it('changing a filter in the panel writes it to the URL', async () => {
    const user = userEvent.setup();
    setup('');
    renderWithProviders(<HistoryPage />, { route: '/istorija' });
    await user.click(screen.getByRole('button', { name: /Filteri/ }));
    await user.selectOptions(screen.getByLabelText('Smer'), 'under');
    await waitFor(() => expect(location()).toBe('/istorija?direction=under'));
    await user.click(screen.getByLabelText(/Samo kola sa tipom ekipe/));
    await waitFor(() => expect(location()).toBe('/istorija?direction=under&teamPick=1'));
    expect(screen.getByText('Smer: Manje')).toBeInTheDocument();
  });

  it('empty state offers "Obriši filtere" which clears the URL', async () => {
    const user = userEvent.setup();
    setup('', []);
    renderWithProviders(<HistoryPage />, { route: '/istorija?outcome=4/4' });
    expect(await screen.findByText('Nema kola za izabrane filtere')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Obriši filtere' });
    await user.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(location()).toBe('/istorija'));
  });
});
