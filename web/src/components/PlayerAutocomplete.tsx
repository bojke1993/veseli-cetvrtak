import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { PlayerSearchItem } from '@api';
import { usePlayerSearch } from '../api/queries';
import { useDebounce } from '../hooks/useDebounce';
import { formatTime } from '../lib/format';
import { Avatar, gameLabel } from './PlayerInfo';

export const SEARCH_DEBOUNCE_MS = 150;

/**
 * Player autocomplete (REQ-07): min 2 characters, ~150 ms debounce, up to 10 results (whole roster for a club query),
 * non-selectable items greyed with a note and not clickable; full keyboard support.
 * On focus the input scrolls to the top of the viewport so the on-screen keyboard
 * does not hide the suggestions.
 */
export function PlayerAutocomplete({
  label = 'Igrač',
  day,
  roundId,
  onSelect,
  disabled,
  allowUnselectable = false,
  placeholder = 'Ukucaj ime, prezime ili klub…',
  autoFocus,
}: {
  label?: string;
  day?: string;
  roundId?: number;
  onSelect: (item: PlayerSearchItem) => void;
  disabled?: boolean;
  /** Allow picking items the server marks non-selectable (corrections, filters). */
  allowUnselectable?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounce(text, SEARCH_DEBOUNCE_MS);
  const term = debounced.trim();
  const q = usePlayerSearch(term, day, roundId);
  const items = term.length >= 2 ? (q.data?.items ?? []) : [];
  const canPick = (it: PlayerSearchItem) => allowUnselectable || it.selectable;

  useEffect(() => {
    setActive(-1);
  }, [term]);

  const choose = (it: PlayerSearchItem) => {
    if (!canPick(it)) return;
    onSelect(it);
    setText('');
    setOpen(false);
    setActive(-1);
  };

  const move = (dir: 1 | -1) => {
    if (!items.length) return;
    let i = active;
    for (let n = 0; n < items.length; n++) {
      i = (i + dir + items.length) % items.length;
      if (canPick(items[i]!)) {
        setActive(i);
        return;
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && items[active]) {
        e.preventDefault();
        choose(items[active]!);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && term.length >= 2;
  const typingShort = text.trim().length > 0 && text.trim().length < 2;

  return (
    <div className="autocomplete">
      <label htmlFor={id}>{label}</label>
      <input
        ref={inputRef}
        id={id}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          // Keep suggestions visible above the mobile keyboard.
          if (window.matchMedia?.('(max-width: 899px)').matches) {
            setTimeout(() => inputRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }), 250);
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {typingShort && <small className="hint">Ukucaj bar 2 slova.</small>}
      {showList && (
        <ul className="autocomplete-list" id={listId} role="listbox" aria-label="Predlozi igrača">
          {q.isFetching && items.length === 0 && <li className="autocomplete-msg">Pretraga…</li>}
          {!q.isFetching && q.data && items.length === 0 && <li className="autocomplete-msg">Nema igrača za „{term}”.</li>}
          {q.error ? <li className="autocomplete-msg">Pretraga nije uspela.</li> : null}
          {items.map((it, i) => {
            const selectable = canPick(it);
            return (
              <li
                key={it.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                aria-disabled={!selectable}
                className={`autocomplete-item${selectable ? '' : ' is-disabled'}${i === active ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(it)}
                onMouseEnter={() => selectable && setActive(i)}
              >
                <Avatar name={it.fullName} url={it.photoUrl} size={36} />
                <span className="autocomplete-text">
                  <strong>{it.fullName}</strong>
                  <span className="small">
                    {[it.club?.shortName ?? it.club?.name, it.position].filter(Boolean).join(' · ')}
                    {it.game && ` · ${gameLabel(it.game)} ${formatTime(it.game.scheduledAt)}`}
                  </span>
                  {it.note && <span className="small note">{it.note}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
