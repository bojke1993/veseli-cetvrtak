import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { TeamRecordDto } from '@api';
import { HallOfFame } from './StatsPage';
import { BadgeList } from './MemberProfilePage';
import { recordValue } from '../lib/records';
import { MEMBERS, mockFetch, renderWithProviders } from '../test/utils';

afterEach(() => vi.unstubAllGlobals());

describe('FR-28 — Kuća slavnih i bedževi', () => {
  it('formats record values by kind', () => {
    expect(recordValue({ code: 'biggest_win', value: 12000 })).toMatch(/12\.000,00/);
    expect(recordValue({ code: 'top_pick_odds', value: 2.5 })).toBe('2,50');
    expect(recordValue({ code: 'biggest_margin', value: 9.5 })).toBe('+9,5 poena');
    expect(recordValue({ code: 'longest_hit_streak', value: 6 })).toBe('6 zaredom');
  });

  it('lists records with member, player and a link to the round', async () => {
    mockFetch({ '/members': { members: MEMBERS } });
    const records: TeamRecordDto[] = [
      { code: 'top_pick_odds', value: 2.4, memberId: 3, roundId: 11, roundNumber: 5, playerName: 'Shane Larkin' },
      { code: 'costliest_blame', value: 8000, memberId: 'team', roundId: 12, roundNumber: 6, playerName: 'Nick Calathes' },
    ];
    renderWithProviders(<HallOfFame records={records} />);
    expect(screen.getByText('Najveća kvota pogođenog tipa')).toBeInTheDocument();
    expect(await screen.findByText(/Lakićević · Shane Larkin/)).toBeInTheDocument();
    expect(screen.getByText(/Ekipa · Nick Calathes/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'kolo #5' })).toHaveAttribute('href', '/kolo/11');
  });

  it('shows an empty state without records', () => {
    mockFetch({ '/members': { members: MEMBERS } });
    renderWithProviders(<HallOfFame records={[]} />);
    expect(screen.getByText('Još nema rekorda.')).toBeInTheDocument();
  });

  it('renders badges with count and an accessible description', () => {
    renderWithProviders(
      <BadgeList
        badges={[
          { code: 'sniper', count: 2, firstRoundId: 3, firstRoundNumber: 7 },
          { code: 'near_miss', count: 1, firstRoundId: 4, firstRoundNumber: 9 },
        ]}
      />,
    );
    expect(screen.getByText('Snajper')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();
    expect(screen.getByText(/Promašaj za pola poena, prvi put u kolu #9/)).toBeInTheDocument();
  });
});
