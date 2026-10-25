// The live vehicles. The relay (relay/relay.js) serves Hasadna's newest raw SIRI snapshot, about a minute old, which
// the data worker reads (worker/vehicles.js); when it cannot, Hasadna's Open Bus API answers instead
// (open-bus-stride-api.hasadna.org.il, CC-BY: the Ministry of Transport's SIRI feed recorded, with open CORS, no
// key), 15 minutes behind at rush hour. What leaves the phone: the line numbers and the area the rider looks at. One
// switch in settings turns live data off. SIRI's line_ref is the GTFS route_id and a ride is known by its scheduled
// start, so a vehicle is matched to a timetable trip by (route, first departure) with no extra data.
import { secondsOn } from './clock.js';

const STRIDE = 'https://open-bus-stride-api.hasadna.org.il';

async function get(path, params, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  const u = new URL(STRIDE + path);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok) throw new Error(`live HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}
const iso = (date) => date.toISOString().replace(/\.\d+Z$/, '+00:00');
function norm(v) {
  return { lineRef: v.siri_route__line_ref, lat: v.lat, lon: v.lon, bearing: v.bearing, velocity: v.velocity,
    recordedAt: new Date(v.recorded_at_time), scheduledStart: new Date(v.siri_ride__scheduled_start_time),
    rideId: v.siri_ride__id, vehicleRef: v.siri_ride__vehicle_ref, fromStart: v.distance_from_journey_start };
}
let newestSeen = 0;   // ms: the newest report any query returned; "fresh" is measured against it, not the clock
/** A vehicle whose last report is within five minutes of the newest report of its own set (`ref`, a Date or ms;
 *  by default the newest seen anywhere). The feed lags unevenly, area by area and operator by operator (measured
 *  2026-10-19 15:34: Tel Aviv 20 min behind, the country 6), so a set is judged against its own newest report.
 *  @param {any} v @param {number} [windowSec] @param {Date|number|null} [ref] */
export function isFresh(v, windowSec = 300, ref = null) {
  const r = ref ? (ref instanceof Date ? ref.getTime() : ref) : newestSeen || Date.now();
  return r - v.recordedAt.getTime() <= windowSec * 1000;
}
/** Latest position per ride (a few rows carry impossible future times; they are dropped). */
function latest(rows) {
  const by = new Map();
  const horizon = Date.now() + 600e3;
  for (const r of rows) {
    const v = norm(r);
    if (Number.isNaN(v.recordedAt.getTime()) || v.recordedAt.getTime() > horizon) continue;
    const o = by.get(v.rideId);
    if (!o || v.recordedAt > o.recordedAt) by.set(v.rideId, v);
  }
  for (const v of by.values()) if (v.recordedAt.getTime() > newestSeen) newestSeen = v.recordedAt.getTime();
  return Array.from(by.values());
}
// The sort order decides whether the database answers in a few seconds or times out: with a closed
// recorded_at_time window, "recorded_at_time desc" answers in 1-3 s for line, area and operator queries
// (measured 2026-10-17/18). "id desc" was fast too but ids follow ingestion order, and the ingestion
// backfills old snapshots, so its first rows were not the newest positions.
const window = (sinceSec) => ({ recorded_at_time_from: iso(new Date(Date.now() - sinceSec * 1000)), recorded_at_time_to: iso(new Date(Date.now() + 60e3)) });
// Hasadna's feed sometimes lags: the newest position can be 20 minutes old (measured 2026-10-18 morning).
// Queries therefore look back half an hour and callers show the age; the newest rows come first, so
// the limit only trims old reports. A delay seen twenty minutes ago is still worth more than the timetable alone.
// The newest snapshot, through Wayli's relay (relay/relay.js): about a minute old where Hasadna's database runs up
// to 15 minutes behind at rush hour. The app points `snapshot.query` at it (through the data worker); every question
// below asks it first, and Hasadna's database answers when it fails.
// Two addresses for the same relay, tried in this order: our own domain first (some mobile carriers block all of
// workers.dev, Gadi's among them), then Cloudflare's default address.
export const RELAY_URLS = ['https://relay.waynet.app/siri/latest', 'https://wayli-relay.wayli.workers.dev/siri/latest'];
/** @type {{ query: null | ((filter: object) => Promise<any[]>) }} filter: {line} | {box} | {operator} */
export const snapshot = { query: null };
/** Where the last live answer came from: the relay, or Hasadna's database and why the relay was not used. */
export const source = { relay: true, why: '' };
async function fromSnapshot(filter) {
  if (!snapshot.query) { source.relay = false; source.why = 'not ready'; return null; }
  try {
    const vs = await snapshot.query(filter);
    for (const v of vs) if (v.recordedAt.getTime() > newestSeen) newestSeen = v.recordedAt.getTime();
    source.relay = true; source.why = '';
    return vs;
  } catch (e) { source.relay = false; source.why = e instanceof Error ? e.message : String(e); return null; }
}
/** Vehicles of one line (GTFS route_id) seen in the last sinceSec seconds. */
export async function vehiclesByLine(routeId, { sinceSec = 1800, limit = 200, timeoutMs } = {}) {
  const s = await fromSnapshot({ line: routeId }); if (s) return s;
  const rows = await get('/siri_vehicle_locations/list', { siri_routes__line_ref: routeId, ...window(sinceSec), order_by: 'recorded_at_time desc', limit }, timeoutMs);
  return latest(rows);
}
/** Vehicles inside a box {south, west, north, east}. */
export async function vehiclesInBounds(b, { sinceSec = 1800, limit = 1200, timeoutMs } = {}) {
  const s = await fromSnapshot({ box: { south: b.south, north: b.north, west: b.west, east: b.east } }); if (s) return s;
  const rows = await get('/siri_vehicle_locations/list', {
    ...window(sinceSec), order_by: 'recorded_at_time desc', limit,
    lat__greater_or_equal: b.south.toFixed(4), lat__lower_or_equal: b.north.toFixed(4),
    lon__greater_or_equal: b.west.toFixed(4), lon__lower_or_equal: b.east.toFixed(4),
  }, timeoutMs);
  return latest(rows);
}
/** Vehicles around a point. */
export function vehiclesNear(lat, lon, radiusKm = 6, opts = {}) {
  const dlat = radiusKm / 110.5, dlon = radiusKm / (111.3 * Math.cos(lat * Math.PI / 180));
  return vehiclesInBounds({ south: lat - dlat, north: lat + dlat, west: lon - dlon, east: lon + dlon }, opts);
}
/** Every train in the country (Israel Railways is SIRI operator 2): one cheap query. */
export async function trains({ sinceSec = 1800, limit = 500, timeoutMs } = {}) {
  const s = await fromSnapshot({ operator: 2 }); if (s) return s;
  const rows = await get('/siri_vehicle_locations/list', { siri_routes__operator_ref: 2, ...window(sinceSec), order_by: 'recorded_at_time desc', limit }, timeoutMs);
  return latest(rows);
}
/** What a plan from here needs: the vehicles around the origin plus every train, each query on its own. */
export async function vehiclesForPlanning(lat, lon, { timeoutMs = 8000, radiusKm = 12 } = {}) {
  const [near, rail] = await Promise.all([
    vehiclesNear(lat, lon, radiusKm, { sinceSec: 1800, limit: 1200, timeoutMs }).catch(() => null),
    trains({ timeoutMs }).catch(() => null),
  ]);
  if (!near && !rail) throw new Error('live unavailable');
  const by = new Map();
  for (const v of [...(near || []), ...(rail || [])]) { const o = by.get(v.rideId); if (!o || v.recordedAt > o.recordedAt) by.set(v.rideId, v); }
  return Array.from(by.values());
}
/** When the newest of these vehicles was seen, or null. */
export function newest(vehicles) {
  // the newest report, but not a lone one far ahead of the rest: a vehicle with a wrong clock would make every true
  // report around it look old (and the map hid them all)
  const ts = vehicles.map((v) => v.recordedAt.getTime()).filter((x) => !Number.isNaN(x)).sort((a, b) => b - a);
  let i = 0;
  while (i < ts.length - 1 && ts[i] - ts[i + 1] > 120e3) i++;
  return ts.length ? new Date(ts[i]) : null;
}

// ------------------------------------------------------------------ matching vehicles to trips
/** The vehicle running a given trip: same line, scheduled start equal to the trip's first departure. */
export function matchTrip(vehicles, routeId, firstDep, day) {
  let best = null;
  for (const v of vehicles) {
    if (String(v.lineRef) !== String(routeId)) continue;
    const start = secondsOn(v.scheduledStart, day);
    if (Math.abs(start - firstDep) > 90) continue;
    if (!best || v.recordedAt > best.recordedAt) best = v;
  }
  return best;
}
