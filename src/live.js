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
/** Latest position per ride (a few rows carry impossible future times; they are dropped). */
let newestSeen = 0;   // ms: the newest report any query returned; "fresh" is measured against it, not the clock
/** A vehicle whose last report is within five minutes of the newest report of its own set (`ref`, a Date or ms;
 *  by default the newest seen anywhere). The feed lags unevenly, area by area and operator by operator (measured
 *  2026-10-19 15:34: Tel Aviv 20 min behind, the country 6), so a set is judged against its own newest report.
 *  @param {any} v @param {number} [windowSec] @param {Date|number|null} [ref] */
export function isFresh(v, windowSec = 300, ref = null) {
  const r = ref ? (ref instanceof Date ? ref.getTime() : ref) : newestSeen || Date.now();
  return r - v.recordedAt.getTime() <= windowSec * 1000;
}
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
// The newest snapshot, through Wayli's relay (worker/relay.js): about a minute old where Hasadna's database runs up
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
// ------------------------------------------------------------------ trains: learned running times
// A train does not run at one speed between stations: it pulls out slowly, runs fast, brakes, and some sections are
// slow. pipeline/railtimes.py learns from the last days' positions how long each section between two stations
// really takes and how the time spreads along it, and how long trains stand at each station. With it a train's
// position says when it reaches the next station, and from there each later one: it leaves a station no earlier
// than the timetable, after its usual stand. Sections never seen fall back to the timetable's.
/** @type {{ s: Record<string, number[]>, d: Record<string, number>, h?: number } | null}
 *  s: "code>code" -> [run, g0..g10]; d: code -> dwell; h: seconds a late train makes up per station beyond the next */
let railTimes = null;
export function setRailTimes(m) { railTimes = m && m.s ? m : null; }
const AT_STATION = 300;   // m: a train this close to a station is at it (the same in pipeline/railtimes.py)
const section = (stops, k) => (railTimes && stops[k].code != null && stops[k + 1].code != null ? railTimes.s[`${stops[k].code}>${stops[k + 1].code}`] || null : null);
const along = (g, x) => { const p = x * 10, i = Math.min(9, Math.floor(p)); return g[i + 1] + (g[i + 2] - g[i + 1]) * (p - i); };   // g[0] is the run
/** A train's times from here on, from the learned sections: arrival and departure at each later station. */
function railAhead(stops, pr, seen, lat, lon) {
  const n = stops.length, k = pr.index;
  let at = -1;
  if (metres(lat, lon, stops[k].lat, stops[k].lon) <= AT_STATION) at = k;
  else if (metres(lat, lon, stops[k + 1].lat, stops[k + 1].lon) <= AT_STATION) at = k + 1;
  if (!section(stops, Math.min(at >= 0 ? at : k, n - 2))) return null;
  const run = (j) => { const m = section(stops, j); return m ? m[0] : Math.max(0, stops[j + 1].arr - stops[j].dep); };
  const stand = (j) => { const d = railTimes.d[stops[j].code]; return d != null ? d : stops[j].dep - stops[j].arr; };
  const arr = new Array(n).fill(null), dep = new Array(n).fill(null);
  let i, t, index, frac;
  if (at >= 0) {   // standing at a station: it leaves at its time, or now if that has passed
    arr[at] = seen;
    if (at === n - 1) return { arr, dep, index: n - 2, frac: 1, next: at };
    dep[at] = Math.max(stops[at].dep, seen);
    t = dep[at] + run(at); i = at + 1; index = at; frac = 0;
  } else {         // between two: the learned profile says how much of the section's time is behind it
    const m = section(stops, k), done = m ? along(m, pr.frac) : pr.frac;
    dep[k] = seen - done * run(k);
    t = seen + (1 - done) * run(k); i = k + 1; index = k; frac = pr.frac;
  }
  const next = i;
  for (; i < n; i++) {
    arr[i] = t;
    if (i === n - 1) break;
    dep[i] = Math.max(stops[i].dep, t + stand(i));
    t = dep[i] + Math.max(run(i) / 2, run(i) - (railTimes.h || 0));
  }
  return { arr, dep, index, frac, next: at >= 0 ? at : next };
}

