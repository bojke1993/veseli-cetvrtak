import type { BadgeCode, RecordCode, TeamRecordDto } from '@api';
import { formatLine, formatMoney, formatOdds, plural } from './format';

/** BR-38: "Kuća slavnih" labels and value formatting. */
export const RECORD_META: Record<RecordCode, { emoji: string; label: string }> = {
  biggest_win: { emoji: '💰', label: 'Najveći dobitak' },
  top_ticket_odds: { emoji: '🎰', label: 'Najveća kvota dobitnog tiketa' },
  top_pick_odds: { emoji: '🦁', label: 'Najveća kvota pogođenog tipa' },
  biggest_margin: { emoji: '💥', label: 'Najubedljiviji pogodak' },
  longest_hit_streak: { emoji: '🔥', label: 'Najduži niz pogodaka' },
  longest_miss_streak: { emoji: '🥶', label: 'Najduži niz promašaja' },
  costliest_blame: { emoji: '💸', label: 'Najskuplji blejm' },
  most_painful_near_miss: { emoji: '🤏', label: 'Najbolnije „za dlaku”' },
};

export function recordValue(r: Pick<TeamRecordDto, 'code' | 'value'>): string {
  switch (r.code) {
    case 'biggest_win':
    case 'costliest_blame':
    case 'most_painful_near_miss':
      return formatMoney(r.value);
    case 'top_ticket_odds':
    case 'top_pick_odds':
      return formatOdds(r.value);
    case 'biggest_margin':
      return `+${formatLine(r.value)} ${plural(Math.round(r.value), 'poen', 'poena', 'poena')}`;
    case 'longest_hit_streak':
    case 'longest_miss_streak':
      return `${r.value} zaredom`;
  }
}

/** BR-38: member badges. */
export const BADGE_META: Record<BadgeCode, { emoji: string; label: string; description: string }> = {
  sniper: { emoji: '🎯', label: 'Snajper', description: '5 pogodaka zaredom' },
  brave: { emoji: '🦁', label: 'Hrabri', description: 'Pogođen tip sa kvotom 2,00 ili većom' },
  perfect_month: { emoji: '💯', label: 'Savršen mesec', description: 'Svi tipovi u mesecu pogođeni (najmanje 3)' },
  near_miss: { emoji: '🤏', label: 'Za dlaku', description: 'Promašaj za pola poena' },
  ice: { emoji: '🧊', label: 'Ledeni', description: 'Odslužio hlađenje' },
  blame_king: { emoji: '👑', label: 'Kralj blejma', description: 'Najviše blejmova u sezoni' },
};

export const NEAR_MISS_MESSAGES = [
  'Pola poena. Pola! Neko je u Evroligi namerno promašio slobodno bacanje.',
  'Za dlaku — kao da je sudija lično znao za tiket.',
  'Pola poena fali, a tuga cela.',
  'Teorijski pogođeno. Praktično — nije.',
  'Da je trojka bila dvojka... ali nije.',
];

export function nearMissMessage(count: number, roll: number): string | null {
  if (count === 0) return null;
  return NEAR_MISS_MESSAGES[Math.floor(roll * NEAR_MISS_MESSAGES.length) % NEAR_MISS_MESSAGES.length]!;
}
