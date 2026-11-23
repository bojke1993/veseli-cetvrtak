import { useEffect, useMemo, useState } from 'react';
import type { RoundDetailDto } from '@api';

const STORAGE_PREFIX = 'vc-celebrated-';
/** A round won longer ago than this is history, not news: no confetti when browsing old rounds. */
export const CELEBRATE_WITHIN_MS = 24 * 60 * 60 * 1000;
const SHOW_MS = 4000;
const PIECES = 48;

/** Fallback when storage is blocked (private mode): remember for this page load only. */
const celebratedInMemory = new Set<number>();

function alreadyCelebrated(roundId: number): boolean {
  if (celebratedInMemory.has(roundId)) return true;
  try {
    return localStorage.getItem(STORAGE_PREFIX + roundId) !== null;
  } catch {
    return false;
  }
}

function markCelebrated(roundId: number): void {
  celebratedInMemory.add(roundId);
  try {
    localStorage.setItem(STORAGE_PREFIX + roundId, '1');
  } catch {
    /* storage unavailable: the in-memory mark is enough */
  }
}

/** FR-30: the ticket is won — resolved as won recently, or every counted pick is already certain. */
export function ticketJustWon(
  round: Pick<RoundDetailDto, 'status' | 'resolvedAt' | 'ticketAlive' | 'ticketChance'>,
  now: number,
): boolean {
  if (round.status === 'won') {
    const at = round.resolvedAt ? new Date(round.resolvedAt).getTime() : null;
    return at !== null && now - at <= CELEBRATE_WITHIN_MS;
  }
  return round.status === 'in_progress' && round.ticketAlive === true && round.ticketChance === 100;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** FR-30 — confetti + a short vibration, once per round and device (REQ-43.3, REQ-43.4). */
export function Celebration({ round }: { round: Pick<RoundDetailDto, 'id' | 'status' | 'resolvedAt' | 'ticketAlive' | 'ticketChance'> }) {
  const [show, setShow] = useState(false);
  const won = ticketJustWon(round, Date.now());

  useEffect(() => {
    if (!won || alreadyCelebrated(round.id)) return;
    markCelebrated(round.id);
    setShow(true);
    try {
      navigator.vibrate?.([120, 60, 220]);
    } catch {
      /* not supported */
    }
    const t = setTimeout(() => setShow(false), SHOW_MS);
    return () => clearTimeout(t);
  }, [won, round.id]);

  const reduced = prefersReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.2 + Math.random() * 1.6,
        rotate: Math.random() * 360,
        tone: i % 4,
      })),
    [],
  );
  if (!show) return null;
  return (
    <div className="celebration" aria-hidden={false}>
      <p className="celebration-banner" role="status">
        <span aria-hidden="true">🎉</span> Tiket je prošao! <span aria-hidden="true">🎉</span>
      </p>
      {!reduced && (
        <div className="confetti" aria-hidden="true">
          {pieces.map((p, i) => (
            <span
              key={i}
              className={`confetti-piece tone-${p.tone}`}
              style={{
                left: `${p.left}%`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                transform: `rotate(${p.rotate}deg)`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
