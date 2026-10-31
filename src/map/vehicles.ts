// A panel's own vehicles on the map (the rides of a way, a line's vehicles, the followed ride's) and the rider's dot
// while following: the panel's controller hands them over, the map draws them while that panel is what it shows, and
// clears them with every new drawing (render.ts clearMap). Only this module creates or removes those markers.
import type { Marker } from 'maplibre-gl';
import type { Vehicle } from '../engine/feed.ts';
import type { VehicleStatus } from '../worker/ops.ts';
import { state } from './shared';
import { lineVehicleMarkers } from './popups';
import { registerDot } from './heading';

/** The panels whose live vehicles are their own (map/view.ts, `live: 'own'`). */
export type OwnPanel = 'detail' | 'lineDetail' | 'follow';
/** One set of vehicles: a line's reporting vehicles, the worker's word on each (same order), what runs, the trip the
 *  rider is on (it stands out), and what to name a vehicle by when the worker could not. */
export type VehicleSet = {
  vs: readonly Vehicle[];
  statuses: readonly VehicleStatus[];
  routeType: number;
  mine: number | null;
  fallback?: { line?: string; headsign?: string; agency?: string; route?: number | null };
};
const shown = new Map<string, Marker[]>(); // by panel and set
let rider: Marker | null = null;

/** Show (or with null, take away) one set of a panel's vehicles; `key` names the set (a ride of the way, the line, the
 *  followed ride), so a newer look at it replaces the older. Nothing happens while the map shows another panel. */
export function showVehicles(panel: OwnPanel, key: string, set: VehicleSet | null): void {
  const k = `${panel}:${key}`;
  for (const mk of shown.get(k) || []) mk.remove();
  shown.delete(k);
  const m = state.main;
  if (!set || !m || state.drawnFor !== panel) return;
  const markers: Marker[] = [];
  lineVehicleMarkers(m, markers, set.vs, set.statuses, set.routeType, set.mine, set.fallback);
  shown.set(k, markers);
}
/** The rider's dot while following (the map's own location dot is not shown then); null takes it away. */
export function showRider(pos: { lat: number; lon: number } | null): void {
  const m = state.main;
  if (!pos || !m || !state.styled || state.drawnFor !== 'follow') {
    if (rider) rider.remove();
    rider = null;
    return;
  }
  if (!rider) {
    const el = document.createElement('div');
    el.className = 'wayli-me';
    registerDot(el);
    rider = new maplibregl.Marker({ element: el }).setLngLat([pos.lon, pos.lat]).addTo(m);
  } else rider.setLngLat([pos.lon, pos.lat]);
}
/** Every panel's vehicles and the rider's dot off the map (a new drawing starts). */
export function clearOwn(): void {
  for (const ms of shown.values()) for (const mk of ms) mk.remove();
  shown.clear();
  showRider(null);
}
