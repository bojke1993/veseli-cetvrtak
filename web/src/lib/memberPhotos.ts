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

export const TEAM_PHOTO = {
  src: '/foto/ekipa.jpg',
  title: 'Veseli četvrtak',
  caption: 'Četiri tipa. Jedan tiket. Nula kajanja — bar do poslednje četvrtine.',
};

export function memberPhoto(m: Pick<MemberDto, 'name' | 'avatarUrl'> | undefined): MemberPhoto | null {
  if (!m) return null;
  const known = PHOTOS[m.name] ?? null;
  if (m.avatarUrl) return { ...(known ?? { nickname: '', caption: '', focus: '50% 30%' }), src: m.avatarUrl };
  return known;
}

/** One-line "mood" derived from the member's current status (BR: 3 hits = fire, 5 misses = cooldown). */
export function memberMood(status: MemberDto['status']): { emoji: string; text: string } {
  const { streak, hasFire, onCooldown } = status;
  if (onCooldown) return { emoji: '❄', text: 'Na hlađenju — ovo kolo umesto njega bira ekipa.' };
  if (hasFire) return { emoji: '🔥', text: `U vatri: ${streakText(streak)}. Ne dirajte ga.` };
  if (streak > 0) return { emoji: '😎', text: `${streakText(streak)} — još ${3 - streak} do vatrice.` };
  if (streak <= -3) return { emoji: '🥶', text: `${streakText(streak)} — još ${5 + streak} do hlađenja.` };
  if (streak < 0) return { emoji: '😬', text: `${streakText(streak)}. Sledeći ide sigurno.` };
  return { emoji: '🙂', text: 'Čist list — bez niza.' };
}
