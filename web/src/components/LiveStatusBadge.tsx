import type { LiveStatus, PickResult, RoundStatus } from '@api';
import { LIVE_STATUS_META, RESULT_ICON, RESULT_LABEL, ROUND_STATUS_LABEL } from '../lib/format';

/** Live pick status: colour + icon + text (never colour alone, REQ-13.8). */
export function LiveStatusBadge({ status }: { status: LiveStatus }) {
  const meta = LIVE_STATUS_META[status];
  return (
    <span className={`badge tone-${meta.tone}`} data-status={status}>
      <span className="badge-icon" aria-hidden="true">
        {meta.icon}
      </span>
      <span>{meta.label}</span>
    </span>
  );
}

export function ResultBadge({ result }: { result: PickResult | null }) {
  if (!result) return <span className="badge tone-neutral">Nerazrešen</span>;
  const tone = result === 'hit' ? 'great' : result === 'miss' ? 'awful' : 'muted';
  return (
    <span className={`badge tone-${tone}`}>
      <span className="badge-icon" aria-hidden="true">
        {RESULT_ICON[result]}
      </span>
      <span>{RESULT_LABEL[result]}</span>
    </span>
  );
}

/** Compact icon-only result with an accessible label (lists of last 10 etc.). */
export function ResultIcon({ result }: { result: PickResult | null }) {
  const tone = result === 'hit' ? 'great' : result === 'miss' ? 'awful' : 'muted';
  const label = result ? RESULT_LABEL[result] : 'Nerazrešen';
  return (
    <span className={`result-icon tone-${tone}`} role="img" aria-label={label} title={label}>
      {result ? RESULT_ICON[result] : '·'}
    </span>
  );
}

const ROUND_TONE: Record<RoundStatus, string> = {
  open: 'neutral',
  locked: 'neutral',
  in_progress: 'good',
  won: 'great',
  lost: 'awful',
  void: 'muted',
};
const ROUND_ICON: Record<RoundStatus, string> = { open: '✎', locked: '🔒', in_progress: '●', won: '✔', lost: '✘', void: '–' };

export function RoundStatusBadge({ status }: { status: RoundStatus }) {
  return (
    <span className={`badge tone-${ROUND_TONE[status]}`}>
      <span className="badge-icon" aria-hidden="true">
        {ROUND_ICON[status]}
      </span>
      <span>{ROUND_STATUS_LABEL[status]}</span>
    </span>
  );
}
