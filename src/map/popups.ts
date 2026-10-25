// Bubbles on the map, one at a time: a vehicle (line, direction, delay, when it reported), a stop (its
// lines, departures, from here, to here), a tapped place (to here, from here); and the vehicle markers of
// a line with their delays.
import type { Map as MLMap, Marker, LngLatLike } from 'maplibre-gl';
import * as live from '../live.js';
import { esc } from '../ui/html';
import { t, lang } from '../i18n';
import { ic } from '../ui/icons';
import { chipStyle, routeColor } from '../journey/colors';
import { lineText } from '../journey/format';
import { agencyName } from '../journey/agencies';
import { call } from '../worker/client';
import * as nav from '../state/nav';
import { popupState, pick, hooks } from './shared';
import { viewFor } from './view';
import { currentSheet, cameraPadding } from './render';
import { fmt } from '../time';

export const clock = (d: Date): string => d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
/** A vehicle's heading in degrees, or -1 when it reports none (0 while standing still means unknown). */
export const heading = (v: { bearing?: number | null; velocity?: number | null }): number => (v.bearing != null && (v.bearing !== 0 || (v.velocity || 0) > 0) ? v.bearing : -1);
export const vehiclesForWorker = (vs: any[]) => vs.map((v) => ({ lineRef: v.lineRef, scheduledStart: v.scheduledStart.getTime(), lat: v.lat, lon: v.lon, recordedAt: v.recordedAt.getTime(), callSince: v.callSince, callSeenChange: v.callSeenChange }));
export const closePopup = (): void => { if (popupState.current) { popupState.current.remove(); popupState.current = null; } };

export function openPopup(m: MLMap, lngLat: LngLatLike, html: string, wire?: (el: HTMLElement) => void): void {
  closePopup();
  const p = new maplibregl.Popup({ offset: 18, maxWidth: '280px', closeButton: true, className: 'wayli-pop' }).setLngLat(lngLat).setHTML(html).addTo(m);
  popupState.current = p;
  const el = p.getElement();
  if (wire && el) wire(el);
  if (el) requestAnimationFrame(() => { if (popupState.current === p) keepInView(m, el); });
  p.on('close', () => { if (popupState.current === p) popupState.current = null; });
}
/** A bubble wholly in the part of the map the screen shows (between the bar and the sheet): the map slides by what
 *  sticks out, its top edge first when it is taller than that. */
function keepInView(m: MLMap, el: HTMLElement): void {
  const pad = cameraPadding(), c = m.getContainer().getBoundingClientRect(), r = el.getBoundingClientRect();
  const top = c.top + pad.top - 8, bottom = c.bottom - pad.bottom + 8;
  let dy = r.bottom > bottom ? r.bottom - bottom : 0;
  if (r.top - dy < top) dy = r.top - top;
  const dx = r.left < c.left + 8 ? r.left - c.left - 8 : r.right > c.right - 8 ? r.right - c.right + 8 : 0;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) m.panBy([dx, dy], { duration: 250 });
}
/** The open bubble's title, changed in place (a name that arrives later): reopening it would flicker. */
export function setPopupTitle(text: string): void { const b = popupState.current?.getElement()?.querySelector('.pop b'); if (b) b.textContent = text; }
type VehicleInfo = { line: string; routeType: number; headsign: string; agency: string; delay?: number | null; stale: boolean; seen: Date; velocity?: number | null; trip: number; route: number | null; offDay?: boolean };
/** A vehicle's bubble: line, direction, delay, when it reported, speed; its line, with its trip chosen. */
export function vehiclePopup(m: MLMap, lngLat: LngLatLike, v: VehicleInfo): void {
  const d = v.delay != null ? live.delayMinutes(v.delay) : null;
  const delayTxt = d == null ? '' : d === 0 ? t('onTime') : t('liveDelay', { d: (d > 0 ? '+' : '') + d });
  const ago = Date.now() - new Date(v.seen).getTime();
  const html = `<div class="pop"><div class="row"><span class="chip t${v.routeType}"${chipStyle(v.routeType, v.agency)}>${esc(lineText(v.line))}</span><b>${v.headsign ? esc(t('toward', { headsign: v.headsign })) : ''}</b></div>` +
    `<div class="muted">${v.agency ? `<bdi>${esc(agencyName(v.agency))}</bdi> · ` : ''}${t('seenAgo', { time: clock(v.seen) })}${ago >= 180e3 ? ` (${t('agoMin', { n: Math.round(ago / 60000) })})` : ''}${v.velocity != null ? ` · ${Math.round(v.velocity)} ${t('kmh')}` : ''}</div>` +
    (d == null ? '' : `<div><span class="live ${v.stale ? 'unsure' : 'ok'}">${esc(delayTxt)}${v.stale ? ' ?' : ''}</span></div>`) +
    // a line the feed has no trips of today (it reports anyway): named, nothing to open
    (v.offDay ? `<div class="muted">${t('offDayLine')}</div></div>`
      // its line, this vehicle's trip chosen: every stop with when it gets there
      : `<div class="row"><button type="button" class="ghost" data-act="line" ${v.trip >= 0 || v.route != null ? '' : 'disabled'}>${t('popLine')}</button></div></div>`);
  openPopup(m, lngLat, html, (el) => {
    el.querySelector('[data-act="line"]')?.addEventListener('click', () => { closePopup(); if (v.trip >= 0) hooks.openTrip(v.trip, -1); else hooks.openLine(v.route!); });
  });
}
const stopPlace = (s: any) => ({ name: s.name, stops: s.stops && s.stops.length ? s.stops : [s.stop], lat: s.lat, lon: s.lon });
/** A stop tapped on the map. With nothing else in the sheet, the stop itself opens there (its lines, departures, from
 *  here and to here); while the sheet is about something else (results, a trip, a line, the trains between two
 *  stations), a tap never takes it away: a bubble names the stop, when that ride passes it, its lines, and offers the
 *  stop's details, from here and to here (on a line, its times at this stop). A station's badge is the whole station. */
