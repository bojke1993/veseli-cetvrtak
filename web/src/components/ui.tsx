import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { errorMessage } from '../api/client';

export function Loading({ label = 'Učitavanje…' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="alert alert-error" role="alert">
      <span>{errorMessage(error)}</span>
      {onRetry && (
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Pokušaj ponovo
        </button>
      )}
    </div>
  );
}

/** Inline mutation error, shown only when present. */
export function MutationError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="form-error" role="alert">
      {errorMessage(error)}
    </p>
  );
}

interface QueryLike<T> {
  data: T | undefined;
  isPending: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** Renders loading / error states and then children(data). Keeps old data on refetch errors. */
export function QueryView<T>({ q, children, loadingLabel }: { q: QueryLike<T>; children: (data: T) => ReactNode; loadingLabel?: string }) {
  if (q.data !== undefined) return <>{children(q.data)}</>;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  return <Loading label={loadingLabel} />;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('input, select, textarea, .modal-body button, .modal-footer button');
    (first ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <header className="modal-header">
          <h2 id={id}>{title}</h2>
          <button type="button" className="icon-btn modal-close" aria-label="Zatvori" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function LoginButton({ className = 'btn btn-primary' }: { className?: string }) {
  const loc = useLocation();
  return (
    <Link className={className} to={`/prijava?next=${encodeURIComponent(loc.pathname + loc.search)}`}>
      Prijavi se
    </Link>
  );
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function SaveIndicator({ state, error }: { state: SaveState; error?: string | null }) {
  return (
    <span className={`save-indicator save-${state}`} role="status" aria-live="polite">
      {state === 'saving' && 'Čuva se…'}
      {state === 'saved' && '✔ Sačuvano'}
      {state === 'error' && `✘ Nije sačuvano${error ? `: ${error}` : ''}`}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <small className="hint">{hint}</small>}
      {error && (
        <small className="form-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Card({ title, children, actions, className = '' }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          {title && <h2 className="card-title">{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
