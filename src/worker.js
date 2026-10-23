// Wayli worker: holds the timetable and the street graph, answers every query off the main thread.
import { parseTimetable, searchStops, profile, rank, journeySig, routeLabel, stopName, stationName, cityName, routeHeadsign, parseHeadsign } from './raptor.js';
import { parseStreets, accessStops, route } from './streets.js';
import { parsePlaces, searchPlaces, kindLabel, reverseGeocode, placeAt } from './places.js';
import { estimateDelay, secondsOn, setRailTimes, parseBusTimes, setBusTimes, hasBusTimes, setRoadsNow, usualRun, freeRun, projectOnStops, metres } from './live.js';

let tt = null, st = null, pl = null, sh = null;
let lang = 'he';   // the language names are handed out in (setLang); the timetable carries what the feed translates

/** The compact shapes file: int32 coordinates (1e-5 degrees) per GTFS shape id. */
function parseShapes(ab) {
  const headerLen = new DataView(ab).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, headerLen)));
  const base = 4 + headerLen, out = { header };
  for (const s of header.sections) out[s.name] = new Int32Array(ab, base + s.offset, s.length);
  out.index = new Map();
  for (let i = 0; i < out.shapeId.length; i++) out.index.set(out.shapeId[i], i);
  return out;
}
/** Does this pattern have a course: a feed shape (loaded) or a track from the rail pairs? */
const hasCourse = (p) => !!tt.patShape && (tt.patShape[p] === -2 ? !!tt.railPairOff : tt.patShape[p] >= 0 && !!sh);
/** The course of a ride between two stops of a pattern, along the road or the track; null without one. */
function ridePath(p, bp, ap) {
  if (!tt.patShape) return null;
  const at = (i) => tt.patStopsOff[p] + i;
  if (tt.patShape[p] === -2) {   // a train: the track, one stored piece per pair of consecutive stations
    if (!tt.railPairOff) return null;
    const path = [];
    for (let i = bp; i < ap; i++) {
      const k = tt.patShapeSeg[at(i)], o = tt.railPairOff[k], e = tt.railPairOff[k + 1];
      for (let j = o + (i > bp ? 1 : 0); j < e; j++) path.push([tt.railLat[j] / 1e5, tt.railLon[j] / 1e5]);
    }
    return path.length >= 2 ? path : null;
  }
  if (!sh || tt.patShape[p] < 0) return null;
  const si = sh.index.get(tt.patShape[p]);
  if (si == null) return null;
  const off = sh.shapeOff[si], n = sh.shapeOff[si + 1] - off;
  const seg0 = tt.patShapeSeg[at(bp)], f0 = tt.patShapeFrac[at(bp)] / 65535, seg1 = tt.patShapeSeg[at(ap)], f1 = tt.patShapeFrac[at(ap)] / 65535;
  if (seg1 < seg0 || seg1 + 1 >= n) return null;
  const pt = (i) => [sh.ptLat[off + i] / 1e5, sh.ptLon[off + i] / 1e5];
  const lerp = (seg, f) => { const a = pt(seg), b = pt(seg + 1); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
  const path = [lerp(seg0, f0)];
  for (let i = seg0 + 1; i <= seg1; i++) path.push(pt(i));
  path.push(lerp(seg1, f1));
  return path;
}
const post = (m) => self.postMessage(m);

async function fetchContainer(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let u8;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      post({ type: 'progress', label, got, total });
    }
    u8 = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) { u8.set(c, o); o += c.length; }
  } else {
    u8 = new Uint8Array(await res.arrayBuffer());
  }
  post({ type: 'progress', label, got: u8.length, total: u8.length, unpacking: true });
  if (u8[0] === 0x1f && u8[1] === 0x8b) {
    if (typeof DecompressionStream !== 'function') throw new Error('this browser cannot decompress gzip');
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
  }
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((lon2 - lon1) * Math.PI / 360) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Lines (route labels) serving a stop, deduplicated, with their vehicle type. */
function linesAt(stop, limit = 12) {
  const seen = new Map();
  for (let i = tt.stopPatsOff[stop]; i < tt.stopPatsOff[stop + 1]; i++) {
    const p = tt.stopPats[2 * i];
    const r = tt.routes[tt.patRoute[p]];
    const label = routeLabel(r);
    if (!seen.has(label)) seen.set(label, { label, type: r[3], agency: r[2], route: tt.patRoute[p] });
  }
  return Array.from(seen.values()).slice(0, limit);
}

// names in the rider's language, falling back to the feed's Hebrew
const headsign = (ri) => routeHeadsign(tt, ri, lang);
const sName = (s) => stopName(tt, s, lang);
const stName = (p) => stationName(tt, p, lang);
const cName = (c) => cityName(tt, c, lang);

function stopOut(s) {
  return { stop: s, name: sName(s), city: cName(tt.stops[s][3]), code: tt.stops[s][2], lat: tt.stopLat[s], lon: tt.stopLon[s] };
}

/** Resolve a place into origin/destination entries for the planner. */
let stopRail = null;
/** Which stops trains call at: standing anywhere on such a station counts as being at the stop. */
function railStops() {
  if (stopRail) return stopRail;
  stopRail = new Uint8Array(tt.stops.length);
  for (let p = 0; p < tt.patRoute.length; p++) if (tt.routes[tt.patRoute[p]][3] === 2) for (let i = tt.patStopsOff[p]; i < tt.patStopsOff[p + 1]; i++) stopRail[tt.patStops[i]] = 1;
  return stopRail;
}
/** A route's id in the real-time feed: its GTFS route id, or null for a line with estimated times (pipeline/weekend.py),
 *  which no live feed carries. */
const liveId = (r) => (r[6] ? null : r[4] ?? null);
let stopLrt = null;
function lrtStops() {
  if (stopLrt) return stopLrt;
  stopLrt = new Uint8Array(tt.stops.length);
  for (let p = 0; p < tt.patRoute.length; p++) if (tt.routes[tt.patRoute[p]][3] === 0) for (let i = tt.patStopsOff[p]; i < tt.patStopsOff[p + 1]; i++) stopLrt[tt.patStops[i]] = 1;
  return stopLrt;
}
/** A trip's scheduled times, untouched by any live shift: from the stored start and deltas. */
function rawTimes(p, t) {
  const ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p], base = tt.tripTimesOff[p] + (t - tt.patTripsOff[p]) * ns;
  const dep = new Int32Array(ns), arr = new Int32Array(ns);
  let cur = tt.tripStart[t];
  for (let i = 0; i < ns; i++) { cur += tt.depDelta[base + i]; dep[i] = cur; arr[i] = cur - tt.dwell[base + i]; }
  return { dep, arr };
}
function resolvePlace(place, mode, maxSeconds) {
  if (place.stops) return { places: place.stops.map((s) => ({ stop: s, walk: 0 })), point: place.lat != null ? { lat: place.lat, lon: place.lon } : null };
  const { lat, lon } = place;
  if (st) {
    const places = accessStops(st, tt.stopNode, lat, lon, mode, maxSeconds, 30, tt.stopLat, tt.stopLon, railStops());
    if (places.length) return { places, point: { lat, lon }, streets: true };
  }
  // no street graph (yet): straight-line distance with a detour factor
  const speed = mode === 'bike' ? 4.0 : 1.2;
  const out = [];
  for (let s = 0; s < tt.stops.length; s++) {
    const d = haversine(lat, lon, tt.stopLat[s], tt.stopLon[s]);
    if (d > (mode === 'bike' ? 4000 : 800)) continue;
    out.push({ stop: s, walk: Math.round(d * 1.3 / speed + 30), mode });
  }
  out.sort((a, b) => a.walk - b.walk);
  return { places: out.slice(0, 40), point: { lat, lon }, streets: false };
}

// ---------------------------------------------------------------- live data in the timetable
// A plan "from now" first moves the delayed trips: each reported vehicle is matched to its trip
// (route id + first departure) and the delay estimated from its position shifts that trip's times from
// where it is onwards. Trips of a pattern stay in order at every stop (a trip never moves past the
// next one or before the previous one), so the router's binary searches hold. Everything is undone
// after the plan.
let routeById = null, routePats = null;
function indexRoutes() {
  routeById = new Map(); routePats = new Map();
  tt.routes.forEach((r, i) => { if (r[4] != null) routeById.set(String(r[4]), i); });
  for (let p = 0; p < tt.patRoute.length; p++) { const r = tt.patRoute[p]; if (!routePats.has(r)) routePats.set(r, []); routePats.get(r).push(p); }
}
// ---- lines as riders know them: a number and operator in an area, both directions and their variants together
let lineIdx = null;
/** What kind of vehicle runs a GTFS route type: rail, lrt (light rail), cable (the Carmelit and the cable car),
 *  taxi (shared taxis), flex (on demand) or bus. */