export async function stopPopup(m: MLMap, lngLat: LngLatLike, stop: number, station?: unknown): Promise<void> {
  if (nav.isOpen('picker')) return;   // in pick mode the map tap handler picks the stop instead
  const st = station != null && station !== '' ? +(station as number) : undefined;
  const draw = viewFor(currentSheet()).draw;
  if (draw === 'nothing' || draw === 'ring' || draw === 'stop') { closePopup(); hooks.openStop(stop, st); return; }
  let info: any;
  try { info = await call('stopInfo', { stop, station: st ?? -1 }); } catch { return; }
  const at = hooks.timeAt(stop), onLine = nav.key.value === 'lineDetail';
  const html = `<div class="pop"><b>${esc(info.name)}</b><div class="muted">${esc(info.city || '')}${info.code ? ' · ' + esc(info.code) : ''}</div>` +
    (at != null ? `<div class="pop-at">${esc(t(onLine ? 'lineHere' : 'rideHere', { time: fmt(at) }))}</div>` : '') +
    `<div class="chips">${info.lines.slice(0, 8).map((l: any) => `<span class="chip t${l.type}" data-route="${l.route ?? ''}"${chipStyle(l.type, l.agency)}>${esc(lineText(l.label))}</span>`).join('')}</div>` +
    `<div class="row">${onLine ? `<button type="button" class="primary slim" data-act="times">${t('timesHere')}</button>` : ''}<button type="button" class="ghost" data-act="stop">${t('stopDetails')}</button><button type="button" class="ghost" data-act="from">${t('fromHere')}</button><button type="button" class="ghost" data-act="to">${t('toHere')}</button></div></div>`;
  openPopup(m, lngLat, html, (el) => {
    el.querySelector('[data-act="times"]')?.addEventListener('click', () => { closePopup(); hooks.lineAt(stop); });
    el.querySelector('[data-act="stop"]')?.addEventListener('click', () => { closePopup(); hooks.openStop(stop, st); });
    el.querySelector('[data-act="from"]')?.addEventListener('click', () => { closePopup(); hooks.planFrom(stopPlace(info)); });
    el.querySelector('[data-act="to"]')?.addEventListener('click', () => { closePopup(); hooks.planTo(stopPlace(info)); });
    for (const c of el.querySelectorAll<HTMLElement>('.chip[data-route]')) if (c.dataset.route !== '') c.addEventListener('click', () => { closePopup(); hooks.openLine(+c.dataset.route!); });
  });
}
/** A tap on the bare map (sheet collapsed): a bubble pointing at the spot, naming a place of the basemap under the
 *  finger, anything else by reverse geocoding (the name fills in when it arrives), with "to here" and "from here". */
