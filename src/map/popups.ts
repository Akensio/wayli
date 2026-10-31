// Bubbles on the map, one at a time: a vehicle (line, direction, delay, when it reported), a stop (its
// lines, from here, to here), a tapped place (to here, from here); and the vehicle markers of a line with their
// delays. What they show is bubbles.tsx; this module opens them and wires what a tap does.
import type { Map as MLMap, Marker, LngLatLike } from 'maplibre-gl';
import { h, render, type ComponentChild } from 'preact';
import { signal } from '@preact/signals';
import * as delays from '../engine/delays.ts';
import * as feed from '../engine/feed.ts';
import type { Vehicle } from '../engine/feed.ts';
import { t, lang } from '../lib/i18n';
import { vehicleIcon } from '../widgets/icons';
import { routeColor } from '../display/colors';
import { call } from '../worker/client';
import type { StopInfo, VehicleStatus } from '../worker/ops.ts';
import * as nav from '../state/nav';
import { stopPlace } from '../model/place';
import { viewFor } from './view';
import { popupState, pick, hooks, currentSheet, cameraPadding } from './shared';
import { timeOf } from '../lib/time';
import { reverseName } from '../display/places';
import { VehicleBubble, StopBubble, PlaceBubble, VehicleMark, type VehicleInfo } from './bubbles';
import { maplibregl } from './maplibre';

/** A vehicle's heading in degrees, or -1 when it reports none (0 while standing still means unknown). */
export const heading = (v: { bearing?: number | null; velocity?: number | null }): number =>
  v.bearing != null && (v.bearing !== 0 || (v.velocity || 0) > 0) ? v.bearing : -1;
export const vehiclesForWorker = (vs: readonly Vehicle[]) =>
  vs.map((v) => ({
    lineRef: v.lineRef,
    scheduledStart: v.scheduledStart.getTime(),
    lat: v.lat,
    lon: v.lon,
    recordedAt: v.recordedAt.getTime(),
    callSince: v.callSince,
    callSeenChange: v.callSeenChange,
    trail: v.trail,
  }));
export const closePopup = (): void => {
  if (popupState.current) {
    popupState.current.remove();
    popupState.current = null;
  }
};

/** Open a bubble at a point showing `content` (one of bubbles.tsx), closing the one open; the component is unmounted
 *  when the bubble closes. */
export function openPopup(m: MLMap, lngLat: LngLatLike, content: ComponentChild): void {
  closePopup();
  const box = document.createElement('div');
  render(content, box);
  const p = new maplibregl.Popup({ offset: 18, maxWidth: '280px', closeButton: true, className: 'wayli-pop' })
    .setLngLat(lngLat)
    .setDOMContent(box)
    .addTo(m);
  popupState.current = p;
  const el = p.getElement();
  if (el)
    requestAnimationFrame(() => {
      if (popupState.current === p) keepInView(m, el);
    });
  p.on('close', () => {
    if (popupState.current === p) popupState.current = null;
    render(null, box);
  });
}
/** A bubble's action: the bubble closes, then the action runs. */
const closing =
  <A extends unknown[]>(f: (...a: A) => void) =>
  (...a: A): void => {
    closePopup();
    f(...a);
  };
/** A bubble wholly in the part of the map the screen shows (between the bar and the sheet): the map slides by what
 *  sticks out, its top edge first when it is taller than that. */
function keepInView(m: MLMap, el: HTMLElement): void {
  const pad = cameraPadding(),
    c = m.getContainer().getBoundingClientRect(),
    r = el.getBoundingClientRect();
  const top = c.top + pad.top - 8,
    bottom = c.bottom - pad.bottom + 8;
  let dy = r.bottom > bottom ? r.bottom - bottom : 0;
  if (r.top - dy < top) dy = r.top - top;
  let dx = 0;
  if (r.left < c.left + 8) dx = r.left - c.left - 8;
  else if (r.right > c.right - 8) dx = r.right - c.right + 8;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) m.panBy([dx, dy], { duration: 250 });
}
/** A vehicle's bubble: line, direction, delay, when it reported, speed; its line, with its trip chosen. */
export function vehiclePopup(m: MLMap, lngLat: LngLatLike, v: VehicleInfo): void {
  openPopup(
    m,
    lngLat,
    h(VehicleBubble, {
      v,
      onLine: closing(() => {
        if (v.trip >= 0) hooks.openTrip(v.trip, -1);
        else hooks.openLine(v.route!);
      }),
    }),
  );
}
/** A stop tapped on the map. With nothing else in the sheet, the stop itself opens there (its lines, departures, from
 *  here and to here); while the sheet is about something else (results, a trip, a line, the trains between two
 *  stations), a tap never takes it away: a bubble names the stop, when that ride passes it, its lines, and offers the
 *  stop's details, from here and to here (on a line, its times at this stop). A station's badge is the whole station. */