const modeOf = (type) => (type === 2 ? 'rail' : type === 0 ? 'lrt' : type === 5 || type === 6 || type === 7 ? 'cable' : type === 8 ? 'taxi' : type === 715 ? 'flex' : 'bus');
/** The two ends of a route as the feed names them ('origin-city<->destination-city-1#' to ['origin-city', 'destination-city']). */
function routeEnds(longName) {
  const parts = String(longName || '').split('<->');
  return parts.length === 2 ? parts.map((x) => x.replace(/-\d+[#א-ת]*$/, '').trim()) : null;
}
const endCity = (e) => { const i = e.lastIndexOf('-'); return i > 0 ? e.slice(i + 1).trim() : e; };
/** The pattern of a route with the most trips: what its line page and search rows describe. */
function mainPat(ri) {
  let best = -1, most = -1;
  for (const p of routePats.get(ri) || []) { const n = tt.patTripsOff[p + 1] - tt.patTripsOff[p]; if (n > most) { most = n; best = p; } }
  return best;
}
const tripsOf = (ri) => { let n = 0; for (const p of routePats.get(ri) || []) n += tt.patTripsOff[p + 1] - tt.patTripsOff[p]; return n; };
/** A pattern's first and last stop by name (a train's stations). */
function endNames(p) {
  if (p < 0) return null;
  const nm = (s) => (tt.stopParent[s] >= 0 && stName(tt.stopParent[s])) || sName(s);
  return [nm(tt.patStops[tt.patStopsOff[p]]), nm(tt.patStops[tt.patStopsOff[p + 1] - 1])];
}
function indexLines() {
  if (!routePats) indexRoutes();
  const groups = new Map();
  tt.routes.forEach((r, i) => {
    if (!(routePats.get(i) || []).length) return;
    const mode = modeOf(r[3]), ends = routeEnds(r[1]);
    // trains have no numbers: a train line is its two stations. Any other line is its code in the feed (the "makat" its
    // directions and variants share), or, in a timetable built before it was kept, its number and operator where it runs.
    const key = mode === 'rail' ? `rail|${ends ? ends.slice().sort().join('|') : r[1]}`
      : r[5] ? `${mode}|${r[2]}|${r[5]}` : `${mode}|${routeLabel(r)}|${r[2]}|${ends ? ends.map(endCity).sort().join('|') : ''}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, mode, label: routeLabel(r), routes: [], trips: 0, names: [] }));
    g.routes.push(i); g.trips += tripsOf(i);
    if (mode === 'rail' && ends) for (const e of ends) { const x = e.toLowerCase(); if (!g.names.includes(x)) g.names.push(x); }
  });
  lineIdx = { groups: Array.from(groups.values()), byRoute: new Map() };
  lineIdx.groups.forEach((g, n) => { for (const ri of g.routes) lineIdx.byRoute.set(ri, n); });
  // a train line is also found by its stations' names in the rider's language
  lineIdx.groups.forEach((g) => { if (g.mode === 'rail') for (const x of endNames(mainPat(g.routes[0])) || []) if (x && !g.names.includes(x.toLowerCase())) g.names.push(x.toLowerCase()); });
}
/** Hebrew written with or without the extra yod and vav (קריית / קרית, תיכון / תכון) reads as one. */
const spell = (s) => s.replace(/יי/g, 'י').replace(/וו/g, 'ו').replace(/['"״׳`]/g, '');
/** Where a line runs, as text to match words against: its cities and every direction's destination, in the rider's
 *  language and in Hebrew (the feed's own). */
function placeText(g) {
  if (g.text == null) {
    const parts = [];
    for (const d of lineDirs(g)) { parts.push(d.headsign, parseHeadsign(tt.routes[d.route][1])); const p = mainPat(d.route); if (p >= 0) for (const k of [tt.patStopsOff[p], tt.patStopsOff[p + 1] - 1]) parts.push(cName(tt.stops[tt.patStops[k]][3])); }
    for (const ri of g.routes) { const e = routeEnds(tt.routes[ri][1]); if (e) parts.push(...e); }
    g.text = spell(parts.join(' ').toLowerCase());
  }
  return g.text;
}
/** A line's directions, the busiest first: one per destination, standing for the variants that share it. */
function lineDirs(g) {
  const dirs = new Map();
  for (const ri of g.routes) {
    const k = parseHeadsign(tt.routes[ri][1]), n = tripsOf(ri);
    let d = dirs.get(k);
    if (!d) dirs.set(k, (d = { route: ri, most: -1, trips: 0 }));
    d.trips += n; if (n > d.most) { d.most = n; d.route = ri; }
  }
  return [...dirs.values()].sort((a, b) => b.trips - a.trips).map((d) => ({ route: d.route, headsign: headsign(d.route), trips: d.trips }));
}
/** A line for the search list: its label, where it runs (a train's stations, another line's cities), its directions. */
function groupOut(n, dist) {
  const g = lineIdx.groups[n], dirs = lineDirs(g), r = tt.routes[dirs[0].route], p = mainPat(dirs[0].route);
  let area = [];
  if (g.mode === 'rail') area = endNames(p) || [];
  else if (p >= 0) { const a = cName(tt.stops[tt.patStops[tt.patStopsOff[p]]][3]), b = cName(tt.stops[tt.patStops[tt.patStopsOff[p + 1] - 1]][3]); area = a === b ? [a] : [a, b]; }
  return { key: g.key, mode: g.mode, line: g.label, agency: r[2], routeType: r[3], estimated: !!r[6], trips: g.trips, area: area.filter(Boolean), dirs: dirs.slice(0, 4), dist: Number.isFinite(dist) ? Math.round(dist) : null };
}
/** The lines with a stop within `radius` m of a point, each with the distance to its nearest such stop. */
function linesNear(lat, lon, radius) {
  if (!lineIdx) indexLines();
  const out = new Map();
  const dlat = radius / 110500, dlon = radius / (111300 * Math.cos(lat * Math.PI / 180));
  for (let s = 0; s < tt.stops.length; s++) {
    if (Math.abs(tt.stopLat[s] - lat) > dlat || Math.abs(tt.stopLon[s] - lon) > dlon) continue;
    const d = haversine(lat, lon, tt.stopLat[s], tt.stopLon[s]);
    if (d > radius) continue;
    for (let i = tt.stopPatsOff[s]; i < tt.stopPatsOff[s + 1]; i++) {
      const n = lineIdx.byRoute.get(tt.patRoute[tt.stopPats[2 * i]]);
      if (n != null && !(out.get(n) <= d)) out.set(n, d);
    }
  }
  return out;
}
/** The trip of a route whose first departure is at `start` (seconds on the loaded day), else -1. */
function tripFor(routeId, start) {
  if (!routeById) indexRoutes();
  const ri = routeById.get(String(routeId));
  if (ri == null) return -1;
  for (const p of routePats.get(ri) || []) {
    const ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p];
    for (let t = tt.patTripsOff[p]; t < tt.patTripsOff[p + 1]; t++) if (Math.abs(tt.dep[tt.tripTimesOff[p] + (t - tt.patTripsOff[p]) * ns] - start) <= 90) return t;
  }
  return -1;
}
function tripStopList(t) {
  const p = tt.tripPat[t], ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p], base = tt.tripTimesOff[p] + (t - tt.patTripsOff[p]) * ns;
  const out = [];
  for (let i = 0; i < ns; i++) { const s = tt.patStops[tt.patStopsOff[p] + i]; out.push({ lat: tt.stopLat[s], lon: tt.stopLon[s], code: tt.stops[s][2], arr: tt.arr[base + i], dep: tt.dep[base + i] }); }
  return { p, ns, base, stops: out };
}
let liveEdits = [], tripLive = new Map();
function applyLive(vehicles) {
  const day = tt.header.date, now = Date.now();
  const byTrip = new Map();   // the latest report per trip
  for (const v of vehicles) {
    const rec = new Date(v.recordedAt), start = new Date(v.scheduledStart);
    const age = (now - rec.getTime()) / 1000;
    if (Number.isNaN(age) || age > 1800 || age < -120) continue;
    const t = tripFor(v.lineRef, secondsOn(start, day));
    if (t < 0) continue;
    const o = byTrip.get(t);
    if (!o || rec > o.rec) byTrip.set(t, { v, rec });
  }
  for (const [t, { v, rec }] of byTrip) {
    const { p, ns, base, stops } = tripStopList(t);
    const est = estimateDelay({ lat: v.lat, lon: v.lon, recordedAt: rec, rideId: v.rideId }, stops, day);
    if (!est) continue;
    tripLive.set(t, { delay: est.delay, index: est.index, seen: rec.getTime(), stale: est.ageSec > 240, lat: v.lat, lon: v.lon });
    if (Math.abs(est.delay) < 60 && !est.dep) continue;   // a train with learned sections has its own time at each station
    const prevBase = t > tt.patTripsOff[p] ? base - ns : -1, nextBase = t + 1 < tt.patTripsOff[p + 1] ? base + ns : -1;
    for (let i = est.index; i < ns; i++) {
      const idx = base + i;
      let nd = est.dep && est.dep[i] != null ? Math.round(est.dep[i]) : tt.dep[idx] + est.delay;
      let na = est.arr && est.arr[i] != null ? Math.round(est.arr[i]) : est.dep && est.dep[i] != null ? nd : tt.arr[idx] + est.delay;
      if (nextBase >= 0) { nd = Math.min(nd, tt.dep[nextBase + i]); na = Math.min(na, tt.arr[nextBase + i]); }
      if (prevBase >= 0) { nd = Math.max(nd, tt.dep[prevBase + i]); na = Math.max(na, tt.arr[prevBase + i]); }
      if (na > nd) na = nd;
      liveEdits.push(idx, tt.dep[idx], tt.arr[idx]);
      tt.dep[idx] = nd; tt.arr[idx] = na;
    }
  }
  return tripLive.size;
}
function revertLive() {
  for (let i = liveEdits.length - 3; i >= 0; i -= 3) { tt.dep[liveEdits[i]] = liveEdits[i + 1]; tt.arr[liveEdits[i]] = liveEdits[i + 2]; }
  liveEdits = []; tripLive = new Map();
}

function legOut(l, q) {
  const o = { type: l.type, depart: l.depart, arrive: l.arrive, seconds: l.seconds };
  if (l.type === 'ride') {
    const p = l.pattern, ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p];
    const base = tt.tripTimesOff[p] + (l.trip - tt.patTripsOff[p]) * ns;
    let bp = -1;   // board position on the pattern; a pattern can pass a stop twice, so match the time too
    for (let i = 0; i < ns; i++) if (tt.patStops[tt.patStopsOff[p] + i] === l.from && tt.dep[base + i] === l.depart) { bp = i; break; }
    const raw = rawTimes(p, l.trip);   // the schedule: dep/arr may carry a live shift during a plan
    Object.assign(o, { from: stopOut(l.from), to: stopOut(l.to), stops: l.stops, line: routeLabel(l.route),
      headsign: headsign(tt.patRoute[p]), agency: l.route[2], routeType: l.route[3],
      trip: l.trip, routeId: liveId(l.route), estimated: !!l.route[6], route: tt.patRoute[p], firstDep: raw.dep[0], boardPos: bp, live: tripLive.get(l.trip) || null,
      schedDepart: bp >= 0 ? raw.dep[bp] : l.depart, schedArrive: bp >= 0 ? raw.arr[bp + l.stops] : l.arrive,
      pattern: p, alightPos: bp + l.stops,
      path: ridePath(p, bp, bp + l.stops) || l.via.map((s) => [tt.stopLat[s], tt.stopLon[s]]), pathKind: hasCourse(p) ? 'shape' : 'stops',
      // every stop of the leg with its times, for "get off in N stops" and the expandable stop list
      stopsAlong: l.via.map((s, i) => ({ stop: s, name: sName(s), lat: tt.stopLat[s], lon: tt.stopLon[s], arr: tt.arr[base + bp + i], dep: tt.dep[base + bp + i] })) });
  } else if (l.type === 'walk') {
    const path = streetPath([tt.stopLat[l.from], tt.stopLon[l.from]], [tt.stopLat[l.to], tt.stopLon[l.to]], 'walk');
    Object.assign(o, { from: stopOut(l.from), to: stopOut(l.to), path: path || [[tt.stopLat[l.from], tt.stopLon[l.from]], [tt.stopLat[l.to], tt.stopLon[l.to]]], pathKind: path ? 'street' : 'straight' });
  } else if (l.type === 'access') {
    const p = q.from.places.find((x) => x.stop === l.to);
    const path = pathTo(q.from.point, l.to, p && p.mode);
    Object.assign(o, { to: stopOut(l.to), mode: p && p.mode === 'bike' ? 'bike' : 'walk', path, pathKind: path.length > 2 ? 'street' : 'straight' });
  } else if (l.type === 'egress') {
    const p = q.to.places.find((x) => x.stop === l.from);
    const path = pathTo(q.to.point, l.from, p && p.mode, true);
    Object.assign(o, { from: stopOut(l.from), mode: p && p.mode === 'bike' ? 'bike' : 'walk', path, pathKind: path.length > 2 ? 'street' : 'straight' });
  }
  return o;
}

/** The way along the streets from a to b ([lat, lon] each), both ends included, or null without the street graph. */
function streetPath(a, b, mode) {
  if (!st) return null;
  const r = route(st, a[0], a[1], b[0], b[1], mode === 'bike' ? 'bike' : 'walk', 3600);
  return r && r.path.length ? [a, ...r.path, b] : null;
}
function pathTo(point, stop, mode, reverse) {
  if (!point) return [];
  const a = [point.lat, point.lon], b = [tt.stopLat[stop], tt.stopLon[stop]];
  const path = streetPath(a, b, mode) || [a, b];
  return reverse ? path.reverse() : path;
}

/**
 * Where to change between the same two vehicles: the router keeps the first place it finds that works, and every other
 * gives the same arrival. Of all the places where the second can be caught from the first (the same stop, or a short
 * walk between stops), take one with time to spare (2 minutes or more, when there is one), then the least walking,
 * then the most time to spare. (2026-10-22, Gadi: the 56 to Ibn Gabirol/Arlosoroff, a 3-minute walk and 2 minutes to
 * catch the 61, when the 61 passes Rabin Square, on the 56's way, 9 minutes after the 56 is there.) Changes the
 * journey's legs in place; the vehicles, and so the arrival, stay.
 */
function easierTransfers(j) {
  const L = j.legs;
  const pos = (l) => {   // the leg's boarding position on its pattern (a pattern can pass a stop twice: match the time)
    const p = l.pattern, ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p], base = tt.tripTimesOff[p] + (l.trip - tt.patTripsOff[p]) * ns;
    for (let i = 0; i < ns; i++) if (tt.patStops[tt.patStopsOff[p] + i] === l.from && tt.dep[base + i] === l.depart) return { p, ns, base, bp: i };
    return null;
  };
  const stopsOf = (p, a, b) => Array.from(tt.patStops.subarray(tt.patStopsOff[p] + a, tt.patStopsOff[p] + b + 1));
  for (let i = 0; i < L.length; i++) {
    const A = L[i]; if (A.type !== 'ride') continue;
    const w = L[i + 1] && L[i + 1].type === 'walk' ? L[i + 1] : null, B = L[i + (w ? 2 : 1)];
    if (!B || B.type !== 'ride') continue;
    const a = pos(A), b = pos(B); if (!a || !b) continue;
    const apA = a.bp + A.stops, apB = b.bp + B.stops;
    const score = (walk, spare) => [spare >= 120 ? 0 : 1, walk, -spare];
    const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    let best = { score: score(w ? w.seconds : 0, B.depart - A.arrive - (w ? w.seconds : 0)), ia: apA, jb: b.bp, walk: w ? w.seconds : 0 };
    for (let ia = a.bp + 1; ia < a.ns; ia++) {
      const sa = tt.patStops[tt.patStopsOff[a.p] + ia], ta = tt.arr[a.base + ia];
      for (let jb = 0; jb < apB; jb++) {
        const sb = tt.patStops[tt.patStopsOff[b.p] + jb], tb = tt.dep[b.base + jb];
        let walk = -1;
        if (sa === sb) walk = 0;
        else for (let x = tt.trOff[sa]; x < tt.trOff[sa + 1]; x++) if (tt.trTo[x] === sb) { walk = tt.trTime[x]; break; }
        if (walk < 0) continue;
        const spare = tb - ta - walk - (walk === 0 ? tt.slack : 0);   // as the router: a change at the same stop keeps a margin
        if (spare < 0) continue;
        const sc = score(walk, spare);
        if (cmp(sc, best.score) < 0) best = { score: sc, ia, jb, walk };
      }
    }
    if (best.ia === apA && best.jb === b.bp) continue;
    const sa = tt.patStops[tt.patStopsOff[a.p] + best.ia], sb = tt.patStops[tt.patStopsOff[b.p] + best.jb];
    Object.assign(A, { to: sa, arrive: tt.arr[a.base + best.ia], stops: best.ia - a.bp, seconds: tt.arr[a.base + best.ia] - A.depart, via: stopsOf(a.p, a.bp, best.ia) });
    Object.assign(B, { from: sb, depart: tt.dep[b.base + best.jb], stops: apB - best.jb, seconds: B.arrive - tt.dep[b.base + best.jb], via: stopsOf(b.p, best.jb, apB) });
    const walkLeg = best.walk > 0 ? { type: 'walk', from: sa, to: sb, seconds: best.walk, depart: A.arrive, arrive: A.arrive + best.walk } : null;
    L.splice(i + 1, w ? 1 : 0, ...(walkLeg ? [walkLeg] : []));
  }
  j.walkSeconds = L.reduce((t, l) => t + (l.type === 'ride' ? 0 : l.seconds), 0);
}