// ------------------------------------------------------------------ buses: learned running times
// The timetable gives a stretch of road the same time all day, and buses do not keep it (Namir Road southbound: 6.5
// minutes in the feed at every hour, 6.5 at 06:00 and 18 at 16:00 in fact). pipeline/bustimes.py learns from the last
// two weeks of positions how long buses take between each two consecutive stops, all lines pooled, by hour and kind of
// day. A bus's position then says when it reaches each stop ahead: the rest of the section it is on, then each
// section's learned time at the hour the bus will be there. Sections never seen fall back to the timetable's.
/** @type {{ idx: Map<string, number>, cells: Uint8Array, bands: number, kinds: number } | null} */
let busTimes = null;
/** The learned bus times (the file pipeline/bustimes.py writes, unpacked): a header, the sections' stop codes, the times. */
export function parseBusTimes(buf) {
  const dv = new DataView(buf), hl = dv.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const n = head.n, a = new Uint32Array(buf, 4 + hl, n), b = new Uint32Array(buf, 4 + hl + 4 * n, n);
  const idx = new Map();
  for (let i = 0; i < n; i++) idx.set(`${a[i]}>${b[i]}`, i);
  return { idx, cells: new Uint8Array(buf, 4 + hl + 8 * n, n * head.kinds * head.bands), bands: head.bands, kinds: head.kinds, built: head.built };
}
export function setBusTimes(m) { busTimes = m; }
export const hasBusTimes = () => !!busTimes;
/** 0 Sunday to Thursday, 1 Friday, 2 Saturday, for a service day YYYYMMDD. */
const kindOf = (day) => { const w = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8))).getUTCDay(); return w === 5 ? 1 : w === 6 ? 2 : 0; };
const bandOf = (sec) => { const h = Math.floor(sec / 3600); return h < 5 ? 0 : Math.min(busTimes.bands - 1, h - 5); };
const decode = (v) => (!v ? null : v <= 150 ? 2 * v : 300 + 15 * (v - 150));
/** The learned time of section k (stop k to stop k+1) for a bus there at `at`, else null. */
function busRun(stops, k, at, kind) {
  const i = busTimes && stops[k].code && stops[k + 1].code ? busTimes.idx.get(`${stops[k].code}>${stops[k + 1].code}`) : undefined;
  return i === undefined ? null : decode(busTimes.cells[(i * busTimes.kinds + kind) * busTimes.bands + bandOf(at)]);
}
/** How long section k usually takes at `at`: learned, else the timetable's. */
export function usualRun(stops, k, at, day) {
  const r = busTimes ? busRun(stops, k, at, kindOf(day)) : null;
  return r != null ? r : Math.max(0, stops[k + 1].arr - stops[k].dep);
}
/** The fastest the section is learned to run on that kind of day (free flow), else null. */
export function freeRun(code1, code2, day) {
  const i = busTimes ? busTimes.idx.get(`${code1}>${code2}`) : undefined;
  if (i === undefined) return null;
  let best = null;
  const o = (i * busTimes.kinds + kindOf(day)) * busTimes.bands;
  for (let b = 0; b < busTimes.bands; b++) { const v = decode(busTimes.cells[o + b]); if (v != null && (best == null || v < best)) best = v; }
  return best;
}