export async function placeBubble(m: MLMap, e: { point: { x: number; y: number }; lngLat: { lng: number; lat: number } }): Promise<void> {
  const my = ++pick.seq;
  const poiLayers = ((m.getStyle().layers || []) as any[]).filter((l) => l.type === 'symbol' && /^poi/.test(l.id) && l.id !== 'poi_transit').map((l) => l.id);
  const r = 12, pois = poiLayers.length ? m.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]], { layers: poiLayers }) : [];
  const poi = pois.find((f) => f.properties && f.properties.name);
  const lngLat: [number, number] = poi ? ((poi.geometry as any).coordinates.slice() as [number, number]) : [e.lngLat.lng, e.lngLat.lat];
  let p = { name: poi ? (lang.value === 'he' ? poi.properties['name:he'] || poi.properties.name : poi.properties['name:en'] || poi.properties['name:latin'] || poi.properties.name) : '…', lat: lngLat[1], lon: lngLat[0] };
  openPopup(m, lngLat, `<div class="pop"><b>${esc(p.name)}</b><div class="row"><button type="button" class="primary slim" data-act="to">${t('toHere')}</button><button type="button" class="ghost" data-act="from">${t('fromHere')}</button></div></div>`, (el2) => {
    el2.querySelector('[data-act="to"]')?.addEventListener('click', () => { closePopup(); hooks.planTo(p); });
    el2.querySelector('[data-act="from"]')?.addEventListener('click', () => { closePopup(); hooks.planFrom(p); });
  });
  if (poi) return;
  const mine = popupState.current;
  try {
    const g: any = await call('reverse', { lat: lngLat[1], lon: lngLat[0] });
    p = { ...p, name: g.kind === 'point' ? t('pointName') : g.distance > 40 ? t('nearName', { name: g.name }) : g.name };
  } catch { p = { ...p, name: t('pointName') }; }
  if (my === pick.seq && popupState.current === mine) setPopupTitle(p.name);
}
/** Stop dots on a journey or line map answer a tap (stopPopup: a bubble, the sheet keeps the journey or line). */
export function wireStopLayers(m: MLMap, layers: string[]): void {
  for (const layer of layers) {
    m.on('click', layer, (e) => { const f = e.features && e.features[0]; if (f && f.properties.stop != null && f.properties.stop !== '') stopPopup(m, (f.geometry as any).coordinates, +f.properties.stop); });
    m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; });
  }
}
/** A triangle on the rim of a vehicle marker, pointing where it heads. */
function addHeading(el: HTMLElement, deg: number): void {
  if (deg < 0) return;
  const a = document.createElement('span'); a.className = 'heading'; a.style.transform = `rotate(${deg}deg)`;
  el.appendChild(a);
}
/** Every reporting vehicle of a line as a marker with its delay; the one running `mine` stands out. */
export function lineVehicleMarkers(m: MLMap, markers: Marker[], vs: any[], statuses: any[], routeType: number, mine: number | null, fallback: { line?: string; headsign?: string; agency?: string; route?: number | null } = {}): void {
  const icon = ic(routeType === 2 ? 'train' : routeType === 0 ? 'tram' : 'bus');
  const newest = live.newest(vs);
  vs.forEach((v, i) => {
    if (!live.isFresh(v, 300, newest)) return;   // last seen long before this line's newest report: its position says nothing now
    const st = statuses[i] || { trip: -1 };
    const el = document.createElement('div');
    const isMine = mine != null && st.trip === mine;
    el.className = 'wayli-bus lbl' + (st.stale || st.trip < 0 ? ' stale' : '') + (isMine ? ' mine' : '');
    const d = st.delay != null ? live.delayMinutes(st.delay) : null;
    el.innerHTML = `${icon}${isMine && d != null ? ` ${d > 0 ? '+' : ''}${d}` : ''}`;   // the number (minutes late) only on the rider's own vehicle; the bubble has it for the rest
    el.style.borderColor = routeColor(st.routeType ?? routeType, st.agency || fallback.agency);
    addHeading(el, heading(v));
    el.title = `${clock(v.recordedAt)}${st.headsign ? ' · ' + st.headsign : ''}`;
    el.addEventListener('click', (e) => { e.stopPropagation(); vehiclePopup(m, [v.lon, v.lat], { line: st.line || fallback.line || '', routeType: st.routeType ?? routeType, headsign: st.headsign || fallback.headsign || '', agency: st.agency || fallback.agency || '', delay: st.delay, stale: !!st.stale, seen: v.recordedAt, velocity: v.velocity, trip: st.trip, route: st.route ?? fallback.route ?? null }); });
    markers.push(new maplibregl.Marker({ element: el }).setLngLat([v.lon, v.lat]).addTo(m));
  });
}
