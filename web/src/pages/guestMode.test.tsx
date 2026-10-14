import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { CurrentRoundResponse, Me } from '@api';
import { HomePage } from './HomePage';
import { CurrentRoundPage } from './CurrentRoundPage';
import { RoundDetailPage } from './RoundDetailPage';
import { ADMIN_ME, MEMBERS, mockFetch, renderWithProviders } from '../test/utils';
import { roundDetail } from '../test/fixtures';

const overview = {
  stats: {
    totalStaked: 1000,
    totalWon: 0,
    balance: -1000,
    roiPercent: -100,
    rounds: 2,
    wonRounds: 0,
    wonPercent: 0,
    distribution: [],
    biggestWin: null,
    longestLosingRun: 2,
    balanceSeries: [],
    team: { picks: 0, hits: 0, misses: 0, voids: 0, hitPercent: null, blames: 0 },
    hasProvisional: false,
  },
};

function api(me: Me | null, current: CurrentRoundResponse) {
  return mockFetch({
    '/auth/me': { me },
    '/members': { members: MEMBERS },
    '/rounds/current': current,
    '/rounds/7': { round: current.round },
    '/stats/overview': overview,
    '/stats/blame': { rows: [] },
    '/games/days': { days: [] },
    '/players/search': { items: [] },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('guest mode (REQ-02) hides mutating controls', () => {
  it('home: guest sees "Prijavi se" and no "Novo kolo"', async () => {
    api(null, { round: null, canOpenNew: true, reasonCannotOpen: null });
    renderWithProviders(<HomePage />);
    expect(await screen.findByText('Nema aktivnog kola')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Prijavi se' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Novo kolo/)).not.toBeInTheDocument();
  });

  it('home: admin sees "Novo kolo"', async () => {
    api(ADMIN_ME, { round: null, canOpenNew: true, reasonCannotOpen: null });
    renderWithProviders(<HomePage />);
    expect(await screen.findByRole('link', { name: /Novo kolo/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Prijavi se' })).not.toBeInTheDocument();
  });

  it('home: admin sees disabled "Novo kolo" with the reason', async () => {
    api(ADMIN_ME, { round: roundDetail({ status: 'lost', outcomeLabel: '3/4' }), canOpenNew: false, reasonCannotOpen: 'Prethodno kolo nije razrešeno.' });
    renderWithProviders(<HomePage />);
    expect(await screen.findByRole('button', { name: /Novo kolo/ })).toBeDisabled();
    expect(screen.getByText('Prethodno kolo nije razrešeno.')).toBeInTheDocument();
  });

  it('open round: guest gets a read-only editor', async () => {
    api(null, { round: roundDetail(), canOpenNew: false, reasonCannotOpen: null });
    renderWithProviders(<CurrentRoundPage />, { route: '/kolo' });
    expect(await screen.findByRole('heading', { name: 'Kolo #7' })).toBeInTheDocument();
    expect(screen.getByText('Saša Marković')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Prijavi se' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Zaključi glasanje/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Obriši kolo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dodaj predlog/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Predloži svoj tip/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Uplata')).not.toBeInTheDocument();
  });

  it('open round: admin gets the editor with a disabled lock button listing what is missing', async () => {
    api(ADMIN_ME, { round: roundDetail(), canOpenNew: false, reasonCannotOpen: null });
    renderWithProviders(<CurrentRoundPage />, { route: '/kolo' });
    expect(await screen.findByRole('button', { name: /Zaključi glasanje/ })).toBeDisabled();
    expect(screen.getByText('Tip: Simara')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Obriši kolo/ })).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Uplata')).toBeInTheDocument();
  });

  it('round detail: guest sees no admin menu and no audit section', async () => {
    api(null, { round: roundDetail({ status: 'lost', outcomeLabel: '3/4', canUnlock: true }), canOpenNew: true, reasonCannotOpen: null });
    renderWithProviders(<RoundDetailPage />, { route: '/kolo/7', path: '/kolo/:id' });
    expect(await screen.findByRole('heading', { name: 'Kolo #7' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Admin akcije' })).not.toBeInTheDocument();
    expect(screen.queryByText('Istorija izmena')).not.toBeInTheDocument();
  });

  it('round detail: admin sees the "⋯" menu', async () => {
    api(ADMIN_ME, { round: roundDetail({ status: 'lost', outcomeLabel: '3/4' }), canOpenNew: true, reasonCannotOpen: null });
    renderWithProviders(<RoundDetailPage />, { route: '/kolo/7', path: '/kolo/:id' });
    expect(await screen.findByRole('button', { name: 'Admin akcije' })).toBeInTheDocument();
    expect(screen.getByText('Istorija izmena')).toBeInTheDocument();
  });
});
