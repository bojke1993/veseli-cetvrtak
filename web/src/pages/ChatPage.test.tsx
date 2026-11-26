import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ChatMessagesResponse, ChatStateResponse, Me } from '@api';
import ChatPage from './ChatPage';
import { Layout } from '../components/Layout';
import { mergeMessages } from '../api/chat';
import { isEmojiOnly } from '../components/EmojiPicker';
import { formatAgo } from '../lib/format';
import { MEMBERS, calledPaths, mockFetch, renderWithProviders } from '../test/utils';

const TOZ_ME: Me = { memberId: 2, name: 'Tozislav', displayName: 'Tozislav', username: 'tozislav', isAdmin: false, mustChangePassword: false };

const state: ChatStateResponse = {
  presence: [
    { memberId: 1, online: true, lastSeenAt: null },
    { memberId: 2, online: true, lastSeenAt: null },
    { memberId: 3, online: false, lastSeenAt: new Date(Date.now() - 5 * 60_000).toISOString() },
    { memberId: 4, online: false, lastSeenAt: null },
  ],
  unread: 2,
  readId: 0,
};
const messages: ChatMessagesResponse = {
  messages: [
    { id: 1, memberId: 3, body: 'Larkin više 12,5?', createdAt: new Date().toISOString() },
    { id: 2, memberId: 2, body: 'Može 🔥', createdAt: new Date().toISOString() },
  ],
  hasMore: true,
};

afterEach(() => vi.unstubAllGlobals());

describe('EKR-15 — chat (FR-31)', () => {
  it('shows who is online, messages (own on the right) and marks them read', async () => {
    const fetch = mockFetch({
      '/auth/me': { me: TOZ_ME },
      '/members': { members: MEMBERS },
      '/chat/state': state,
      '/chat/messages': messages,
      '/chat/read': { ...state, unread: 0, readId: 2 },
    });
    renderWithProviders(<ChatPage />);
    expect(await screen.findByText('Larkin više 12,5?')).toBeInTheDocument();
    expect(screen.getByText('Može 🔥').closest('.chat-msg')).toHaveClass('is-mine');
    expect(screen.getByText('Larkin više 12,5?').closest('.chat-msg')).not.toHaveClass('is-mine');
    expect(screen.getByText('Lakićević', { selector: '.chat-author' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Starije poruke' })).toBeInTheDocument();

    expect(await screen.findByText('viđen pre 5 min')).toBeInTheDocument();
    expect(screen.getAllByText('online')).toHaveLength(2);
    expect(screen.getByText('offline')).toBeInTheDocument();
    // Own message can be deleted, someone else's cannot (not admin).
    expect(screen.getByRole('button', { name: /Obriši poruku: Može/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Obriši poruku: Larkin/ })).not.toBeInTheDocument();

    await waitFor(() => expect(calledPaths(fetch)).toContain('/api/chat/read'));
    const readCall = fetch.mock.calls.find(([u]) => String(u).endsWith('/chat/read'))!;
    expect(JSON.parse(String(readCall[1]!.body))).toEqual({ id: 2 });
  });

  it('sends with Enter and clears the input', async () => {
    const fetch = mockFetch({
      '/auth/me': { me: TOZ_ME },
      '/members': { members: MEMBERS },
      '/chat/state': state,
      '/chat/read': state,
      '/chat/messages': (_url: URL, init: RequestInit | undefined) =>
        init?.method === 'POST'
          ? { message: { id: 3, memberId: 2, body: 'Idemo!', createdAt: new Date().toISOString() } }
          : messages,
    });
    renderWithProviders(<ChatPage />);
    const input = await screen.findByLabelText('Poruka');
    fireEvent.change(input, { target: { value: '  Idemo!  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('Idemo!')).toBeInTheDocument();
    const post = fetch.mock.calls.find(([u, i]) => String(u).endsWith('/chat/messages') && i?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ body: 'Idemo!' });
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('inserts emoji from the picker and shows emoji-only messages large', async () => {
    mockFetch({
      '/auth/me': { me: TOZ_ME },
      '/members': { members: MEMBERS },
      '/chat/state': state,
      '/chat/read': state,
      '/chat/messages': { messages: [...messages.messages, { id: 3, memberId: 1, body: '🔥🔥', createdAt: new Date().toISOString() }], hasMore: false },
    });
    renderWithProviders(<ChatPage />);
    expect((await screen.findByText('🔥🔥')).closest('.chat-bubble')).toHaveClass('is-emoji');
    expect(screen.getByText('Može 🔥').closest('.chat-bubble')).not.toHaveClass('is-emoji');

    const input = screen.getByLabelText('Poruka');
    fireEvent.change(input, { target: { value: 'Ajmo ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Smajliji' }));
    fireEvent.click(screen.getByRole('button', { name: '🏀' }));
    expect(input).toHaveValue('Ajmo 🏀');
    // The picked emoji shows up under "recently used" next time.
    fireEvent.click(screen.getByRole('button', { name: 'Smajliji' }));
    fireEvent.click(screen.getByRole('button', { name: 'Smajliji' }));
    expect(screen.getByRole('region', { name: 'Skoro korišćeni' })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('chat-open');
  });

  it('the Chat menu item with the unread count exists only for members', async () => {
    mockFetch({ '/auth/me': { me: TOZ_ME }, '/members': { members: MEMBERS }, '/chat/state': state });
    const member = renderWithProviders(<Layout />);
    expect(await screen.findByLabelText('2 nepročitanih poruka')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Chat/ })).toHaveAttribute('href', '/chat');
    member.unmount();

    const guestFetch = mockFetch({ '/auth/me': { me: null }, '/members': { members: MEMBERS } });
    renderWithProviders(<Layout />);
    expect(await screen.findByRole('link', { name: 'Prijavi se' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Chat/ })).not.toBeInTheDocument();
    expect(calledPaths(guestFetch).some((p) => p.startsWith('/api/chat'))).toBe(false);
  });
});

describe('chat helpers', () => {
  it('detects emoji-only messages', () => {
    expect(isEmojiOnly('😂')).toBe(true);
    expect(isEmojiOnly(' 👍🏻 🔥 ')).toBe(true);
    expect(isEmojiOnly('🔥🔥🔥🔥')).toBe(false);
    expect(isEmojiOnly('Može 🔥')).toBe(false);
    expect(isEmojiOnly('123')).toBe(false);
  });

  it('merges messages by id, oldest first', () => {
    const a = { id: 2, memberId: 1, body: 'b', createdAt: '' };
    const b = { id: 1, memberId: 1, body: 'a', createdAt: '' };
    expect(mergeMessages([a], [b, a]).map((m) => m.id)).toEqual([1, 2]);
  });

  it('formats "last seen"', () => {
    const now = Date.parse('2026-11-24T18:00:00Z'); // 19:00 in Belgrade
    expect(formatAgo('2026-11-24T17:59:40Z', now)).toBe('upravo');
    expect(formatAgo('2026-11-24T17:15:00Z', now)).toBe('pre 45 min');
    expect(formatAgo('2026-11-24T14:00:00Z', now)).toBe('pre 4 h');
    expect(formatAgo('2026-11-23T19:30:00Z', now)).toBe('juče u 20:30');
    expect(formatAgo('2026-11-20T10:00:00Z', now)).toBe('20.11.2026.');
  });
});