/** Walks one after the other are one walk: to the first stop and on to the next is "walk 17 min to HaShalom", not two
 *  lines (2026-10-22); likewise a walk to another stop and on from it to the destination. */
function mergeWalks(legs) {
  const out = [];
  const join = (a, b) => (a || []).concat((b || []).slice(1));
  for (const l of legs) {
    const p = out[out.length - 1];
    if (p && l.type === 'walk' && (p.type === 'access' || p.type === 'walk')) {
      out[out.length - 1] = { ...p, to: l.to, seconds: p.seconds + l.seconds, arrive: l.arrive, path: join(p.path, l.path), pathKind: p.pathKind === 'street' && l.pathKind === 'street' ? 'street' : 'straight' };
    } else if (p && l.type === 'egress' && p.type === 'walk') {
      out[out.length - 1] = { ...l, from: p.from, seconds: p.seconds + l.seconds, depart: p.depart, path: join(p.path, l.path), pathKind: p.pathKind === 'street' && l.pathKind === 'street' ? 'street' : 'straight' };
    } else out.push(l);
  }
  return out;
}

/**
 * The train in front of you: a direct way's earlier departures between the same two stops that arrive later. The
 * router drops them, being beaten (an earlier departure arriving later), but a rider at the platform wants the one
 * that is there (2026-10-22: Gadi at HaHagana, the 19:30 to Moshe Dayan running at 19:37, beaten on paper by the 19:45
 * express, which was itself only on its timetable). They join their card's other times, marked (`slower`) with when
 * they arrive: the two latest that can still be reached, arriving at most 30 minutes after the card's own.
 */
function slowerSiblings(journeys, fromTime, q) {
  const out = [], seen = new Set();
  for (const j of journeys) {
    const rides = j.legs.filter((l) => l.type === 'ride');
    if (rides.length !== 1) continue;
    const R = rides[0], B = R.from.stop, A = R.to.stop, key = `${B}-${A}`;
    if (seen.has(key)) continue;   // one search per pair of stops: the card's earliest option comes first
    seen.add(key);
    const lead = R.depart - j.depart;   // from setting out to boarding
    const found = [];
    for (let i = tt.stopPatsOff[B]; i < tt.stopPatsOff[B + 1]; i++) {
      const p = tt.stopPats[2 * i], pos = tt.stopPats[2 * i + 1], ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p];
      let k = -1;
      for (let x = pos + 1; x < ns; x++) if (tt.patStops[tt.patStopsOff[p] + x] === A) { k = x; break; }
      if (k < 0) continue;
      const base = tt.tripTimesOff[p];
      for (let t = tt.patTripsOff[p]; t < tt.patTripsOff[p + 1]; t++) {
        const o = base + (t - tt.patTripsOff[p]) * ns, d = tt.dep[o + pos], a = tt.arr[o + k];
        if (d >= R.depart || d < fromTime + lead || a <= R.arrive || a > R.arrive + 1800) continue;
        if (journeys.some((x) => x.legs.some((l) => l.type === 'ride' && l.trip === t))) continue;
        found.push({ p, t, pos, k, d, a });
      }
    }
    found.sort((x, y) => y.d - x.d);
    for (const f of found.slice(0, 2)) {
      const via = []; for (let x = f.pos; x <= f.k; x++) via.push(tt.patStops[tt.patStopsOff[f.p] + x]);
      const ride = legOut({ type: 'ride', pattern: f.p, trip: f.t, from: B, to: A, depart: f.d, arrive: f.a, seconds: f.a - f.d, stops: f.k - f.pos, via, route: tt.routes[tt.patRoute[f.p]] }, q);
      const before = f.d - R.depart, after = f.a - R.arrive;
      let seenRide = false;
      const legs = j.legs.map((l) => {
        if (l === R) { seenRide = true; return ride; }
        const dt = seenRide ? after : before;
        return { ...l, depart: l.depart + dt, arrive: l.arrive + dt };
      });
      out.push({ depart: j.depart + before, arrive: j.arrive + after, transfers: 0, walkSeconds: j.walkSeconds, legs, slower: true });
    }
  }
  return out;
}

