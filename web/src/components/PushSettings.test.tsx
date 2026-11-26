import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PushPrompt, PushSettings } from './PushSettings';
import { isChatSoundOn } from '../lib/chatSound';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('P-28 — notification settings', () => {
  it('without Web Push support says so and still offers the sound toggle', () => {
    render(<PushSettings />);
    expect(screen.getByText('Ovaj pregledač ne podržava obaveštenja.')).toBeInTheDocument();
    const sound = screen.getByRole('checkbox', { name: /Zvuk nove poruke/ });
    expect(sound).toBeChecked();
    fireEvent.click(sound);
    expect(isChatSoundOn()).toBe(false);
  });

  it('on iPhone outside the home screen explains how to install, once', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari');
    const { unmount } = render(<PushPrompt />);
    expect(screen.getByText(/Dodaj na početni ekran/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'U redu' }));
    expect(screen.queryByText(/Dodaj na početni ekran/)).not.toBeInTheDocument();
    unmount();
    render(<PushPrompt />);
    expect(screen.queryByText(/Dodaj na početni ekran/)).not.toBeInTheDocument();
  });

  it('shows no chat prompt where push is unsupported', () => {
    const { container } = render(<PushPrompt />);
    expect(container).toBeEmptyDOMElement();
  });
});
