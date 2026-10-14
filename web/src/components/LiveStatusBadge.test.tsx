import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { LiveStatus } from '@api';
import { LiveStatusBadge } from './LiveStatusBadge';
import { LIVE_STATUS_META } from '../lib/format';

const CASES: Array<[LiveStatus, string, string]> = [
  ['not_started', 'Nije počelo', '◷'],
  ['passing', 'U prolazu', '▲'],
  ['failing', 'Nije u prolazu', '▼'],
  ['sure_hit', 'Sigurno pogođen', '✔'],
  ['sure_miss', 'Sigurno promašen', '✘'],
  ['not_entered', 'Nije ušao u igru', '⏸'],
  ['final_hit', 'Pogođen', '✔'],
  ['final_miss', 'Promašen', '✘'],
  ['void', 'Poništen', '–'],
];

describe('LiveStatusBadge', () => {
  it.each(CASES)('renders %s with text and icon (not colour alone)', (status, text, icon) => {
    const { container } = render(<LiveStatusBadge status={status} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    const iconEl = container.querySelector('.badge-icon');
    expect(iconEl).toHaveTextContent(icon);
    expect(iconEl).toHaveAttribute('aria-hidden', 'true');
    const badge = container.querySelector('.badge')!;
    expect(badge.className).toContain(`tone-${LIVE_STATUS_META[status].tone}`);
    expect(badge).toHaveAttribute('data-status', status);
  });

  it('uses distinct tones for passing vs failing', () => {
    expect(LIVE_STATUS_META.passing.tone).not.toBe(LIVE_STATUS_META.failing.tone);
    expect(LIVE_STATUS_META.sure_hit.icon).not.toBe(LIVE_STATUS_META.sure_miss.icon);
  });
});
