import { useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { isChatSoundOn, playChatSound, setChatSoundOn } from '../lib/chatSound';
import { disablePush, enablePush, getPushEnabled, pushSupport, sendTestPush } from '../lib/push';

const PROMPT_DISMISSED_KEY = 'vc-push-prompt-dismissed';

/** Push state of this device: null while checking. */
function usePushState() {
  const support = pushSupport();
  const [enabled, setEnabled] = useState<boolean | null>(support === 'supported' ? null : false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (support !== 'supported') return;
    let alive = true;
    getPushEnabled()
      .then((on) => alive && setEnabled(on))
      .catch(() => alive && setEnabled(false));
    return () => {
      alive = false;
    };
  }, [support]);

  const run = async (fn: () => Promise<void>, next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEnabled(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return {
    support,
    enabled,
    busy,
    error,
    enable: () => run(enablePush, true),
    disable: () => run(disablePush, false),
  };
}

const IOS_HINT =
  'Na iPhone-u obaveštenja rade samo kad je aplikacija dodata na početni ekran: u Safariju dodirni Podeli → „Dodaj na početni ekran”, otvori aplikaciju sa te ikone i ovde uključi obaveštenja.';

/** Settings → "Obaveštenja": push on this device, test push, and the in-app sound. */
export function PushSettings() {
  const push = usePushState();
  const [sound, setSound] = useState(isChatSoundOn);
  const [test, setTest] = useState<string | null>(null);
  const denied = push.support === 'supported' && Notification.permission === 'denied';

  const sendTest = async () => {
    setTest(null);
    try {
      const r = await sendTestPush();
      setTest(r.sent > 0 ? 'Probno obaveštenje je poslato — trebalo bi da stigne za par sekundi.' : 'Nije poslato nijedno obaveštenje.');
    } catch (e) {
      setTest(errorMessage(e));
    }
  };

  return (
    <div className="push-settings">
      <p className="small muted">
        Obaveštenje o novoj poruci u chatu stiže i kada je aplikacija zatvorena, osim dok je imaš otvorenu. Uključuje se
        posebno na svakom uređaju.
      </p>
      {push.support === 'unsupported' && <p>Ovaj pregledač ne podržava obaveštenja.</p>}
      {push.support === 'ios-needs-install' && <p>{IOS_HINT}</p>}
      {push.support === 'supported' && (
        <>
          <p>
            Obaveštenja na ovom uređaju:{' '}
            <strong>{push.enabled === null ? '…' : push.enabled ? 'uključena' : 'isključena'}</strong>
          </p>
          {denied && !push.enabled && (
            <p className="small">Obaveštenja su blokirana u pregledaču — dozvoli ih u podešavanjima sajta (ikonica katanca pored adrese).</p>
          )}
          <div className="btn-row">
            {push.enabled ? (
              <>
                <button type="button" className="btn" disabled={push.busy} onClick={() => void push.disable()}>
                  Isključi obaveštenja
                </button>
                <button type="button" className="btn" onClick={() => void sendTest()}>
                  Pošalji probno
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={push.busy || push.enabled === null}
                onClick={() => void push.enable()}
              >
                🔔 Uključi obaveštenja
              </button>
            )}
          </div>
          {test && (
            <p className="small" role="status">
              {test}
            </p>
          )}
        </>
      )}
      {push.error && (
        <p className="form-error" role="alert">
          {push.error}
        </p>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={sound}
          onChange={(e) => {
            setChatSoundOn(e.target.checked);
            setSound(e.target.checked);
            if (e.target.checked) playChatSound(true);
          }}
        />{' '}
        Zvuk nove poruke dok je aplikacija otvorena
      </label>
    </div>
  );
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(PROMPT_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Chat: one-time offer to turn notifications on for this device. */
export function PushPrompt() {
  const push = usePushState();
  const [dismissed, setDismissed] = useState(wasDismissed);
  const dismiss = () => {
    try {
      localStorage.setItem(PROMPT_DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  if (dismissed || push.support === 'unsupported') return null;
  if (push.support === 'supported' && (push.enabled !== false || Notification.permission === 'denied')) return null;

  return (
    <div className="push-prompt" role="region" aria-label="Obaveštenja">
      <p>
        {push.support === 'ios-needs-install'
          ? '🔔 Za obaveštenja o novim porukama na iPhone-u dodaj aplikaciju na početni ekran (Podeli → „Dodaj na početni ekran”).'
          : '🔔 Želiš obaveštenje o novoj poruci i kad je aplikacija zatvorena?'}
      </p>
      {push.error && (
        <p className="form-error" role="alert">
          {push.error}
        </p>
      )}
      <div className="btn-row">
        {push.support === 'supported' && (
          <button type="button" className="btn btn-small btn-primary" disabled={push.busy} onClick={() => void push.enable()}>
            Uključi
          </button>
        )}
        <button type="button" className="btn btn-small" onClick={dismiss}>
          {push.support === 'supported' ? 'Ne sada' : 'U redu'}
        </button>
      </div>
    </div>
  );
}