export async function stopPopup(m: MLMap, lngLat: LngLatLike, stop: number, station?: unknown): Promise<void> {
  if (nav.isOpen('picker')) return; // in pick mode the map tap handler picks the stop instead
  const st = station != null && station !== '' ? +(station as number) : undefined;
  const draw = viewFor(currentSheet()).draw;
  if (draw === 'nothing' || draw === 'stop') {
    closePopup();
    hooks.openStop(stop, st);
    return;
  }
  let info: StopInfo;
  try {
    info = await call('stopInfo', { stop, station: st ?? -1 });
  } catch {
    return;
  }
  const onLine = nav.key.value === 'lineDetail';
  openPopup(
    m,
    lngLat,
    h(StopBubble, {
      info,
      at: hooks.timeAt(stop),
      onLine,
      act: {
        times: onLine ? closing(() => hooks.lineAt(stop)) : undefined,
        stop: closing(() => hooks.openStop(stop, st)),
        from: closing(() => hooks.planFrom(stopPlace(info))),
        to: closing(() => hooks.planTo(stopPlace(info))),
        line: closing((route: number) => hooks.openLine(route)),
      },
    }),
  );
}
/** A tap on the bare map (sheet collapsed): a bubble pointing at the spot, naming a place of the basemap under the
 *  finger, anything else by reverse geocoding (the name fills in when it arrives), with "to here" and "from here". */
export async function placeBubble(
  m: MLMap,
  e: { point: { x: number; y: number }; lngLat: { lng: number; lat: number } },
): Promise<void> {
  const my = ++pick.seq;
  const poiLayers = ((m.getStyle().layers || []) as any[])
    .filter((l) => l.type === 'symbol' && /^poi/.test(l.id) && l.id !== 'poi_transit')
    .map((l) => l.id);
  const r = 12,
    pois = poiLayers.length
      ? m.queryRenderedFeatures(
          [
            [e.point.x - r, e.point.y - r],
            [e.point.x + r, e.point.y + r],
          ],
          { layers: poiLayers },
        )
      : [];
  const poi = pois.find((f) => f.properties && f.properties.name);
  const lngLat: [number, number] = poi
    ? ((poi.geometry as any).coordinates.slice() as [number, number])
    : [e.lngLat.lng, e.lngLat.lat];
  let poiName = '…';
  if (poi)
    poiName =
      lang.value === 'he'
        ? poi.properties['name:he'] || poi.properties.name
        : poi.properties['name:en'] || poi.properties['name:latin'] || poi.properties.name;
  // the bubble's name is a signal: the reverse geocoding fills it in without reopening (and flickering) the bubble
  const name = signal(poiName);
  const place = () => ({ name: name.value, lat: lngLat[1], lon: lngLat[0] });
  openPopup(
    m,
    lngLat,
    h(PlaceBubble, { name, to: closing(() => hooks.planTo(place())), from: closing(() => hooks.planFrom(place())) }),
  );
  if (poi) return;
  try {
    const g = await call('reverse', { lat: lngLat[1], lon: lngLat[0] });
    if (my === pick.seq) name.value = reverseName(g);
  } catch {
    if (my === pick.seq) name.value = t('pointName');
  }
}
/** Stop dots on a journey or line map answer a tap (stopPopup: a bubble, the sheet keeps the journey or line). */
export function wireStopLayers(m: MLMap, layers: string[]): void {
  for (const layer of layers) {
    m.on('click', layer, (e) => {
      const f = e.features && e.features[0];
      if (f && f.properties.stop != null && f.properties.stop !== '')
        stopPopup(m, (f.geometry as any).coordinates, +f.properties.stop);
    });
    m.on('mouseenter', layer, () => {
      m.getCanvas().style.cursor = 'pointer';
    });
    m.on('mouseleave', layer, () => {
      m.getCanvas().style.cursor = '';
    });
  }
}
/** Every reporting vehicle of a line as a marker with its delay (`statuses`, the worker's word on each, in the same
 *  order); the one running `mine` stands out. The markers go into `markers`, which the caller owns. */
export function lineVehicleMarkers(
  m: MLMap,
  markers: Marker[],
  vs: readonly Vehicle[],
  statuses: readonly VehicleStatus[],
  routeType: number,
  mine: number | null,
  fallback: { line?: string; headsign?: string; agency?: string; route?: number | null } = {},
): void {
  const icon = vehicleIcon(routeType);
  const newest = feed.newest(vs);
  vs.forEach((v, i) => {
    if (!feed.isFresh(v, 300, newest)) return; // last seen long before this line's newest report: its position says nothing now
    const st = statuses[i] && statuses[i].trip >= 0 ? (statuses[i] as Exclude<VehicleStatus, { trip: -1 }>) : null;
    const isMine = mine != null && st != null && st.trip === mine;
    const el = document.createElement('div');
    el.className = 'wayli-bus lbl' + (!st || st.stale ? ' stale' : '') + (isMine ? ' mine' : '');
    const d = st && st.delay != null ? delays.delayMinutes(st.delay) : null;
    render(h(VehicleMark, { icon, delayMin: isMine ? d : null, heading: heading(v) }), el);
    el.style.borderColor = routeColor(st?.routeType ?? routeType, st?.agency || fallback.agency);
    el.title = `${timeOf(v.recordedAt)}${st?.headsign ? ' · ' + st.headsign : ''}`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      vehiclePopup(m, [v.lon, v.lat], {
        line: st?.line || fallback.line || '',
        routeType: st?.routeType ?? routeType,
        headsign: st?.headsign || fallback.headsign || '',
        agency: st?.agency || fallback.agency || '',
        delay: st?.delay,
        stale: !!st?.stale,
        seen: v.recordedAt,
        velocity: v.velocity,
        trip: st ? st.trip : -1,
        route: st?.route ?? fallback.route ?? null,
      });
    });
    markers.push(new maplibregl.Marker({ element: el }).setLngLat([v.lon, v.lat]).addTo(m));
  });
}
