import type { PushKeyResponse, PushStatusResponse, PushTestResponse } from '@api';
import { api } from '../api/client';

/**
 * BR-41 / P-28: Web Push for new chat messages, per device. iPhone/iPad support it only when the
 * app is added to the home screen (iOS 16.4+).
 */

export type PushSupport = 'supported' | 'ios-needs-install' | 'unsupported';

export function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as Mac; touch support gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const has = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  return has ? 'supported' : 'unsupported';
}

let registration: Promise<ServiceWorkerRegistration> | null = null;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!registration) {
    registration = navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => navigator.serviceWorker.ready);
    registration.catch(() => {
      registration = null;
    });
  }
  return registration;
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registerServiceWorker();
  return reg.pushManager.getSubscription();
}

/** Is this device subscribed for the logged-in member (browser and server agree)? */
export async function getPushEnabled(): Promise<boolean> {
  if (pushSupport() !== 'supported' || Notification.permission !== 'granted') return false;
  const sub = await currentSubscription();
  if (!sub) return false;
  const res = await api.post<PushStatusResponse>('/push/status', { endpoint: sub.endpoint });
  if (!res.subscribed) {
    // Subscribed in the browser but unknown to the server (e.g. another member used to be logged
    // in here, or the server dropped it): register it again for the current member.
    await api.post('/push/subscribe', sub.toJSON());
  }
  return true;
}

/** Asks for permission (must run from a tap) and registers this device. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Obaveštenja su blokirana u pregledaču. Dozvoli ih u podešavanjima sajta pa pokušaj ponovo.'
        : 'Obaveštenja nisu dozvoljena.',
    );
  }
  const reg = await registerServiceWorker();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api.get<PushKeyResponse>('/push/key');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
  }
  await api.post('/push/subscribe', sub.toJSON());
}

/** Turns push off on this device (also called before logout). Never throws. */
export async function disablePush(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  } catch {
    // nothing to clean up
  }
}

export function sendTestPush(): Promise<PushTestResponse> {
  return api.post<PushTestResponse>('/push/test', {});
}
