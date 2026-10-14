import { useId } from 'react';
import type { Direction } from '@api';

/** Line input (x,5) — decimal keyboard on phones. */
export function LineInput({
  value,
  onChange,
  onBlur,
  error,
  disabled,
  label = 'Granica',
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string | null;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="field field-line">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="14,5"
        value={value}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {error && (
        <small id={`${id}-err`} className="form-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export function DecimalInput({
  label,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  placeholder,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string | null;
  disabled?: boolean;
  placeholder?: string;
  suffix?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-suffix">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </div>
      {error && (
        <small className="form-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

/** Više / Manje toggle (exactly one direction, REQ-08.4). */
export function DirectionToggle({
  value,
  onChange,
  disabled,
}: {
  value: Direction | null;
  onChange: (d: Direction) => void;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <span className="field-label" id={undefined}>
        Smer
      </span>
      <div className="segmented" role="group" aria-label="Smer">
        {(['over', 'under'] as const).map((d) => (
          <button
            key={d}
            type="button"
            className={value === d ? 'is-on' : ''}
            aria-pressed={value === d}
            disabled={disabled}
            onClick={() => onChange(d)}
          >
            {d === 'over' ? '▲ Više' : '▼ Manje'}
          </button>
        ))}
      </div>
    </div>
  );
}
