import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import type { MeResponse } from '@api';
import { useQueryClient } from '@tanstack/react-query';
import { useChangePassword, useLogin, keys } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { Card, MutationError } from '../components/ui';

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/** EKR-01 */
export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { me } = useAuth();
  const login = useLogin();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (me && !login.isPending) return <Navigate to={me.mustChangePassword ? '/lozinka' : next} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate(
      { username: username.trim(), password },
      {
        onSuccess: () => {
          const data = qc.getQueryData<MeResponse>(keys.me);
          navigate(data?.me?.mustChangePassword ? '/lozinka' : next, { replace: true });
        },
      },
    );
  };

  return (
    <div className="narrow">
      <h1>Prijava</h1>
      <Card>
        <form onSubmit={submit} className="form">
          <div className="field">
            <label htmlFor="login-user">Korisničko ime</label>
            <input
              id="login-user"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="login-pass">Lozinka</label>
            <input
              id="login-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <MutationError error={login.error} />
          <button type="submit" className="btn btn-primary btn-block" disabled={login.isPending || !username || !password}>
            {login.isPending ? 'Prijavljivanje…' : 'Prijavi se'}
          </button>
        </form>
      </Card>
      <p className="muted small">Bez prijave možete da pratite kola i statistiku u režimu samo za pregled.</p>
    </div>
  );
}

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (next.length < 10) return setLocalError('Nova lozinka mora imati najmanje 10 karaktera.');
    if (next !== confirm) return setLocalError('Nova lozinka i potvrda se ne poklapaju.');
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setDone(true);
          setCurrent('');
          setNext('');
          setConfirm('');
          onDone?.();
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="form">
      <div className="field">
        <label htmlFor="cp-current">Trenutna lozinka</label>
        <input id="cp-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="cp-new">Nova lozinka (najmanje 10 karaktera)</label>
        <input id="cp-new" type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="cp-confirm">Ponovi novu lozinku</label>
        <input id="cp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      {localError && (
        <p className="form-error" role="alert">
          {localError}
        </p>
      )}
      <MutationError error={change.error} />
      {done && (
        <p className="form-ok" role="status">
          ✔ Lozinka je promenjena.
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={change.isPending}>
        Promeni lozinku
      </button>
    </form>
  );
}

export function ChangePasswordPage() {
  const { me } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="narrow">
      <h1>Promena lozinke</h1>
      {me?.mustChangePassword && (
        <p className="alert alert-warn" role="alert">
          Pre nastavka morate da promenite privremenu lozinku.
        </p>
      )}
      <Card>
        <ChangePasswordForm onDone={() => navigate('/', { replace: true })} />
      </Card>
    </div>
  );
}
