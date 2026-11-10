// Following a trip, as the screen sees it: the trip in progress (its journey as it stands now, trip/now.ts; its state
// machine's state, the day), the rider's position, the changes ahead, and a faster way when one was found. The controller (timers, the position watch, the live polls, the re-planning) is controllers/follow.ts
// and publishes here; the screen renders from these and asks through `hooks`.
import { signal } from '@preact/signals';
import type { Journey } from '../trip/journey';
import type {
  FollowState,
  Position as EnginePosition,
  Connection,
  ReplanOrigin,
  ActiveTrip,
} from '../following/follow.ts';
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
export const pos = signal<Position | null>(null);
/** The changes ahead, by the leg index of the ride changed into: seconds to spare (negative when missed), with the
 *  two times. */
export const changes = signal<Record<number, Connection>>({});
export const alt = signal<Alt | null>(null); // a faster way, proposed
export const resumable = signal<ActiveTrip | null>(null); // a trip in progress whose screen is hidden

/** The controller publishes the trip after every step. */
export function publish(a: ActiveTrip | null, found: Alt | null = null): void {
  active.value = a;
  alt.value = found;
}