/**
 * Journeys that board and alight at the same stops, in the same order, are one way to go at several
 * times, possibly with different lines on a leg. Groups keep the journey order (earliest first) and list
 * the indices of their options and the distinct lines per leg.
 */
function groupJourneys(journeys) {
  const byKey = new Map(), groups = [];
  journeys.forEach((j, idx) => {
    const key = j.legs.map((l) => l.type === 'ride' ? `r${l.from.stop}-${l.to.stop}` : l.type === 'walk' ? `w${l.from.stop}-${l.to.stop}` : l.type === 'access' ? `a${l.to.stop}` : `e${l.from.stop}`).join('|');
    let g = byKey.get(key);
    if (!g) { g = { options: [], lines: j.legs.map(() => []) }; byKey.set(key, g); groups.push(g); }
    g.options.push(idx);
    j.legs.forEach((l, i) => { if (l.type === 'ride' && !g.lines[i].includes(l.line)) g.lines[i].push(l.line); });
  });
  return groups;
}

// ---------------------------------------------------------------- the newest SIRI snapshot, through the relay
// The relay (worker/relay.js) serves Hasadna's newest raw snapshot of every vehicle in the country, about a minute
// old where their database can be 15 minutes behind. It is downloaded here (4 MB of JSON once unpacked: parsing it
// on the page would stall the screen), kept for 30 s, and every live question is answered from it.
const SNAP_MS = 30000, SNAP_WINDOW_MS = 1800e3;
let snap = null, snapLoading = null, stopByCode = null;
// Frozen positions: a vehicle that reports speed but the same position for 2 minutes is repeating an old fix (37% of
// trains with GPS did, and no bus, 2026-10-21 19:26; the stop it names froze with it). Read as current, it adds every
// minute to its delay, so it is dropped and its trip shows the timetable. Each ride's position is remembered with when
// it was first seen there; the first load also reads the snapshot of 3 minutes before, so this works at once.
const FROZEN_MS = 120e3, MOVING_KMH = 5;
const posSince = new Map();   // ride -> { loc, since: ms, seen: ms }
const snapTime = (id) => { const m = /^(\d{4})\/(\d\d)\/(\d\d)\/(\d\d)\/(\d\d)$/.exec(id || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN; };
function remember(j, t) {
  for (const d of (j && j.Siri && j.Siri.ServiceDelivery && j.Siri.ServiceDelivery.StopMonitoringDelivery) || []) {
    for (const x of d.MonitoredStopVisit || []) {
      const m = x.MonitoredVehicleJourney, l = m && m.VehicleLocation; if (!l) continue;
      const key = `${m.LineRef}/${m.OriginAimedDepartureTime}`, loc = `${l.Latitude},${l.Longitude}`, o = posSince.get(key);
      // snapshots can come in out of order (the earlier one follows in the background): keep the earliest time at this place
      if (o && o.loc === loc) { o.since = Math.min(o.since, t); o.seen = Math.max(o.seen, t); } else posSince.set(key, { loc, since: t, seen: t });
    }
  }
  for (const [k, o] of posSince) if (t - o.seen > SNAP_WINDOW_MS) posSince.delete(k);
}
function codeIndex() {
  if (!stopByCode) { stopByCode = new Map(); for (let i = 0; i < tt.stops.length; i++) if (tt.stops[i][2]) stopByCode.set(String(tt.stops[i][2]), i); }
  return stopByCode;
}
// A train takes its next trip's number some minutes before that trip starts: 18% of train fixes came before their
// trip's start (2026-10-19 to 21), 94% of those from the train standing at its first station. The rest come from a
// train still running elsewhere, typically 12 minutes before the start (up to 17), a median 12 km away and mostly off
// the trip's path: about 35 trips a day. Some are the train finishing its trip before under the next number (Gadi's
// reading): another trip went quiet a couple of minutes earlier close by. The feed cannot say so outright (a train's
// vehicle number is its trip number, not the set), so a fix goes back to such a trip only when it plainly continues
// it: that trip has not reported for 2-15 minutes, the fix is on its path, further along it, no further from its last
// report than a train runs in that time, the delay it gives that trip is within 5 minutes of its last one (it carried
// over within 0.2 minutes in the median), and no other trip fits. A quarter of these fixes come with a twin, another
// trip running reports from the same spot that minute: one train under two numbers, or two coupled; the running trip
// has its own report, and the copy is dropped. The trip then shows the train to its end instead of going quiet. Any other such fix is dropped: it
// is no position of the trip it names (a dot of that line far away, or a made-up delay).
function notYetItsTrip(v) {
  if (v.operator !== 2 || v.atStop || !(v.velocity > 10) || !tt) return false;
  const day = tt.header.date, t = tripFor(v.lineRef, secondsOn(v.scheduledStart, day));
  if (t < 0) return false;
  const { stops } = tripStopList(t);
  return secondsOn(v.recordedAt, day) < stops[0].dep - 120 && metres(v.lat, v.lon, stops[0].lat, stops[0].lon) > 300;
}
function handedOver(early, trains) {
  const day = tt.header.date, seen = early.recordedAt.getTime();
  let best = null;
  for (const o of trains) {
    const gap = seen - o.recordedAt.getTime();
    // quiet: two report cycles missed (trains report every minute; a running train a cycle late is no handover), and
    // not over a quarter of an hour
    if (o === early || !(gap >= 120e3 && gap <= 900e3)) continue;
    // the same train going on: no further away than it could have run since (160 km/h)
    if (metres(o.lat, o.lon, early.lat, early.lon) > 500 + (gap / 1000) * 45) continue;
    const t = tripFor(o.lineRef, secondsOn(o.scheduledStart, day));
    if (t < 0) continue;
    const { stops } = tripStopList(t);
    if (secondsOn(early.recordedAt, day) > stops[stops.length - 1].arr + 3600) continue;
    const was = estimateDelay(o, stops, day), now = estimateDelay(early, stops, day);
    if (!was || !now || now.index + now.frac < was.index + was.frac) continue;   // and further along its trip
    const real = (d) => d > -900 && d < 5400;   // a delay at the estimate's bounds is no estimate (a trip far off its time)
    if (!real(was.delay) || !real(now.delay) || Math.abs(now.delay - was.delay) > 300) continue;
    if (best) return null;   // two trips fit: no guessing (a wrong one shows a train where it is not)
    best = o;
  }
  return best;
}
/** The snapshot's vehicles in live.js's shape. One with no position (most often a train) is put at the stop it
 *  reports when it is at it; Hasadna's database drops those (about one train in eight, 2026-10-21). A train
 *  that has taken its next trip's number while still running elsewhere goes back to the trip it is finishing when
 *  that is clear (handedOver), and is left out otherwise. */
function snapVehicles(j, t) {
  const out = [], early = [], now = Date.now();
  const codes = tt ? codeIndex() : null;
  for (const d of (j && j.Siri && j.Siri.ServiceDelivery && j.Siri.ServiceDelivery.StopMonitoringDelivery) || []) {
    for (const x of d.MonitoredStopVisit || []) {
      const m = x.MonitoredVehicleJourney; if (!m) continue;
      const recordedAt = new Date(x.RecordedAtTime), rt = recordedAt.getTime();
      if (!(rt > now - SNAP_WINDOW_MS && rt < now + 600e3)) continue;   // gone quiet half an hour ago, or an impossible time
      // a report stamped after the snapshot was taken is a vehicle's wrong clock (2026-10-22: 13 of 8,915, from a minute
      // to two days ahead): read as the newest, it made every true report in its area look old, and the map hid them
      if (rt > t + 120e3) continue;   // t: the snapshot's minute, the source's own clock
      if (m.VehicleLocation && Number(m.Velocity) > MOVING_KMH) {
        const o = posSince.get(`${m.LineRef}/${m.OriginAimedDepartureTime}`);
        if (o && t - o.since >= FROZEN_MS) continue;   // t: the snapshot's minute
      }
      let lat = Number(m.VehicleLocation && m.VehicleLocation.Latitude), lon = Number(m.VehicleLocation && m.VehicleLocation.Longitude), atStop = false;
      if (!lat || !lon) {
        const c = m.MonitoredCall, s = codes && c ? codes.get(String(c.StopPointRef)) : undefined;
        if (s === undefined || Number(c.DistanceFromStop) > 0) continue;
        lat = tt.stopLat[s]; lon = tt.stopLon[s]; atStop = true;
      }
      const v = { lineRef: String(m.LineRef), lat, lon, bearing: Number(m.Bearing) || 0, velocity: Number(m.Velocity) || 0, recordedAt,
        scheduledStart: new Date(m.OriginAimedDepartureTime), rideId: `${m.LineRef}/${m.OriginAimedDepartureTime}`, vehicleRef: m.VehicleRef,
        operator: Number(m.OperatorRef), atStop };
      if (notYetItsTrip(v)) early.push(v); else out.push(v);
    }
  }
  if (!early.length) return out;
  const trains = out.filter((v) => v.operator === 2 && !v.atStop), gone = new Set();
  for (const v of early) {
    const o = handedOver(v, trains);
    if (!o || gone.has(o)) continue;
    gone.add(o);   // its own older report gives way to the newer one
    out.push({ ...v, lineRef: o.lineRef, scheduledStart: o.scheduledStart, rideId: o.rideId, handedOver: true });
  }
  return gone.size ? out.filter((v) => !gone.has(v)) : out;
}
// ---------------------------------------------------------------- how the roads run now, from the buses on them
// Each bus is followed across the snapshots read (the last 15 minutes): between two of its positions at least 90 s
// apart it covered part of its trip, and the time that took against the part's usual time (live.js usualRun: learned
// by hour, else the timetable's) says how that stretch runs now. Every section it covered gets that ratio. live.js
// applies them to the sections ahead of other buses (roadFactor), and the map colours the sections by them.
const TRACK_MS = 900e3, PAIR_MS = 90e3;
const tracks = new Map();   // ride -> { lineRef, start, pts: [[ms, lat, lon]] } oldest first
let roads = new Map();      // "code>code" -> [{ ratio, t, ride, p, k }]
function noteRoads(vehicles) {
  if (!tt || !hasBusTimes()) return;   // without the learned times there is nothing to compare with
  let newest = 0;
  for (const v of vehicles) {
    if (v.operator === 2 || v.atStop) continue;
    const t = v.recordedAt.getTime();
    if (t > newest) newest = t;
    let tr = tracks.get(v.rideId);
    if (!tr) tracks.set(v.rideId, (tr = { lineRef: v.lineRef, start: v.scheduledStart, pts: [] }));
    if (tr.pts.some((x) => x[0] === t)) continue;
    tr.pts.push([t, v.lat, v.lon]); tr.pts.sort((a, b) => a[0] - b[0]);
  }
  for (const [k, tr] of tracks) { tr.pts = tr.pts.filter((x) => x[0] > newest - TRACK_MS); if (!tr.pts.length) tracks.delete(k); }
  const day = tt.header.date, out = new Map();
  for (const [ride, tr] of tracks) {
    if (tr.pts.length < 2) continue;
    const trip = tripFor(tr.lineRef, secondsOn(tr.start, day));
    if (trip < 0) continue;
    const { p, stops } = tripStopList(trip);
    let a = null;
    for (const pt of tr.pts) {
      const pr = projectOnStops(pt[1], pt[2], stops);
      if (pr.metres > 120) continue;
      const at = { t: pt[0], x: pr.index + pr.frac };
      if (!a) { a = at; continue; }
      if (at.t - a.t < PAIR_MS) continue;
      if (at.x > a.x + 0.05 && at.x - a.x < 15) {
        // the usual time of the stretch covered: the parts of each section between the two positions
        const from = secondsOn(new Date(a.t), day);
        let usual = 0;
        for (let k = Math.floor(a.x); k < Math.min(stops.length - 1, Math.ceil(at.x)); k++) usual += (Math.min(at.x, k + 1) - Math.max(a.x, k)) * usualRun(stops, k, from, day);
        if (usual >= 30 && a.x >= 0.05) {   // a bus still at its first stop is waiting for its time, not in traffic
          const ratio = Math.max(0.3, Math.min(4, (at.t - a.t) / 1000 / usual));
          for (let k = Math.floor(a.x); k < Math.min(stops.length - 1, Math.ceil(at.x)); k++) {
            const key = `${stops[k].code}>${stops[k + 1].code}`;
            if (!out.has(key)) out.set(key, []);
            out.get(key).push({ ratio, t: at.t, ride, p, k });
          }
        }
      }
      a = at;
    }
  }
  roads = out; setRoadsNow(out);
}

/**
 * Traffic in a box, from the buses: each section that at least two buses ran in the last 15 minutes, drawn along its
 * course, with how its time now (the median of their ratios to its usual time, times that) compares with its best in
 * the day's hours (live.js freeRun): level 0 free (up to 1.5 times), 1 slow (to 2.2), 2 jammed (to 3.2), 3 stuck. On a
 * Thursday in Tel Aviv (2026-10-22) that made 10:00 mostly free and 17:00 a mix with jams where they were.
 */
function trafficIn(box) {
  if (!tt || !roads.size) return { type: 'FeatureCollection', features: [] };
  const day = tt.header.date, features = [];
  let newest = 0;
  for (const v of roads.values()) for (const x of v) if (x.t > newest) newest = x.t;
  const inBox = (s) => tt.stopLat[s] >= box.south && tt.stopLat[s] <= box.north && tt.stopLon[s] >= box.west && tt.stopLon[s] <= box.east;
  const nowSec = secondsOn(new Date(newest), day);
  for (const [key, v] of roads) {
    const recent = v.filter((x) => x.t > newest - TRACK_MS);
    if (new Set(recent.map((x) => x.ride)).size < 2) continue;
    const { p, k } = recent[recent.length - 1], at = tt.patStopsOff[p] + k, s1 = tt.patStops[at], s2 = tt.patStops[at + 1];
    if (!inBox(s1) && !inBox(s2)) continue;
    const [c1, c2] = key.split('>'), free = freeRun(c1, c2, day);
    if (!free) continue;
    const rs = recent.map((x) => x.ratio).sort((a, b) => a - b), m = rs[Math.floor(rs.length / 2)];
    const stops = [{ code: c1, arr: 0, dep: 0 }, { code: c2, arr: 0, dep: 0 }];
    const now = m * usualRun(stops, 0, nowSec, day), x = now / free;
    if (!now) continue;
    const level = x <= 1.5 ? 0 : x <= 2.2 ? 1 : x <= 3.2 ? 2 : 3;
    const path = ridePath(p, k, k + 1) || [[tt.stopLat[s1], tt.stopLon[s1]], [tt.stopLat[s2], tt.stopLon[s2]]];
    features.push({ type: 'Feature', properties: { level, x: Math.round(x * 100) / 100, n: rs.length }, geometry: { type: 'LineString', coordinates: path.map(([la, lo]) => [lo, la]) } });
  }
  return { type: 'FeatureCollection', features };
}

let relayAt = 0;   // which of the relay's addresses answered last: tried first next time
async function snapshot(urls) {
  if (snap && Date.now() - snap.at < SNAP_MS) return snap;
  if (!snapLoading) snapLoading = (async () => {
    // 15 s for the relay to start answering; reading the body then gets a minute: on a phone at start-up it competes
    // with the timetable and street downloads and waits behind their unpacking here (a 12 s limit on the whole read
    // aborted it on Gadi's phone every time, 2026-10-21)
    const fetchFrom = async (url, ago) => {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(new Error('relay did not answer in 15 s')), 15000);
      try { return await fetch(ago ? `${url}?ago=${ago}` : url, { cache: 'no-store', signal: ctl.signal }); } finally { clearTimeout(timer); }
    };
    const get = async (ago) => {
      let r = null, err = null;
      for (let k = 0; k < urls.length && !r; k++) {
        const i = (relayAt + k) % urls.length;
        try {
          const res = await fetchFrom(urls[i], ago);
          if (!res.ok) throw new Error(`relay HTTP ${res.status}`);
          // an address not (yet) pointed at the relay answers with someone's page: a snapshot names itself
          if (!res.headers.get('x-snapshot')) throw new Error('not the relay');
          r = res; relayAt = i;
        } catch (e) { err = e; }
      }
      if (!r) throw err || new Error('relay unavailable');
      const id = r.headers.get('x-snapshot') || '';
      let late;
      const j = await Promise.race([r.json(), new Promise((_, no) => { late = setTimeout(() => no(new Error('relay body took over 60 s')), 60000); })]).finally(() => clearTimeout(late));
      return { id, t: snapTime(id), j };
    };
    const first = !posSince.size;
    const cur = await get(0);
    // a feed that stalled is no better than the database: then Hasadna's API answers instead
    if (!(Date.now() - cur.t <= 600e3)) throw new Error(`relay snapshot ${cur.id || '?'} is old`);
    remember(cur.j, cur.t);
    snap = { at: Date.now(), id: cur.id, vehicles: snapVehicles(cur.j, cur.t) };
    noteRoads(snap.vehicles);
    // the first time, the snapshot of 3 minutes before follows in the background, so frozen positions show at once:
    // its positions count as seen first then, and the current vehicles are filtered again
    if (first) get(3).then((before) => {
      if (!(before.t < cur.t)) return;
      remember(before.j, before.t); remember(cur.j, cur.t);
      if (snap && snap.id === cur.id) snap = { ...snap, vehicles: snapVehicles(cur.j, cur.t) };
      // and the one of 10 minutes before: how the roads run is known at once, not after minutes of use
      if (hasBusTimes()) return get(10).then((older) => { noteRoads(snapVehicles(older.j, older.t)); noteRoads(snap ? snap.vehicles : []); });
    }).catch(() => {});
    return snap;
  })().finally(() => { snapLoading = null; });
  return snapLoading;
}

