// One trip's page: every stop with its time, where the vehicle is now.
import { signal } from '@preact/signals';

export type TripStop = { stop: number; name: string; arr: number; dep?: number };
export type TripStops = { line: string; headsign: string; agency: string; routeId?: number | null; firstDep?: number; estimated?: boolean; stops: TripStop[] };

export const ts = signal<TripStops | null>(null);
export const hereStop = signal<number | null>(null);
export const vehicle = signal<{ index: number; delayMin: number } | null>(null);
export const noVehicle = signal(false);

export const hooks = { close: () => {}, openStop: (_stop: number) => {} };
