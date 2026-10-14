import { EventEmitter } from 'node:events';
import type { LiveEvent, RoundEvent } from '../api-types.js';

export type BusEvent =
  | { type: 'round'; data: RoundEvent }
  | { type: 'live'; data: LiveEvent };

/** In-process pub/sub feeding the SSE endpoint (GET /api/live/stream). */
export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(event: BusEvent): void {
    this.emitter.emit('event', event);
  }

  /** Convenience: tell clients that a round changed and should be refetched. */
  roundChanged(roundId: number): void {
    this.publish({ type: 'round', data: { roundId } });
  }

  subscribe(listener: (event: BusEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