// How the roads run now: the data worker follows each bus across the snapshots it reads and sets, per section, how
// the buses that ran it in the last 15 minutes did against its usual time (`ratio`, `t` when, ms; `ride`). A section's
// time ahead is its usual time times the median of those ratios, shrunk towards 1 when there are few (n / (n + 2)), and
// fading back to the usual time for sections the bus reaches more than half an hour from now. Measured on held-out days
// (pipeline/bustimes.py --score).
/** @type {Map<string, { ratio: number, t: number, ride: string }[]>} */
let roadsNow = new Map();
export function setRoadsNow(m) { roadsNow = m; }
const ROADS_MS = 900e3, FADE_S = 1800;
/** The live factor of a section for a vehicle seen at `seenMs` (its own runs left out). */
export function roadFactor(code1, code2, seenMs, ride) {
  const v = roadsNow.get(`${code1}>${code2}`);
  if (!v) return 1;
  const rs = v.filter((x) => x.ride !== ride && x.t <= seenMs + 120e3 && x.t > seenMs - ROADS_MS).map((x) => x.ratio).sort((a, b) => a - b);
  if (!rs.length) return 1;
  const m = rs.length % 2 ? rs[(rs.length - 1) / 2] : (rs[rs.length / 2 - 1] + rs[rs.length / 2]) / 2;
  return 1 + (m - 1) * rs.length / (rs.length + 2);
}
/** A bus's arrival at each later stop, from where it is and the learned sections; null when none is known ahead. */
function busAhead(stops, pr, seen, day, seenMs, ride) {
  const n = stops.length, kind = kindOf(day);
  const run = (j, at) => {
    const r = busRun(stops, j, at, kind), base = r != null ? r : Math.max(0, stops[j + 1].arr - stops[j].dep);
    const w = Math.max(0, 1 - (at - seen) / FADE_S);
    return w > 0 && roadsNow.size ? base * (1 + (roadFactor(stops[j].code, stops[j + 1].code, seenMs, ride) - 1) * w) : base;
  };
  let known = false;
  for (let j = pr.index; j < n - 1 && !known; j++) known = busRun(stops, j, seen, kind) != null;
  if (!known) return null;
  const arr = new Array(n).fill(null);
  let t, i;
  if (pr.index === 0 && pr.frac < 0.05) {   // still at its first stop: it leaves at its time, or now if that has passed
    t = Math.max(stops[0].dep, seen); arr[0] = t; t += run(0, t);
  } else t = seen + (1 - pr.frac) * run(pr.index, seen);
  for (i = pr.index + 1; i < n; i++) { arr[i] = t; if (i < n - 1) t += run(i, t); }
  return { arr, dep: arr, index: pr.index, frac: pr.frac, next: pr.index + 1 };
}

/**
 * How late a vehicle runs, from its position against its trip's schedule: the scheduled time at the
 * point of the trip it is at, compared with when it was seen there. A vehicle still at the first stop
 * is late only once its start time has passed. A train with learned sections, or a bus with learned sections
 * ahead, gets its time at each later stop instead (`arr`, `dep`), and its delay is the one at the next stop.
 */
export function estimateDelay(vehicle, stops, day) {
  if (!stops || stops.length < 2) return null;
  const pr = projectOnStops(vehicle.lat, vehicle.lon, stops);
  if (pr.metres > 600) return null;   // not on this trip's path (or a very different route shape)
  const seen = secondsOn(vehicle.recordedAt, day);
  const ageSec = (Date.now() - vehicle.recordedAt.getTime()) / 1000;
  const ahead = (railTimes && railAhead(stops, pr, seen, vehicle.lat, vehicle.lon)) || (busTimes && busAhead(stops, pr, seen, day, vehicle.recordedAt.getTime(), vehicle.rideId));
  if (ahead) {
    const j = ahead.next, last = j === stops.length - 1;
    const delay = Math.max(-900, Math.min(5400, Math.round(last ? ahead.arr[j] - stops[j].arr : ahead.dep[j] - stops[j].dep)));
    return { delay, index: ahead.index, frac: ahead.frac, offPath: pr.metres, seen, ageSec, stale: ageSec > 240, vehicle, arr: ahead.arr, dep: ahead.dep };
  }
  let delay;
  if (pr.index === 0 && pr.frac < 0.05) delay = Math.max(0, seen - stops[0].dep);
  else {
    const a = stops[pr.index].dep, b = stops[pr.index + 1].arr;
    delay = seen - (a + pr.frac * Math.max(0, b - a));
  }
  delay = Math.max(-900, Math.min(5400, Math.round(delay)));
  return { delay, index: pr.index, frac: pr.frac, offPath: pr.metres, seen, ageSec, stale: ageSec > 240, vehicle };
}
/** The live time at a stop of the trip, given a delay estimate; passed when the vehicle is beyond it. */
export function liveAt(est, stops, stopIndex) {
  if (!est) return null;
  const passed = est.index > stopIndex || (est.index === stopIndex && est.frac > 0.2);
  const own = est.dep ? (est.dep[stopIndex] ?? est.arr[stopIndex]) : null;   // a train's own time there
  const time = own != null ? Math.round(own) : stops[stopIndex].dep + est.delay;
  return { time, delay: time - stops[stopIndex].dep, passed, stale: est.stale };
}
/** Rounded delay for display: minutes, "on time" within a minute. */
export function delayMinutes(delay) { return Math.round(delay / 60); }
