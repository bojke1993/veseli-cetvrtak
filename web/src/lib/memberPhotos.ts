import type { MemberDto } from '@api';
import { streakText } from './format';

/** Team photos shipped with the app (web/public/foto), keyed by member name. */
export interface MemberPhoto {
  src: string;
  /** Short playful nickname shown above the caption. */
  nickname: string;
  caption: string;
  /** CSS object-position used when the photo is cropped to a circle. */
  focus: string;
}

const PHOTOS: Record<string, MemberPhoto> = {
  Ivanišević: {
    src: '/foto/ivanisevic.jpg',
    nickname: 'Admin u čekaonici',
    caption: 'Pogled čoveka kome je tiket pao na poslednjem tipu, a let kasni dva sata.',
    focus: '60% 35%',
  },
  Tozislav: {
    src: '/foto/tozislav.jpg',
    nickname: 'Fokus na tiket',
    caption: 'Oko njega se dešava svašta. On ispod stola osvežava live poene.',
    focus: '60% 30%',
  },
  Lakićević: {
    src: '/foto/lakicevic.jpg',
    nickname: 'Mirna luka',
    caption: 'Pivo hladno, tip još hladniji. Ništa ga ne može izbaciti iz takta.',
    focus: '35% 30%',
  },
  Simara: {
    src: '/foto/simara.jpg',
    nickname: 'Riba',
    caption: 'Zatvori oči, oseti granicu, odigraj više. Na kartici piše RIBA — i zna on zašto.',
    focus: '50% 20%',
  },
};

export const TEAM_PHOTO = { src: '/foto/ekipa.jpg' };

export function memberPhoto(m: Pick<MemberDto, 'name' | 'avatarUrl'> | undefined): MemberPhoto | null {
  if (!m) return null;
  const known = PHOTOS[m.name] ?? null;
  if (m.avatarUrl) return { ...(known ?? { nickname: '', caption: '', focus: '50% 30%' }), src: m.avatarUrl };
  return known;
}

export const COOLDOWN_MESSAGES = [
  'Na hlađenju — Anđus mu je mentor, kladionica sponzor oporavka.',
  'Suspendovan iz prognoziranja — još jedan tip i prelazi na vremensku prognozu.',
  'Na prinudnom odmoru — trenutno pogađa samo koliko će puta promašiti.',
];

export const FIRE_MESSAGES = [
  'U delirijumu — 3 pogotka zaredom. Ne prekidajte ritual, ne postavljajte pitanja.',
  'U transu — tri puta pogodio. Anđus traži da mu otkrije sistem.',
  'Nedodirljiv — trenutno mu se i kvote sklanjaju s puta.',
];

/**
 * One-line "mood" derived from the member's current status (BR: 3 hits = fire, 5 misses = cooldown).
 * `roll` in [0, 1) picks the cooldown/fire message; callers keep it stable so the text does not change on re-render.
 */
export function memberMood(status: MemberDto['status'], roll: number): { emoji: string; text: string } {
  const { streak, hasFire, onCooldown } = status;
  const pick = (messages: string[]) => messages[Math.floor(roll * messages.length)]!;
  if (onCooldown) return { emoji: '❄', text: pick(COOLDOWN_MESSAGES) };
  if (hasFire) return { emoji: '🔥', text: pick(FIRE_MESSAGES) };
  if (streak > 0) return { emoji: '😎', text: `${streakText(streak)} — još ${3 - streak} do vatrice.` };
  if (streak <= -3) return { emoji: '🥶', text: `${streakText(streak)} — još ${5 + streak} do hlađenja.` };
  if (streak < 0) return { emoji: '😬', text: `${streakText(streak)}. Sledeći ide sigurno.` };
  return { emoji: '🙂', text: 'Čist list — bez niza.' };
}
