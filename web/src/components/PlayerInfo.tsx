import type { GameDto, PlayerDto } from '@api';
import { formatTime, GAME_STATUS_LABEL, initials } from '../lib/format';

export function Avatar({ name, url, size = 40 }: { name: string; url: string | null | undefined; size?: number }) {
  if (url) return <img className="avatar" src={url} alt="" width={size} height={size} loading="lazy" />;
  return (
    <span className="avatar avatar-initials" style={{ width: size, height: size }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function gameLabel(g: GameDto | null | undefined): string {
  if (!g) return '';
  return `${g.home.shortName} – ${g.away.shortName}`;
}

export function gameStarted(g: GameDto | null | undefined): boolean {
  return !!g && g.status !== 'scheduled';
}

/** "CZV – PAO · počinje u 20:30", "CZV 45:41 PAO · Q3 04:12", "… · Kraj". */
export function GameLine({ game }: { game: GameDto | null | undefined }) {
  if (!game) return null;
  const teams = gameLabel(game);
  if (game.status === 'scheduled') {
    return (
      <span className="game-line">
        {teams} · počinje u {formatTime(game.scheduledAt)}
      </span>
    );
  }
  if (game.status === 'postponed' || game.status === 'cancelled') {
    return (
      <span className="game-line">
        {teams} · {GAME_STATUS_LABEL[game.status]}
      </span>
    );
  }
  const score = `${game.home.shortName} ${game.homeScore ?? 0}:${game.awayScore ?? 0} ${game.away.shortName}`;
  const clock = game.status === 'final' ? 'Kraj' : [game.liveQuarter, game.liveClock].filter(Boolean).join(' ');
  return (
    <span className="game-line tabular">
      {score}
      {clock && ` · ${clock}`}
    </span>
  );
}

export function PlayerInfo({
  player,
  fallbackName,
  game,
}: {
  player: PlayerDto | null;
  fallbackName?: string | null;
  game?: GameDto | null;
}) {
  const name = player?.fullName ?? fallbackName ?? '—';
  const meta = [player?.club?.shortName ?? player?.club?.name, player?.position].filter(Boolean).join(' · ');
  return (
    <div className="player-info">
      <Avatar name={name} url={player?.photoUrl} />
      <div className="player-info-text">
        <strong>{name}</strong>
        {(meta || player?.isManual) && (
          <span className="muted small">
            {meta}
            {player?.isManual && ' · ručno dodat'}
          </span>
        )}
        {game !== undefined && <GameLine game={game} />}
      </div>
    </div>
  );
}
