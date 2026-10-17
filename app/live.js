// Wayli live data. Hasadna's Open Bus project (open-bus-stride-api.hasadna.org.il, CC-BY) records the
// Ministry of Transport's SIRI vehicle feed and serves it with open CORS, so the phone asks it directly:
// no key, no relay, no server of ours. What leaves the phone: the line numbers and the area the rider is
// looking at, to Hasadna (a non-profit). Off by default nowhere, but one switch in settings turns it off.
// SIRI's line_ref is the GTFS route_id, and a ride is identified by its scheduled start time, so a live
// vehicle is matched to a timetable trip by (route, first departure) with no extra data.

export const STRIDE = 'https://open-bus-stride-api.hasadna.org.il';
const TZ = 'Asia/Jerusalem';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ------------------------------------------------------------------ Israel time and service days
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
/** Date/time parts in Israel, whatever the phone's zone. */
export function ilParts(date = new Date()) {
  const o = {};
  for (const p of fmt.formatToParts(date)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second, dow: DOW.indexOf(o.weekday) };
}
export const dayStr = (y, m, d) => `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
const utcDay = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
export function shiftDay(s, n) { const d = new Date(utcDay(s) + n * 86400000); return dayStr(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
/**
 * The service day a moment belongs to: a GTFS day runs past midnight, so 00:10 is "24:10 of yesterday".
 * Until 03:00 the previous day's timetable is the right one.
 */
export function serviceDay(date = new Date()) {
  const p = ilParts(date);
  let day = dayStr(p.y, p.m, p.d), sec = p.h * 3600 + p.mi * 60 + p.s;
  if (p.h < 3) { day = shiftDay(day, -1); sec += 86400; }
  return { day, seconds: sec, lateNight: p.h < 3 };
}
/** Seconds since the midnight (Israel) that starts the given service day. */
export function secondsOn(date, day) {
  const p = ilParts(date);
  const diff = Math.round((utcDay(dayStr(p.y, p.m, p.d)) - utcDay(day)) / 86400000);
  return diff * 86400 + p.h * 3600 + p.mi * 60 + p.s;
}
export const nowOn = (day) => secondsOn(new Date(), day);

// ------------------------------------------------------------------ fetching
async function get(path, params, timeoutMs = 15000) {
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
  return Array.from(by.values());
}
// The sort order decides whether the database answers in a second or times out (measured 2026-10-17):
// a line query must sort by recorded_at_time, an area query by id. Both get a closed time window.
const window = (sinceSec) => ({ recorded_at_time_from: iso(new Date(Date.now() - sinceSec * 1000)), recorded_at_time_to: iso(new Date(Date.now() + 60e3)) });
/** Vehicles of one line (GTFS route_id) seen in the last sinceSec seconds. */
export async function vehiclesByLine(routeId, { sinceSec = 300, limit = 80 } = {}) {
  const rows = await get('/siri_vehicle_locations/list', { siri_routes__line_ref: routeId, ...window(sinceSec), order_by: 'recorded_at_time desc', limit });
  return latest(rows);
}
/** Vehicles around a point. */
export async function vehiclesNear(lat, lon, radiusKm = 6, { sinceSec = 150, limit = 500 } = {}) {
  const dlat = radiusKm / 110.5, dlon = radiusKm / (111.3 * Math.cos(lat * Math.PI / 180));
  const rows = await get('/siri_vehicle_locations/list', {
    ...window(sinceSec), order_by: 'id desc', limit,
    lat__greater_or_equal: (lat - dlat).toFixed(4), lat__lower_or_equal: (lat + dlat).toFixed(4),
    lon__greater_or_equal: (lon - dlon).toFixed(4), lon__lower_or_equal: (lon + dlon).toFixed(4),
  });
  return latest(rows);
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
/** Metres between two points, flat-earth (fine within a city). */
export function metres(lat1, lon1, lat2, lon2) {
  const kx = 111320 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180), ky = 110540;
  const dx = (lon2 - lon1) * kx, dy = (lat2 - lat1) * ky;
  return Math.sqrt(dx * dx + dy * dy);
}
/** Where along a stop sequence a point is: the nearest segment, the fraction along it, and how far off. */
export function projectOnStops(lat, lon, stops) {
  let best = { index: 0, frac: 0, metres: Infinity };
  const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
  for (let i = 0; i < stops.length - 1; i++) {
    const ax = (stops[i].lon - lon) * kx, ay = (stops[i].lat - lat) * ky;
    const bx = (stops[i + 1].lon - lon) * kx, by = (stops[i + 1].lat - lat) * ky;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let f = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
    f = Math.max(0, Math.min(1, f));
    const px = ax + f * dx, py = ay + f * dy, d = Math.sqrt(px * px + py * py);
    if (d < best.metres) best = { index: i, frac: f, metres: d };
  }
  return best;
}
/**
 * How late a vehicle runs, from its position against its trip's schedule: the scheduled time at the
 * point of the trip it is at, compared with when it was seen there. A vehicle still at the first stop
 * is late only once its start time has passed.
 */
export function estimateDelay(vehicle, stops, day) {
  if (!stops || stops.length < 2) return null;
  const pr = projectOnStops(vehicle.lat, vehicle.lon, stops);
  if (pr.metres > 600) return null;   // not on this trip's path (or a very different route shape)
  const seen = secondsOn(vehicle.recordedAt, day);
  let delay;
  if (pr.index === 0 && pr.frac < 0.05) delay = Math.max(0, seen - stops[0].dep);
  else {
    const a = stops[pr.index].dep, b = stops[pr.index + 1].arr;
    delay = seen - (a + pr.frac * Math.max(0, b - a));
  }
  delay = Math.max(-900, Math.min(5400, Math.round(delay)));
  const ageSec = (Date.now() - vehicle.recordedAt.getTime()) / 1000;
  return { delay, index: pr.index, frac: pr.frac, offPath: pr.metres, seen, ageSec, stale: ageSec > 240, vehicle };
}
/** The live time at a stop of the trip, given a delay estimate; passed when the vehicle is beyond it. */
export function liveAt(est, stops, stopIndex) {
  if (!est) return null;
  const passed = est.index > stopIndex || (est.index === stopIndex && est.frac > 0.2);
  return { time: stops[stopIndex].dep + est.delay, delay: est.delay, passed, stale: est.stale };
}
/** Rounded delay for display: minutes, "on time" within a minute. */
export function delayMinutes(delay) { return Math.round(delay / 60); }
