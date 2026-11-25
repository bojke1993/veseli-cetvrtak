import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { SanctionsResponse } from '@api';
import { RoundDetailPage } from './RoundDetailPage';
import DisciplinePage from './DisciplinePage';
import { RoundCard } from '../components/RoundCard';
import { ADMIN_ME, MEMBERS, mockFetch, renderWithProviders } from '../test/utils';
import { roundDetail, roundSummary } from '../test/fixtures';

const sanctions: SanctionsResponse = {
  items: [
    {
      id: 1, memberId: 2, kind: 'notice', status: 'active', roundId: 7, roundNumber: 7, reason: 'Nije na vreme uplatio tiket.',
      issuedBy: 1, issuedAt: '2026-11-25T10:00:00Z', escalation: false, consumedById: null, servedRoundId: null,
      servedRoundNumber: null, revokedAt: null, revokedBy: null, revokeReason: null,
    },
  ],
  warningsForSuspension: 2,
  noticesForWarning: 2,
};

afterEach(() => vi.unstubAllGlobals());

describe('BR-42 — ticket not placed, round note, notice', () => {
  it('round detail shows the note, no stake/win and the notice', async () => {
    const round = roundDetail({ status: 'lost', outcomeLabel: '3/4', ticketNotPlaced: true, note: 'Tozislav nije uplatio tiket.' });
    mockFetch({ '/auth/me': { me: null }, '/members': { members: MEMBERS }, '/rounds/7': { round }, '/sanctions': sanctions });
    renderWithProviders(<RoundDetailPage />, { route: '/kolo/7', path: '/kolo/:id' });
    expect(await screen.findByText('Tozislav nije uplatio tiket.')).toBeInTheDocument();
    expect(screen.getAllByText(/Tiket nije uplaćen/).length).toBeGreaterThan(0);
    expect(screen.getByText('nije uplaćeno')).toBeInTheDocument();
    expect(await screen.findByText(/upozorenje: Nije na vreme uplatio tiket\./)).toBeInTheDocument();
  });

  it('round card replaces money with "Tiket nije uplaćen"', () => {
    mockFetch({ '/auth/me': { me: null }, '/members': { members: MEMBERS } });
    renderWithProviders(<RoundCard round={roundSummary(7, { status: 'lost', ticketNotPlaced: true })} />);
    expect(screen.getByText('🚫 Tiket nije uplaćen')).toBeInTheDocument();
    expect(screen.queryByText(/^Uplata/)).not.toBeInTheDocument();
  });

  it('admin issues a notice (the default, mildest measure)', async () => {
    const fetch = mockFetch({
      '/auth/me': { me: ADMIN_ME },
      '/members': { members: MEMBERS },
      '/rounds': { items: [], total: 0 },
      '/sanctions': (_url: URL, init: RequestInit | undefined) =>
        init?.method === 'POST' ? { ...sanctions, createdIds: [1] } : sanctions,
    });
    renderWithProviders(<DisciplinePage />);
    expect(await screen.findByText('Upozorenje', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('aktivno')).toBeInTheDocument();
    expect(screen.getByLabelText(/Upozorenje/, { selector: 'input' })).toBeChecked();
    fireEvent.change(screen.getByLabelText('Član'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Obrazloženje'), { target: { value: 'Nije uplatio tiket.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Izreci meru' }));
    await waitFor(() => expect(screen.getByText(/Izrečeno: upozorenje\./)).toBeInTheDocument());
    const post = fetch.mock.calls.find(([u, i]) => String(u).endsWith('/sanctions') && i?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ memberId: 2, kind: 'notice' });
  });
});