/** What is at (lat, lon), named in `L`: the nearest address, place or street, else the nearest stop, else the point. */
function reverseIn(lat, lon, L) {
  if (pl) {
    const r = reverseGeocode(pl, lat, lon, L);
    if (r) return { name: r.city && r.kind !== 'city' ? `${r.name}, ${r.city}` : r.name, kind: r.kind, distance: r.distance };
  }
  let best = -1, bd = 600;
  for (let s = 0; s < tt.stops.length; s++) {
    const d = haversine(lat, lon, tt.stopLat[s], tt.stopLon[s]);
    if (d < bd) { bd = d; best = s; }
  }
  if (best >= 0) return { name: stopName(tt, best, L), kind: 'stop', distance: Math.round(bd) };
  return { name: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, kind: 'point', distance: 0 };
}

const ops = {
  async loadTimetable({ url }) {
    const buf = await fetchContainer(url, 'timetable');
    tt = parseTimetable(buf);
    routeById = routePats = stopRail = stopLrt = stopByCode = lineIdx = null;
    return { date: tt.header.date, counts: tt.counts, feed: tt.header.feed, streets: !!tt.header.streets };
  },
  /**
   * Stored places named again in `lang`: a stop by its code (its station's name where it is part of one), an
   * address-book place by its exact position. A name, null where neither finds it, or false while the data it needs
   * is still loading (ask again later).
   */
  localize({ places, lang: L, words }) {
    // a point picked on the map was named by reverseIn at that point ("near X" from 40 m): name it again the same way
    const picked = (p) => {
      const named = {};
      for (const W of ['he', 'en']) {
        const r = reverseIn(p.lat, p.lon, W);
        named[W] = r.kind === 'point' ? words[W].point : r.distance > 40 ? words[W].near.replace('{name}', r.name) : r.name;
      }
      return named.he === p.name || named.en === p.name ? named[L] : null;
    };
    return places.map((p) => {
      if (p.code != null && p.code !== '') {
        if (!tt) return false;
        const s = codeIndex().get(String(p.code));
        if (s === undefined) return null;
        const par = tt.stopParent[s];
        return (par >= 0 && stationName(tt, par, L)) || stopName(tt, s, L);
      }
      if (p.lat == null || p.lon == null) return null;
      if (!pl || !tt) return false;
      return placeAt(pl, p.lat, p.lon, L, p.name) || picked(p);
    });
  },
  /** Live vehicles from the newest snapshot: of a line ({line}), in a box ({box}) or of an operator ({operator}). */
  async liveQuery({ urls, filter }) {
    const s = await snapshot(urls);
    let vs = s.vehicles;
    if (filter.line != null) vs = vs.filter((v) => v.lineRef === String(filter.line));
    else if (filter.box) { const b = filter.box; vs = vs.filter((v) => v.lat >= b.south && v.lat <= b.north && v.lon >= b.west && v.lon <= b.east); }
    else if (filter.operator != null) vs = vs.filter((v) => v.operator === filter.operator);
    return vs;
  },
  async loadStreets({ url }) {
    const buf = await fetchContainer(url, 'streets');
    st = parseStreets(buf);
    return { nodes: st.M };
  },
  /** The learned running times of rail sections (pipeline/railtimes.py), for train delays. */
  setRailTimes({ m }) { setRailTimes(m); return true; },
  /** Traffic from the buses in a box {south, west, north, east} as GeoJSON (trafficIn). */
  traffic({ box }) { return trafficIn(box); },
  /** The learned running times of bus sections (pipeline/bustimes.py). */
  async loadBusTimes({ url }) { const m = parseBusTimes(await fetchContainer(url, 'bustimes')); setBusTimes(m); return { sections: m.idx.size, built: m.built }; },
  /** A vehicle's delay and its time at each stop ahead (live.js estimateDelay), made here where the learned times are. */
  estimate({ vehicle, stops, day }) { return estimateDelay(vehicle, stops, day); },
  async loadShapes({ url }) {
    const buf = await fetchContainer(url, 'shapes');
    sh = parseShapes(buf);
    return sh.header.counts;
  },
  /** Street paths for walks drawn straight because the street graph was not there yet: null where there is none. */
  streetPaths({ legs }) { return legs.map((l) => streetPath(l.from, l.to, l.mode)); },
  /** Courses for ride legs planned before the shapes were loaded: null where there is none. */
  ridePaths({ legs }) { return legs.map((l) => ridePath(l.pattern, l.boardPos, l.alightPos)); },
  /** The whole course of each pattern and all its stops, for drawing a line around a ride. */
  patternCourse({ patterns }) {
    return patterns.map((p) => {
      const ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p];
      const stops = [];
      for (let i = 0; i < ns; i++) { const st = tt.patStops[tt.patStopsOff[p] + i]; stops.push([tt.stopLat[st], tt.stopLon[st], sName(st), st]); }
      return { path: (ns >= 2 && ridePath(p, 0, ns - 1)) || stops.map((x) => [x[0], x[1]]), stops };
    });
  },
  async loadPlaces({ url }) {
    const buf = await fetchContainer(url, 'places');
    pl = parsePlaces(buf);
    return pl.header.counts;
  },
  /** Stops and stations first, then addresses, streets, places and cities from the address book. */
  search({ q, limit = 10, lang: L = lang, near = null }) {
    // stops and places on one scale: match strength (whole words over prefixes), nearness, and a point
    // ahead of a street at equal strength (a stop is what the planner boards; an address when a number was typed)
    const bandBonus = (g) => { if (!near) return 0; const km = haversine(near.lat, near.lon, g.lat, g.lon) / 1000; return km < 3 ? 3 : km < 15 ? 1.5 : 0; };
    const stops = searchStops(tt, q, limit, L).map((g) => ({ kind: 'stop', key: g.key, name: g.name, city: g.city, stops: g.stops, lat: g.lat, lon: g.lon, code: g.code, platforms: g.stops.length, rank: g.score + 1 + bandBonus(g) }));
    const hasDigit = /\d/.test(q);
    let places = [];
    if (pl) {
      places = searchPlaces(pl, q, limit, near, L).map((r) => ({ kind: r.kind, name: r.name, city: r.city, lat: r.lat, lon: r.lon, approx: r.approx ?? null,
        label: r.kind === 'poi' ? kindLabel(r.poiKind, L) : null, score: r.score, rank: r.score + (hasDigit && r.kind === 'address' ? 3 : 0) }));
    }
    const merged = [...stops, ...places].map((r, i) => ({ r, i })).sort((a, b) => b.r.rank - a.r.rank || a.i - b.i).map((x) => x.r);
    return { results: merged.slice(0, limit + 4), placesLoaded: !!pl };
  },
  /**
   * Journeys between two places in a departure window; with arriveBy, the window ends at toTime and
   * only journeys arriving by then are kept. maxWalk (s) bounds the walk to the first and from the last stop.
   */
  plan({ from, to, fromTime, toTime, bike = 'none', folding = false, weekday = true, maxTransfers = 3, maxWalk = 900, arriveBy = false, vehicles = null }) {
    const t0 = performance.now();
    let live = null;
    if (vehicles) { try { live = { matched: applyLive(vehicles), vehicles: vehicles.length }; } catch (e) { revertLive(); live = null; } }
    try { return planNow(); } finally { revertLive(); }
    function planNow() {
    const q = {
      from: resolvePlace(from, bike === 'none' ? 'walk' : 'bike', bike === 'none' ? maxWalk : Math.max(1200, maxWalk)),
      to: resolvePlace(to, bike === 'along' ? 'bike' : 'walk', bike === 'along' ? Math.max(1200, maxWalk) : maxWalk),
    };
    if (!q.from.places.length || !q.to.places.length) return { journeys: [], groups: [], reason: !q.from.places.length ? 'noOriginStops' : 'noDestStops', live, ms: 0 };
    // Two searches: everything, and trains only. The first keeps, per departure, only the earliest arrival, so a bus
    // a minute faster leaves no trace of the train beside it; the second brings the trains back, ranked apart (rank).
    // on foot at either end, the whole walk (to the first stop and any walk on to another) is within the rider's longest
    const opts = { maxTransfers, bikeOnBoard: bike === 'along', folding, weekday, raw: true,
      maxAccess: bike === 'none' ? maxWalk : undefined, maxEgress: bike !== 'along' ? maxWalk : undefined };
    const r = profile(tt, q.from.places, q.to.places, fromTime, toTime, opts);
    const byRail = profile(tt, q.from.places, q.to.places, fromTime, toTime, { ...opts, routeTypes: [2] });
    const seen = new Set(), all = [];
    for (const j of r.journeys.concat(byRail.journeys)) { easierTransfers(j); const k = journeySig(j); if (!seen.has(k)) { seen.add(k); all.push(j); } }
    // arrive-by: the journeys arriving in time are ranked among themselves only; ranked with the rest, a later one with
    // fewer changes that arrives a few minutes past the deadline would knock out one that is in time, and then be dropped
    const found = rank(arriveBy ? all.filter((j) => j.arrive <= toTime) : all);
    const journeys = found.map((j) => ({
      depart: j.depart, arrive: j.arrive, transfers: j.transfers, walkSeconds: j.walkSeconds,
      legs: mergeWalks(j.legs.filter((l) => l.type === 'ride' || l.seconds > 0).map((l) => legOut(l, q))),
    }));
    if (!arriveBy) journeys.push(...slowerSiblings(journeys, fromTime, q));
    let bikeOnly = null;
    if (st && bike !== 'none' && q.from.point && q.to.point) {
      const br = route(st, q.from.point.lat, q.from.point.lon, q.to.point.lat, q.to.point.lon, 'bike', 3 * 3600);
      if (br) bikeOnly = { seconds: br.seconds, metres: br.metres, path: [[q.from.point.lat, q.from.point.lon], ...br.path, [q.to.point.lat, q.to.point.lon]] };
    }
    return { journeys, groups: groupJourneys(journeys), bikeOnly, candidates: r.candidates, streets: !!st, live, ms: performance.now() - t0 };
    }
  },
  /** Line labels for SIRI line refs (GTFS route ids) of the loaded day. */
  routeLabels({ ids }) {
    if (!routeById) indexRoutes();
    const out = {};
    for (const id of ids) { const ri = routeById.get(String(id)); if (ri != null) { const r = tt.routes[ri]; out[id] = { line: routeLabel(r), type: r[3], agency: r[2], headsign: headsign(ri), route: ri }; } }
    return out;
  },
  /**
   * Lines as riders know them, for the line search: one entry per line with its directions, the nearest first when
   * the rider's position is known. `mode` narrows to buses, trains, light rail or cable lines; an empty query lists
   * the lines near the rider (every line, for the modes with few).
   */
  lineGroups({ q = '', mode = 'all', near = null, limit = 30 }) {
    if (!lineIdx) indexLines();
    const n = String(q || '').trim().toLowerCase().replace(/^(קו|line)\s*/, '');
    const wanted = (g) => mode === 'all' || g.mode === mode || (mode === 'bus' && (g.mode === 'flex' || g.mode === 'taxi'));
    const dist = near ? linesNear(near.lat, near.lon, 800) : new Map();
    const rows = [];
    // a number (with any letters: "4א", "L1") is the line's; other words name where it runs ("274 תל אביב", "קרית אונו")
    const toks = n.split(/\s+/).filter(Boolean), numTok = toks.find((x) => /\d/.test(x)) || null;
    const words = toks.filter((x) => x !== numTok && x.length > 1);
    const placeOk = (g) => words.every((w) => placeText(g).includes(spell(w)));
    lineIdx.groups.forEach((g, i) => {
      if (!wanted(g)) return;
      let score = 0;
      if (!n) score = dist.has(i) || mode === 'rail' || mode === 'lrt' || mode === 'cable' ? 1 : 0;
      else if (g.mode === 'rail') score = 'train'.startsWith(n) || 'רכבת'.startsWith(n) || g.names.some((x) => x.includes(n)) ? 2 : 0;
      else {
        const label = g.label.toLowerCase();
        if (numTok) score = (label === numTok ? 3 : label.startsWith(numTok) ? 1 : 0) * (placeOk(g) ? 1 : 0);
        else {
          score = label === n ? 3 : 0;
          if (!score && g.mode === 'lrt' && n.length > 1 && ('light rail'.startsWith(n) || 'רכבת קלה'.startsWith(n))) score = 1.5;   // after the trains for "רכבת"
          if (!score && words.length && placeOk(g)) score = 0.5;   // only places: the lines running there
        }
      }
      if (score) rows.push({ i, score, dist: dist.has(i) ? dist.get(i) : Infinity });
    });
    const num = (x) => { const m = /^\d+/.exec(x); return m ? +m[0] : 1e9; };
    // a line within a short walk comes first among equal matches: line 1 here, not line 1 in another city
    rows.sort((a, b) => b.score - a.score || Math.min(a.dist, 1e6) - Math.min(b.dist, 1e6) || num(lineIdx.groups[a.i].label) - num(lineIdx.groups[b.i].label) || lineIdx.groups[b.i].trips - lineIdx.groups[a.i].trips);
    return rows.slice(0, limit).map((r) => groupOut(r.i, r.dist));
  },
  /**
   * Stops for the stop search: by name or by the code on the sign (exact codes first), or, with nothing typed, those
   * near the rider (every station, nearest first, for trains). `mode` narrows to bus stops, train stations or light
   * rail stops; `from` (a station's platforms) to the stations its trains reach without a change. A station is one
   * entry with its platforms (`stops`).
   */
  stopGroups({ q = '', mode = 'all', near = null, limit = 30, from = null }) {
    const rail = railStops(), lrt = lrtStops();
    // the To box of the train timetable: only the stations a train from the chosen one reaches without a change
    const reach = from && from.length ? new Set(ops.stationReach({ stops: from, fromTime: 0 }).map((d) => d.key)) : null;
    const modeOf = (s) => (rail[s] ? 'rail' : lrt[s] ? 'lrt' : 'bus');
    const gmode = (ss) => (ss.some((x) => rail[x]) ? 'rail' : ss.some((x) => lrt[x]) ? 'lrt' : 'bus');   // the number on a station's sign is no rider's
    const groupOf = (s) => { const p = tt.stopParent[s]; return p >= 0 ? { key: 'p' + p, stops: tt.stationStops.get(p).slice(), name: stName(p) || sName(s) } : { key: 's' + s, stops: [s], name: sName(s) }; };
    const out = new Map();
    const add = (s, score) => {
      const g = groupOf(s), m = modeOf(s);
      if (mode !== 'all' && m !== mode && !g.stops.some((x) => modeOf(x) === mode)) return;
      if (reach && !reach.has(g.key)) return;
      const o = out.get(g.key);
      if (o) { if (score > o.score) o.score = score; return; }
      let la = 0, lo = 0;
      for (const x of g.stops) { la += tt.stopLat[x]; lo += tt.stopLon[x]; }
      la /= g.stops.length; lo /= g.stops.length;
      const gm = gmode(g.stops);
      out.set(g.key, { key: g.key, name: g.name, city: cName(tt.stops[s][3]), code: g.stops.length === 1 && gmode(g.stops) !== 'rail' ? tt.stops[s][2] : '', stops: g.stops, lat: la, lon: lo, mode: gm, score,
        dist: near ? Math.round(haversine(near.lat, near.lon, la, lo)) : null });
    };
    const n = String(q || '').trim();
    if (!n) {
      for (let s = 0; s < tt.stops.length; s++) {
        if (mode === 'rail' ? !rail[s] : !near || haversine(near.lat, near.lon, tt.stopLat[s], tt.stopLon[s]) > 600) continue;
        add(s, 0);
      }
    } else {
      if (/^\d{2,6}$/.test(n)) { const s = codeIndex().get(n); if (s !== undefined) add(s, 100); }
      for (const g of searchStops(tt, n, 60, lang)) add(g.stops[0], g.score);
    }
    const rows = Array.from(out.values());
    // the stations reachable from the From one are listed by name; anything else nearest first among equal matches
    rows.sort((a, b) => b.score - a.score || (reach ? 0 : (a.dist ?? 1e9) - (b.dist ?? 1e9)) || a.name.localeCompare(b.name));
    return rows.slice(0, limit).map((r) => ({ ...r, lines: r.mode === 'rail' ? [] : linesAt(r.stops[0], 8) }));
  },
  /**
   * A train station's direct destinations: every station a train from here reaches without a change, with today's
   * trains there, the next one from `fromTime` and how long it takes. `stops` are the station's platforms.
   */
  stationReach({ stops, fromTime }) {
    const from = new Set(stops), dests = new Map();
    for (const s of stops) {
      for (let i = tt.stopPatsOff[s]; i < tt.stopPatsOff[s + 1]; i++) {
        const p = tt.stopPats[2 * i], pos = tt.stopPats[2 * i + 1];
        if (tt.routes[tt.patRoute[p]][3] !== 2) continue;
        const o = tt.patStopsOff[p], ns = tt.patStopsOff[p + 1] - o;
        for (let j = pos + 1; j < ns; j++) {
          const b = tt.patStops[o + j];
          if (from.has(b)) continue;
          const key = tt.stopParent[b] >= 0 ? 'p' + tt.stopParent[b] : 's' + b;
          let d = dests.get(key);
          if (!d) dests.set(key, (d = { key, name: (tt.stopParent[b] >= 0 && stName(tt.stopParent[b])) || sName(b), stops: tt.stopParent[b] >= 0 ? tt.stationStops.get(tt.stopParent[b]).slice() : [b], lat: tt.stopLat[b], lon: tt.stopLon[b], trips: 0, next: null, ride: null }));
          for (let t = tt.patTripsOff[p]; t < tt.patTripsOff[p + 1]; t++) {
            const base = tt.tripTimesOff[p] + (t - tt.patTripsOff[p]) * ns, dep = tt.dep[base + pos], arr = tt.arr[base + j];
            d.trips++;
            if (dep >= fromTime && (d.next == null || dep < d.next)) { d.next = dep; d.ride = arr - dep; }
          }
        }
      }
    }
    return Array.from(dests.values()).sort((a, b) => a.name.localeCompare(b.name));
  },
  /** The direct trains between two stations (their platforms), leaving from `fromTime` on: when, how long, which train. */
  trainsBetween({ from, to, fromTime, limit = 24 }) {
    const B = new Set(to), out = [], seen = new Set();
    for (const s of from) {
      for (let i = tt.stopPatsOff[s]; i < tt.stopPatsOff[s + 1]; i++) {
        const p = tt.stopPats[2 * i], pos = tt.stopPats[2 * i + 1];
        const o = tt.patStopsOff[p], ns = tt.patStopsOff[p + 1] - o;
        let j = -1;
        for (let k = pos + 1; k < ns; k++) if (B.has(tt.patStops[o + k])) { j = k; break; }
        if (j < 0) continue;
        const r = tt.routes[tt.patRoute[p]];
        for (let t = tt.patTripsOff[p]; t < tt.patTripsOff[p + 1]; t++) {
          const base = tt.tripTimesOff[p] + (t - tt.patTripsOff[p]) * ns, dep = tt.dep[base + pos];
          if (dep < fromTime || seen.has(t)) continue;
          seen.add(t);
          out.push({ trip: t, dep, arr: tt.arr[base + j], stops: j - pos, boardPos: pos, alightPos: j, line: routeLabel(r), routeType: r[3], agency: r[2], routeId: liveId(r), estimated: !!r[6],
            headsign: headsign(tt.patRoute[p]), firstDep: tt.dep[base], fromStop: s, toStop: tt.patStops[o + j] });
        }
      }
    }
    out.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
    return out.slice(0, limit);
  },
  /** One direction of a line: its main pattern's stops and course, today's trips, and its other directions. A train
   *  line is every train between the same two stations, each of which the feed lists as a route of its own. */
  lineInfo({ route }) {
    if (!lineIdx) indexLines();
    const r = tt.routes[route];
    const g = lineIdx.groups[lineIdx.byRoute.get(route)];
    const sibs = g && g.mode === 'rail' ? g.routes.filter((ri) => tt.routes[ri][1] === r[1]) : [route];
    const pats = sibs.flatMap((ri) => routePats.get(ri) || []);
    let best = -1, bestTrips = -1, trips = 0, first = Infinity, last = -Infinity;
    for (const p of pats) {
      const n = tt.patTripsOff[p + 1] - tt.patTripsOff[p];
      trips += n;
      if (n > bestTrips) { bestTrips = n; best = p; }
      const ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p];
      for (let t = tt.patTripsOff[p]; t < tt.patTripsOff[p + 1]; t++) { const d = tt.dep[tt.tripTimesOff[p] + (t - tt.patTripsOff[p]) * ns]; if (d < first) first = d; if (d > last) last = d; }
    }
    const stops = [];
    if (best >= 0) for (let i = tt.patStopsOff[best]; i < tt.patStopsOff[best + 1]; i++) stops.push(stopOut(tt.patStops[i]));
    const ns = stops.length;
    const path = best >= 0 && ns >= 2 ? (ridePath(best, 0, ns - 1) || stops.map((s) => [s.lat, s.lon])) : [];
    // the other directions of the same line (same number and operator in the same area; for trains, the same two stations)
    const own = parseHeadsign(r[1]);
    const others = g ? lineDirs(g).filter((d) => parseHeadsign(tt.routes[d.route][1]) !== own).map((d) => ({ route: d.route, headsign: d.headsign })) : [];
    const routeIds = sibs.map((ri) => liveId(tt.routes[ri])).filter((x) => x != null);
    return { route, ref: r[4] != null ? String(r[4]) : null, routeId: liveId(r), routeIds, estimated: !!r[6], mode: g ? g.mode : modeOf(r[3]), line: routeLabel(r), agency: r[2], routeType: r[3], headsign: headsign(route), ends: g && g.mode === 'rail' ? endNames(best) : null, stops, path, pathKind: best >= 0 && hasCourse(best) ? 'shape' : 'stops', trips, first, last, variants: pats.length, others: others.slice(0, 6) };
  },
  /** Something opened on another day, found in the day loaded now (indices are the day's own): a line by its route
   *  id in the feed, a stop by the number on its sign (else the nearest within 60 m), a train station by position. */
  findRecent({ kind, ref = null, code = '', lat = 0, lon = 0 }) {
    if (kind === 'line') { for (let i = 0; i < tt.routes.length; i++) if (tt.routes[i][4] != null && String(tt.routes[i][4]) === ref) return i; return -1; }
    if (kind === 'station') {
      const g = ops.stopGroups({ mode: 'rail', near: { lat, lon }, limit: 1 })[0];
      return g && g.dist != null && g.dist < 400 ? { name: g.name, stops: g.stops, lat: g.lat, lon: g.lon } : null;
    }
    if (code) { const s = codeIndex().get(String(code)); if (s !== undefined) return s; }
    let best = -1, bd = 60;
    for (let s = 0; s < tt.stops.length; s++) { const d = haversine(lat, lon, tt.stopLat[s], tt.stopLon[s]); if (d < bd) { bd = d; best = s; } }
    return best;
  },
  /** Which trip each reported vehicle runs and how late it is (for the line page's map). */
  vehiclesStatus({ vehicles }) {
    const day = tt.header.date;
    return vehicles.map((v) => {
      const t = tripFor(v.lineRef, secondsOn(new Date(v.scheduledStart), day));
      if (t < 0) return { trip: -1 };
      const { stops } = tripStopList(t);
      const est = estimateDelay({ lat: v.lat, lon: v.lon, recordedAt: new Date(v.recordedAt) }, stops, day);
      const ri = tt.patRoute[tt.tripPat[t]];
      return { trip: t, delay: est ? est.delay : null, stale: est ? est.ageSec > 240 : true, index: est ? est.index : -1, headsign: headsign(ri), route: ri, line: routeLabel(tt.routes[ri]), agency: tt.routes[ri][2], routeType: tt.routes[ri][3] };
    });
  },
  /** The trip a reported vehicle is running: route id and scheduled start (ISO or ms). */
  tripFor({ routeId, scheduledStart }) { return tripFor(routeId, secondsOn(new Date(scheduledStart), tt.header.date)); },
  /** Every stop of the day as GeoJSON, for the live map. */
  /** Every stop as a point with its kind: rail, lrt (light rail), station (a bus station: a parent with
   *  platforms), platform (a stop inside a station, with the station's kind in `st`), or bus. A station is one
   *  feature at the centre of its platforms, its first platform standing for it in taps. */
  stopsGeo() {
    const rail = railStops();
    const lrt = new Uint8Array(tt.stops.length);
    for (let p = 0; p < tt.patRoute.length; p++) if (tt.routes[tt.patRoute[p]][3] === 0) for (let i = tt.patStopsOff[p]; i < tt.patStopsOff[p + 1]; i++) lrt[tt.patStops[i]] = 1;
    const kindOf = (s) => (rail[s] ? 'rail' : lrt[s] ? 'lrt' : 'bus');
    const features = [];
    const stKind = new Map();
    for (const [p, members] of tt.stationStops) {
      let la = 0, lo = 0, k = 'station';
      for (const s of members) { la += tt.stopLat[s]; lo += tt.stopLon[s]; const ks = kindOf(s); if (ks === 'rail' || (ks === 'lrt' && k === 'station')) k = ks; }
      if (k === 'station' && members.length < 3) continue;   // a pair of opposite bus stops the feed groups is not a bus station
      stKind.set(p, k);
      features.push({ type: 'Feature', properties: { stop: members[0], station: p, name: stName(p) || sName(members[0]), kind: k }, geometry: { type: 'Point', coordinates: [lo / members.length, la / members.length] } });
    }
    for (let s = 0; s < tt.stops.length; s++) {
      const p = tt.stopParent[s];
      features.push({ type: 'Feature', properties: p >= 0 && stKind.has(p) ? { stop: s, name: sName(s), kind: 'platform', st: stKind.get(p) } : { stop: s, name: sName(s), kind: kindOf(s) }, geometry: { type: 'Point', coordinates: [tt.stopLon[s], tt.stopLat[s]] } });
    }
    return { type: 'FeatureCollection', features };
  },
  /** One trip's every stop with times, plus what identifies it in real-time data. */
  tripStops({ trip }) {
    const p = tt.tripPat[trip], ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p];
    const base = tt.tripTimesOff[p] + (trip - tt.patTripsOff[p]) * ns;
    const r = tt.routes[tt.patRoute[p]];
    const stops = [];
    for (let i = 0; i < ns; i++) {
      const s = tt.patStops[tt.patStopsOff[p] + i];
      stops.push({ ...stopOut(s), arr: tt.arr[base + i], dep: tt.dep[base + i] });
    }
    return { trip, routeId: liveId(r), estimated: !!r[6], line: routeLabel(r), headsign: headsign(tt.patRoute[p]), routeType: r[3], agency: r[2], firstDep: tt.dep[base], stops };
  },
  /** A name for a point on the map: address, place or street from the address book, else the nearest stop. */
  reverse({ lat, lon }) { return reverseIn(lat, lon, lang); },
  nearby({ lat, lon, limit = 15, radius = 1200 }) {
    const out = [];
    for (let s = 0; s < tt.stops.length; s++) {
      const d = haversine(lat, lon, tt.stopLat[s], tt.stopLon[s]);
      if (d <= radius) out.push({ ...stopOut(s), distance: Math.round(d) });
    }
    out.sort((a, b) => a.distance - b.distance);
    return out.slice(0, limit).map((o) => ({ ...o, lines: linesAt(o.stop) }));
  },
  /** A stop's lines; for a station (parent index), the lines of all its platforms under the station's name. */
  stopInfo({ stop, station = -1 }) {
    if (station < 0) return { ...stopOut(stop), lines: linesAt(stop, 30) };
    const seen = new Map();
    for (const s of tt.stationStops.get(station) || [stop]) for (const l of linesAt(s, 40)) if (!seen.has(l.label)) seen.set(l.label, l);
    return { ...stopOut(stop), name: stName(station) || sName(stop), code: '', lines: Array.from(seen.values()).slice(0, 30) };
  },
  /** The GTFS route ids of the lines serving stops within `radius` m of a point: what can be taken from there. */
  nearbyRoutes({ lat, lon, radius = 500 }) {
    const ids = new Set();
    for (let s = 0; s < tt.stops.length; s++) {
      if (haversine(lat, lon, tt.stopLat[s], tt.stopLon[s]) > radius) continue;
      for (let i = tt.stopPatsOff[s]; i < tt.stopPatsOff[s + 1]; i++) { const id = tt.routes[tt.patRoute[tt.stopPats[2 * i]]][4]; if (id != null) ids.add(String(id)); }
    }
    return Array.from(ids);
  },
  /** The language every name is handed out in from now on (what the timetable carries; Hebrew otherwise). */
  setLang({ lang: l }) { lang = l || 'he'; lineIdx = null; return lang; },
  departures({ stop, fromTime, limit = 40 }) {
    const out = [];
    for (let i = tt.stopPatsOff[stop]; i < tt.stopPatsOff[stop + 1]; i++) {
      const p = tt.stopPats[2 * i], pos = tt.stopPats[2 * i + 1];
      const ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p];
      if (pos === ns - 1) continue;   // a vehicle ending here is not a departure
      const r = tt.routes[tt.patRoute[p]];
      const tFirst = tt.patTripsOff[p], tEnd = tt.patTripsOff[p + 1], base = tt.tripTimesOff[p];
      for (let t = tFirst; t < tEnd; t++) {
        const d = tt.dep[base + (t - tFirst) * ns + pos];
        if (d >= fromTime) out.push({ time: d, line: routeLabel(r), headsign: headsign(tt.patRoute[p]), routeType: r[3], agency: r[2], trip: t, routeId: liveId(r), estimated: !!r[6], firstDep: tt.dep[base + (t - tFirst) * ns], last: pos === ns - 1 });
      }
    }
    out.sort((a, b) => a.time - b.time);
    return out.slice(0, limit);
  },
};

const NO_TIMETABLE = new Set(['loadTimetable', 'setLang', 'liveQuery', 'localize']);
self.onmessage = async (ev) => {
  const { id, op, args } = ev.data;
  try {
    if (!ops[op]) throw new Error('unknown op ' + op);
    // live vehicles and place names do not wait for the timetable (the map asks for vehicles before it is in, and a
    // refusal sent it to Hasadna's database, 15 minutes behind at rush hour)
    if (!tt && !NO_TIMETABLE.has(op)) throw new Error('timetable not loaded');
    const result = await ops[op](args || {});
    post({ id, result });
  } catch (e) {
    post({ id, error: e && e.message ? e.message : String(e) });
  }
};
