// Following a trip, as the screen sees it: the trip in progress (its journey, its state machine's state, the
// day), the rider's position, what the live data says about the next ride, and a faster way when one was
// found. The controller (timers, the position watch, the live polls, the re-planning) is controllers/follow.ts
// and publishes here; the screen renders from these and asks through `hooks`.
import { signal } from '@preact/signals';
import type { Journey } from '../journey/types';
import type { Badge } from '../journey/format';
import type {
  FollowState,
  Position as EnginePosition,
  Connection,
  ReplanOrigin,
  ActiveTrip,
} from '../journey/follow.ts';
export type { ActiveTrip };

// the state machine's own types, from the engine; the screen adds when a position was taken
export type { FollowState, Connection };
export type Position = EnginePosition & { at: number };
export type Alt = {
  journey: Journey;
  origin: ReplanOrigin;
  key: string;
  gain: number;
};

export const active = signal<ActiveTrip | null>(null); // the trip being followed, while the screen is up
export const tick = signal(0); // bumped whenever its state advanced
export const pos = signal<Position | null>(null);
export const liveBadge = signal<Badge | null>(null); // the next ride's vehicle
/** What the live data says of each remaining ride, by leg index: its vehicle at the boarding stop, the change into it
 *  (seconds to spare, negative when missed; with the times), and its stops at their shown times, passed ones marked. */
export type LegLive = {
  badge: Badge | null;
  change: Connection | null;
  stops: { time: number; passed: boolean }[] | null;
};
export const legLive = signal<Record<number, LegLive>>({});
export const alt = signal<Alt | null>(null); // a faster way, proposed
export const resumable = signal<ActiveTrip | null>(null); // a trip in progress whose screen is hidden

/** The controller publishes the trip after every step. */
export function publish(a: ActiveTrip | null, found: Alt | null = null): void {
  active.value = a;
  alt.value = found;
  tick.value++;
}
