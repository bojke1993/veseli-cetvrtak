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

export function StatusIcons({ cooldown, fire }: { cooldown?: boolean; fire?: boolean }) {
  return (
    <>
      {cooldown && (
        <span className="status-icon" role="img" aria-label="na hlađenju" title="Na hlađenju">
          ❄
        </span>
      )}
      {fire && (
        <span className="status-icon" role="img" aria-label="vatrica" title="Vatrica">
          🔥
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
      {showStatus && <StatusIcons cooldown={cooldown} fire={m?.status.hasFire} />}
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
