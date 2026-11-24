import type { BadgeCode } from '@api';
import { BADGE_META, BADGE_ORDER } from '../lib/records';

/** BR-38 — list of every badge and what it means; with `earned`, marks which ones the member has. */
export function BadgeGuide({ earned }: { earned?: BadgeCode[] }) {
  const have = new Set(earned ?? []);
  return (
    <ul className="badge-guide">
      {BADGE_ORDER.map((code) => {
        const meta = BADGE_META[code];
        const owned = earned ? have.has(code) : null;
        return (
          <li key={code} className={owned === false ? 'badge-guide-missing' : undefined}>
            <span className="badge-guide-emoji" aria-hidden="true">
              {meta.emoji}
            </span>
            <span>
              <strong>{meta.label}</strong>
              {owned === true && <span className="badge-guide-owned"> ✔ osvojen</span>}
              {owned === false && <span className="sr-only"> (nije osvojen)</span>}
              <br />
              <span className="small muted">{meta.rule}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
