// Stops near the rider: the position, then the nearest twenty stops with their lines; the map draws them.
import { call } from '../worker/client';
import * as nearby from '../state/nearby';
import { getPosition } from '../state/position';
import * as map from '../map/index';
import type { Stop } from '../state/nearby';
import { openStop } from './stop';
import { openLine } from './line';

export async function loadNearby(): Promise<void> {
  nearby.status.value = 'locating';
  let pos;
  try { pos = await getPosition(); } catch { nearby.status.value = 'noLocation'; return; }
  nearby.stops.value = await call<Stop[]>('nearby', { lat: pos.lat, lon: pos.lon, limit: 20 });
  nearby.status.value = 'ready';
  map.redrawMap(true);
}

Object.assign(nearby.hooks, { load: () => loadNearby(), openStop: (stop: number) => openStop(stop), openLine: (route: number) => openLine(route) });
