/**
 * BR-41: short "ding" for a new chat message from someone else, generated with Web Audio (no
 * asset). Browsers only allow sound after the user has interacted with the page, so the audio
 * context is created/resumed on the first tap or key press. Works only while the app is open.
 */
const STORAGE_KEY = 'vc-chat-sound';
const MIN_GAP_MS = 1500;

let ctx: AudioContext | null = null;
let lastPlayed = 0;
let unlockInstalled = false;

export function isChatSoundOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setChatSoundOn(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // private mode — the setting just won't persist
  }
}

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
    .AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call once (e.g. from the layout): unlocks audio on the first user gesture. */
export function installAudioUnlock() {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const unlock = () => {
    const c = audioContext();
    if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function playChatSound(force = false) {
  if (!force && !isChatSoundOn()) return;
  const now = Date.now();
  if (!force && now - lastPlayed < MIN_GAP_MS) return;
  const c = audioContext();
  if (!c || c.state !== 'running') return;
  lastPlayed = now;
  const t = c.currentTime;
  const gain = c.createGain();
  gain.connect(c.destination);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  for (const [freq, start] of [
    [880, 0],
    [1320, 0.09],
  ] as const) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t + start);
    osc.connect(gain);
    osc.start(t + start);
    osc.stop(t + 0.45);
  }
}
