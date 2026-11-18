import { useMemo } from 'react';
import type { MemberDto } from '@api';
import { useMembers } from '../api/queries';
import { memberPhoto } from '../lib/memberPhotos';
import { Avatar } from './PlayerInfo';

export function useMemberMap(): Map<number, MemberDto> {
  const q = useMembers();
  return useMemo(() => new Map((q.data?.members ?? []).map((m) => [m.id, m])), [q.data]);
}

export function useMemberList(): MemberDto[] {
  const q = useMembers();
  return useMemo(() => [...(q.data?.members ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [q.data]);
}

export function memberLabel(map: Map<number, MemberDto>, id: number | null | undefined): string {
  if (id == null) return '—';
  return map.get(id)?.displayName ?? `Član ${id}`;
}

/** Hit streak at which the 🔥 is shown twice (display only — still one vatrica by BR-23). */
export const DOUBLE_FIRE_STREAK = 6;

export function StatusIcons({
  cooldown,
  fire,
  streak = 0,
  warnings = 0,
  suspended = false,
}: {
  cooldown?: boolean;
  fire?: boolean;
  streak?: number;
  warnings?: number;
  suspended?: boolean;
}) {
  const double = streak >= DOUBLE_FIRE_STREAK;
  return (
    <>
      {suspended && (
        <span className="status-icon" role="img" aria-label="preskače kolo (suspenzija)" title="Preskače kolo (suspenzija)">
          🟥
        </span>
      )}
      {warnings > 0 && (
        <span
          className="status-icon"
          role="img"
          aria-label={warnings === 1 ? 'opomena' : `${warnings} opomene`}
          title={warnings === 1 ? 'Opomena — sledeća znači preskakanje kola' : `${warnings} opomene`}
        >
          🟨{warnings > 1 ? `×${warnings}` : ''}
        </span>
      )}
      {cooldown && (
        <span className="status-icon" role="img" aria-label="na hlađenju" title="Na hlađenju">
          ❄
        </span>
      )}
      {fire && (
        <span
          className="status-icon"
          role="img"
          aria-label={double ? `dupla vatrica, ${streak} pogodaka zaredom` : 'vatrica'}
          title={double ? `Dupla vatrica — ${streak} pogodaka zaredom` : 'Vatrica'}
        >
          {double ? '🔥🔥' : '🔥'}
        </span>
      )}
    </>
  );
}

/** Member display name with ❄ / 🔥 icons (screen-reader labelled). */
export function MemberName({
  id,
  showStatus = true,
  forceCooldown,
  chip = false,
}: {
  id: number | null | undefined;
  showStatus?: boolean;
  forceCooldown?: boolean;
  chip?: boolean;
}) {
  const map = useMemberMap();
  const m = id != null ? map.get(id) : undefined;
  const name = memberLabel(map, id);
  const cooldown = forceCooldown ?? m?.status.onCooldown;
  return (
    <span className={chip ? 'member-chip' : 'member-name'}>
      {name}
      {showStatus && <StatusIcons
          cooldown={cooldown}
          fire={m?.status.hasFire}
          streak={m?.status.streak}
          warnings={m?.status.warnings}
          suspended={m?.status.suspended}
        />}
    </span>
  );
}

/** Round member photo (falls back to initials). */
export function MemberAvatar({ member, size = 40 }: { member: MemberDto | undefined; size?: number }) {
  const photo = memberPhoto(member);
  if (photo) {
    return (
      <img className="avatar" src={photo.src} alt="" width={size} height={size} loading="lazy" style={{ objectPosition: photo.focus }} />
    );
  }
  return <Avatar name={member?.displayName ?? '?'} url={null} size={size} />;
}

/** "Tozislav", "Ekipa" or "—" for a blame / member-or-team value. */
export function BlameName({ value }: { value: number | 'team' | null }) {
  if (value === 'team') return <span className="member-name">Ekipa</span>;
  if (value == null) return <span>—</span>;
  return <MemberName id={value} />;
}
