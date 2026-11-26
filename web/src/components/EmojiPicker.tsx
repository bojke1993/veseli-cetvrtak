import { useEffect, useRef, useState } from 'react';

const RECENT_KEY = 'vc-emoji-recent';
const RECENT_MAX = 16;

const GROUPS: Array<{ label: string; emojis: string[] }> = [
  {
    label: 'Lica',
    emojis: [
      '😀', '😁', '😂', '🤣', '😅', '😊', '😉', '😍', '😘', '😎', '🤩', '🥳',
      '🤔', '🤨', '😐', '🙄', '😏', '😬', '🤐', '😴', '🤤', '😷', '🤯', '🥶',
      '🥵', '😵', '🤠', '🤓', '😇', '🙃', '😢', '😭', '😤', '😡', '🤬', '😱',
      '😳', '🥺', '😈', '💀', '🤡', '💩',
    ],
  },
  {
    label: 'Ruke',
    emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤙', '👏', '🙌', '🙏', '💪', '👊', '🤝', '👋', '🫡', '🤷', '🤦', '👀'],
  },
  {
    label: 'Igra',
    emojis: [
      '🏀', '⛹️', '🏆', '🥇', '🎯', '🎉', '🎊', '🍾', '🍻', '🍺', '🥂', '💰',
      '💸', '🤑', '📈', '📉', '🔥', '❄️', '🧊', '⚡', '💯', '✅', '❌', '⚠️',
      '🟨', '🟥', '🍀', '🎰', '🎲', '🚀', '💣', '🧨',
    ],
  },
  {
    label: 'Ostalo',
    emojis: ['❤️', '💙', '💚', '💛', '🖤', '💔', '⭐', '🌟', '☀️', '🌧️', '🍕', '🍔', '🍖', '☕', '🚗', '⏰', '📺', '🎮', '🐐', '🦆', '🐔', '🤖', '👑', '🙈'],
  },
];

function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecent(emoji: string) {
  const next = [emoji, ...loadRecent().filter((e) => e !== emoji)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** Emoji button + panel for the chat composer (BR-41: text and emoji only). */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setRecent(loadRecent());
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (emoji: string) => {
    saveRecent(emoji);
    onPick(emoji);
  };

  const groups = recent.length ? [{ label: 'Skoro korišćeni', emojis: recent }, ...GROUPS] : GROUPS;

  return (
    <div className="emoji-wrap" ref={wrap}>
      <button
        type="button"
        className="emoji-toggle"
        aria-label="Smajliji"
        aria-expanded={open}
        aria-controls="emoji-panel"
        title="Smajliji"
        onClick={() => setOpen((o) => !o)}
      >
        😊
      </button>
      {open && (
        <div id="emoji-panel" className="emoji-panel" role="dialog" aria-label="Izbor smajlija">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="emoji-group">{g.label}</h2>
              <div className="emoji-grid">
                {g.emojis.map((e) => (
                  <button
                    key={g.label + e}
                    type="button"
                    className="emoji-btn"
                    // Keep focus (and the mobile keyboard state) where it is.
                    onPointerDown={(ev) => ev.preventDefault()}
                    onClick={() => pick(e)}
                    aria-label={e}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** True when the text is only 1–3 emoji (shown larger in the chat). */
export function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 40) return false;
  if (!/^[\p{Extended_Pictographic}\p{Emoji_Component}‍️\s]+$/u.test(t)) return false;
  if (!/\p{Extended_Pictographic}/u.test(t)) return false;
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  const count = Seg ? [...new Seg(undefined, { granularity: 'grapheme' }).segment(t.replace(/\s+/g, ''))].length : t.length / 2;
  return count <= 3;
}
