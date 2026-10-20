import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('ThemeToggle', () => {
  it('cycles system → light → dark → system and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: /Tema: sistemska/ });
    expect(document.documentElement.dataset.theme).toBeUndefined();

    await user.click(btn);
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(btn);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('vc-theme')).toBe('dark');

    unmount();
    render(<ThemeToggle />);
    const again = screen.getByRole('button', { name: /Tema: tamna/ });
    await user.click(again);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('vc-theme')).toBeNull();
  });
});
