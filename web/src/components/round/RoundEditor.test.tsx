import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoundEditor } from './RoundEditor';
import { ADMIN_ME, MEMBERS, mockFetch, renderWithProviders } from '../../test/utils';
import { roundDetail } from '../../test/fixtures';
import { ODDS_ERROR } from '../../lib/format';

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const round = roundDetail();
  const fetchMock = mockFetch({
    '/auth/me': { me: ADMIN_ME },
    '/members': { members: MEMBERS },
    '/games/days': { days: [] },
    '/rounds/7': (_url: URL, init?: RequestInit) => {
      if (init?.method && init.method !== 'GET') {
        const body = init.body ? JSON.parse(String(init.body)) : {};
        return { round: { ...round, picks: round.picks.map((p) => (p.slot === 1 ? { ...p, line: body.line, direction: body.direction } : p)) } };
      }
      return { round };
    },
  });
  renderWithProviders(<RoundEditor round={round} />);
  return { fetchMock };
}

const mutations = (f: ReturnType<typeof mockFetch>) => f.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET');

describe('RoundEditor autosave', () => {
  it('rejects whole-number lines client-side and saves valid x,5 lines with the CSRF header', async () => {
    const user = userEvent.setup();
    const { fetchMock } = setup();
    await screen.findAllByLabelText('Granica'); // admin form appears once /auth/me resolves
    const card = screen.getByRole('article', { name: 'Tip 1' });
    const line = within(card).getByLabelText('Granica');
    expect(line).toHaveAttribute('inputmode', 'decimal');

    await user.clear(line);
    await user.type(line, '15');
    await user.tab();
    expect(within(card).getByText('Dozvoljene su samo granice x,5')).toBeInTheDocument();
    expect(mutations(fetchMock)).toHaveLength(0);

    await user.clear(line);
    await user.type(line, '16,5');
    await user.tab();
    // Nothing is saved until the mandatory odds are entered.
    expect(mutations(fetchMock)).toHaveLength(0);
    await user.type(within(card).getByLabelText('Kvota'), '1,85');
    await user.tab();
    await waitFor(() => expect(mutations(fetchMock)).toHaveLength(1));
    const [url, init] = mutations(fetchMock)[0]!;
    expect(String(url)).toBe('/api/rounds/7/picks/1');
    expect(init!.method).toBe('PUT');
    expect((init!.headers as Record<string, string>)['X-Requested-With']).toBe('vc');
    expect(JSON.parse(String(init!.body))).toEqual({ playerId: 100, line: 16.5, direction: 'over', odds: 1.85 });
    expect(await screen.findByText('✔ Sačuvano')).toBeInTheDocument();
  });

  it('marks pick odds as required and shows total odds as derived, not editable', async () => {
    setup();
    const [odds] = await screen.findAllByLabelText('Kvota');
    expect(odds).toHaveAttribute('aria-required', 'true');
    expect(screen.getAllByText('Obavezna — tip se čuva tek sa kvotom').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Ukupna kvota')).not.toBeInTheDocument();
    expect(screen.getByText('Računa se automatski — unete kvote: 0/4')).toBeInTheDocument();
  });

  it('rejects odds below 1,01 without saving', async () => {
    const user = userEvent.setup();
    const { fetchMock } = setup();
    await screen.findAllByLabelText('Kvota');
    const card = screen.getByRole('article', { name: 'Tip 1' });
    await user.type(within(card).getByLabelText('Kvota'), '1');
    await user.tab();
    expect(within(card).getByText(ODDS_ERROR)).toBeInTheDocument();
    expect(mutations(fetchMock)).toHaveLength(0);
  });
});
