/**
 * BR-41: who is online = who has at least one open chat stream. Going offline is delayed by a grace
 * period so short reconnects (phone switching networks, page reload) do not flicker.
 */
export const PRESENCE_GRACE_MS = 30_000;

export class Presence {
  private readonly connections = new Map<number, number>();
  private readonly pendingOffline = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly onChange: (memberId: number, online: boolean) => void,
    private readonly graceMs = PRESENCE_GRACE_MS,
  ) {}

  connect(memberId: number): void {
    const count = this.connections.get(memberId) ?? 0;
    this.connections.set(memberId, count + 1);
    const pending = this.pendingOffline.get(memberId);
    if (pending) {
      // Came back within the grace period: still online, nothing to announce.
      clearTimeout(pending);
      this.pendingOffline.delete(memberId);
      return;
    }
    if (count === 0) this.onChange(memberId, true);
  }

  disconnect(memberId: number): void {
    const count = (this.connections.get(memberId) ?? 0) - 1;
    if (count > 0) {
      this.connections.set(memberId, count);
      return;
    }
    this.connections.delete(memberId);
    if (this.pendingOffline.has(memberId)) return;
    const timer = setTimeout(() => {
      this.pendingOffline.delete(memberId);
      this.onChange(memberId, false);
    }, this.graceMs);
    timer.unref?.();
    this.pendingOffline.set(memberId, timer);
  }

  isOnline(memberId: number): boolean {
    return this.connections.has(memberId) || this.pendingOffline.has(memberId);
  }

  close(): void {
    for (const t of this.pendingOffline.values()) clearTimeout(t);
    this.pendingOffline.clear();
    this.connections.clear();
  }
}
