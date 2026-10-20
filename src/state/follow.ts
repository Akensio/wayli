// Following a trip, as the screen sees it: the trip in progress (its journey, its state machine's state, the
// day), the rider's position, what the live data says about the next ride, and a faster way when one was
// found. The controller (timers, the position watch, the live polls, the re-planning) still runs in app.js
// and publishes here; the screen renders from these and asks through `hooks`.
import { signal } from '@preact/signals';
import type { Journey, Query } from '../journey/types';
import type { Badge } from '../journey/format';

export type FollowState = { step: number; onBoard: boolean; rideIdx: number; done: boolean; [k: string]: unknown };
export type ActiveTrip = { journey: Journey; q: Pick<Query, 'from' | 'to' | 'bike' | 'folding'>; day: string; state: FollowState; view: 'follow' | 'hidden'; startedAt?: number; replanned?: number };
export type Position = { lat: number; lon: number; acc?: number; at: number };
export type Alt = { journey: Journey; origin: { kind: string; offAt?: { name: string }; [k: string]: unknown }; key: string; gain: number };

export const active = signal<ActiveTrip | null>(null);   // the trip being followed, while the screen is up
export const tick = signal(0);                             // bumped whenever its state advanced
export const pos = signal<Position | null>(null);
export const liveBadge = signal<Badge | null>(null);       // the next ride's vehicle
export const alt = signal<Alt | null>(null);               // a faster way, proposed
export const resumable = signal<ActiveTrip | null>(null);  // a trip in progress whose screen is hidden

export const hooks = {
  skip: () => {},                  // "next step": the rider says the state machine lags
  end: () => {},
  hide: () => {},
  resume: () => {},
  switchTo: (_alt: Alt) => {},
  dismiss: (_alt: Alt) => {},
};
/** The controller publishes the trip after every step. */
export function publish(a: ActiveTrip | null, found: Alt | null = null): void { active.value = a; alt.value = found; tick.value++; }
