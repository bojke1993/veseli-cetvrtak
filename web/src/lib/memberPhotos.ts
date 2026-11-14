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
  'Zamrznut kao račun u kladionici. Ekipa igra umesto njega, a on gleda i klima glavom.',
  'Na klupi za kaznene minute — trener kaže da radi na sebi, mi kažemo da radi protiv nas.',
  'Pet promašaja zaredom. Statistički je teže ovo nego pogoditi, ali on je uspeo.',
  'Hladnjača. Čuva se na −18°C do daljnjeg, pa se odmrzava za sledeće kolo.',
];

export const FIRE_MESSAGES = [
  'U delirijumu — 3 pogotka zaredom. Ne prekidajte ritual, ne postavljajte pitanja.',
  'U transu — tri puta pogodio. Anđus traži da mu otkrije sistem.',
  'Nedodirljiv — trenutno mu se i kvote sklanjaju s puta.',
  'Gori! Ne dirajte mu čarape, ne menjajte mu stolicu, ne pričajte s njim pre utakmice.',
  'Vreo kao burek u 6 ujutru. Ekipa razmišlja da mu prepusti ceo tiket.',
  'Kladionica je već poslala čoveka da proveri da li je sve u redu s njim.',
];

/** Shown with the double 🔥🔥 (6+ hits in a row). */
export const DOUBLE_FIRE_MESSAGES = [
  'Dupla vatrica — ovo više nije forma, ovo je dar s neba. Ili dogovorena utakmica.',
  'Šest zaredom! Evroliga razmatra da ga angažuje kao analitičara, kladionica da ga zabrani.',
  'Požar! Vatrogasci obavešteni, kvote evakuisane, Anđus plače u ćošku.',
  'Gori kao Atina u avgustu. Molimo ostalu trojicu da prepisuju bez stida.',
  'Ovo je već sumnjivo — proverite mu telefon, sigurno ima vezu u svlačionici.',
];

/** Exactly 2 hits in a row — one more for the vatrica. */
export const TWO_HITS_MESSAGES = [
  'Dva pogotka zaredom — vatrica se već greje, samo da ne kine.',
  'Dva od dva. Počinje da priča „ja sam ti to rekao“ — i to pre utakmice.',
  'Zagrejan kao rerna na 180 — još jedan i ide burek.',
  'Dva vezana. Već je kupio novu majicu za proslavu, za svaki slučaj.',
  'Na korak od vatrice. Ostali ga gledaju s poštovanjem i blagom zavišću.',
];

/** Exactly 2 misses in a row. */
export const TWO_MISSES_MESSAGES = [
  'Dva promašaja zaredom — kaže da je to „namerno, da zavara kladionicu“.',
  'Dva vezana promašaja. Sledeći put igra „manje“ na sopstvenu sreću.',
  'Mala kriza. Još nije panika, ali je već zvao baku da mu upali sveću.',
  'Dva od dva — ali promašena. Kaže da je granica bila nameštena.',
  'Dva puta pored. Ekipa mu i dalje veruje, otprilike kao prognozi za vikend.',
];

/**
 * One-line "mood" derived from the member's current status (BR: 3 hits = fire, 5 misses = cooldown).
 * `roll` in [0, 1) picks the message from the matching pool; callers keep it stable so the text does not change on re-render.
 */
export function memberMood(status: MemberDto['status'], roll: number): { emoji: string; text: string } {
  const { streak, hasFire, onCooldown } = status;
  const pick = (messages: string[]) => messages[Math.floor(roll * messages.length)]!;
  if (onCooldown) return { emoji: '❄', text: pick(COOLDOWN_MESSAGES) };
  if (hasFire && streak >= 6) return { emoji: '🔥🔥', text: `${streakText(streak)}! ${pick(DOUBLE_FIRE_MESSAGES)}` };
  if (hasFire) return { emoji: '🔥', text: pick(FIRE_MESSAGES) };
  if (streak === 2) return { emoji: '😏', text: pick(TWO_HITS_MESSAGES) };
  if (streak === -2) return { emoji: '🙈', text: pick(TWO_MISSES_MESSAGES) };
  if (streak > 0) return { emoji: '😎', text: `${streakText(streak)} — još ${3 - streak} do vatrice.` };
  if (streak <= -3) return { emoji: '🥶', text: `${streakText(streak)} — još ${5 + streak} do hlađenja.` };
  if (streak < 0) return { emoji: '😬', text: `${streakText(streak)}. Sledeći ide sigurno.` };
  return { emoji: '🙂', text: 'Čist list — bez niza.' };
}
