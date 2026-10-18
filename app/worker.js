// Wayli worker: holds the timetable and the street graph, answers every query off the main thread.
import { parseTimetable, searchStops, profile, fmtTime, routeLabel } from './raptor.js';
import { parseStreets, accessStops, route } from './streets.js';
import { parsePlaces, searchPlaces, kindLabel, reverseGeocode } from './places.js';
import { estimateDelay, secondsOn } from './live.js';

let tt = null, st = null, pl = null, sh = null;

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

function headsign(route) {
  // MOT route_long_name: "origin-city<->destination-city-1#"; the city is after the last dash
  const parts = route[1].split('<->');
  if (parts.length !== 2) return route[1];
  const dest = parts[1].replace(/-\d+[#א-ת]*$/, '').trim();
  const i = dest.lastIndexOf('-');
  return i > 0 ? dest.slice(0, i).trim() : dest;
}

function stopOut(s) {
  return { stop: s, name: tt.stops[s][1], city: tt.stops[s][3] || '', code: tt.stops[s][2], lat: tt.stopLat[s], lon: tt.stopLon[s] };
}

/** Resolve a place into origin/destination entries for the planner. */
function resolvePlace(place, mode, maxSeconds) {
  if (place.stops) return { places: place.stops.map((s) => ({ stop: s, walk: 0 })), point: place.lat != null ? { lat: place.lat, lon: place.lon } : null };
  const { lat, lon } = place;
  if (st) {
    const places = accessStops(st, tt.stopNode, lat, lon, mode, maxSeconds);
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
  for (let i = 0; i < ns; i++) { const s = tt.patStops[tt.patStopsOff[p] + i]; out.push({ lat: tt.stopLat[s], lon: tt.stopLon[s], arr: tt.arr[base + i], dep: tt.dep[base + i] }); }
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
    const est = estimateDelay({ lat: v.lat, lon: v.lon, recordedAt: rec }, stops, day);
    if (!est) continue;
    tripLive.set(t, { delay: est.delay, index: est.index, seen: rec.getTime(), stale: est.ageSec > 240, lat: v.lat, lon: v.lon });
    if (Math.abs(est.delay) < 60) continue;
    const prevBase = t > tt.patTripsOff[p] ? base - ns : -1, nextBase = t + 1 < tt.patTripsOff[p + 1] ? base + ns : -1;
    for (let i = est.index; i < ns; i++) {
      const idx = base + i;
      let nd = tt.dep[idx] + est.delay, na = tt.arr[idx] + est.delay;
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
    Object.assign(o, { from: stopOut(l.from), to: stopOut(l.to), stops: l.stops, line: routeLabel(l.route),
      headsign: headsign(l.route), agency: l.route[2], routeType: l.route[3],
      trip: l.trip, routeId: l.route[4] ?? null, route: tt.patRoute[p], firstDep: tt.dep[base], boardPos: bp, live: tripLive.get(l.trip) || null,
      pattern: p, alightPos: bp + l.stops,
      path: ridePath(p, bp, bp + l.stops) || l.via.map((s) => [tt.stopLat[s], tt.stopLon[s]]), pathKind: hasCourse(p) ? 'shape' : 'stops',
      // every stop of the leg with its times, for "get off in N stops" and the expandable stop list
      stopsAlong: l.via.map((s, i) => ({ stop: s, name: tt.stops[s][1], lat: tt.stopLat[s], lon: tt.stopLon[s], arr: tt.arr[base + bp + i], dep: tt.dep[base + bp + i] })) });
  } else if (l.type === 'walk') {
    Object.assign(o, { from: stopOut(l.from), to: stopOut(l.to), path: [[tt.stopLat[l.from], tt.stopLon[l.from]], [tt.stopLat[l.to], tt.stopLon[l.to]]] });
  } else if (l.type === 'access') {
    const p = q.from.places.find((x) => x.stop === l.to);
    Object.assign(o, { to: stopOut(l.to), mode: p && p.mode === 'bike' ? 'bike' : 'walk', path: pathTo(q.from.point, l.to, p && p.mode) });
  } else if (l.type === 'egress') {
    const p = q.to.places.find((x) => x.stop === l.from);
    Object.assign(o, { from: stopOut(l.from), mode: p && p.mode === 'bike' ? 'bike' : 'walk', path: pathTo(q.to.point, l.from, p && p.mode, true) });
  }
  return o;
}

function pathTo(point, stop, mode, reverse) {
  if (!point) return [];
  let path = null;
  if (st) {
    const r = route(st, point.lat, point.lon, tt.stopLat[stop], tt.stopLon[stop], mode === 'bike' ? 'bike' : 'walk', 3600);
    if (r && r.path.length) path = [[point.lat, point.lon], ...r.path, [tt.stopLat[stop], tt.stopLon[stop]]];
  }
  if (!path) path = [[point.lat, point.lon], [tt.stopLat[stop], tt.stopLon[stop]]];
  return reverse ? path.reverse() : path;
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

const ops = {
  async loadTimetable({ url }) {
    const buf = await fetchContainer(url, 'timetable');
    tt = parseTimetable(buf);
    return { date: tt.header.date, counts: tt.counts, feed: tt.header.feed, streets: !!tt.header.streets };
  },
  async loadStreets({ url }) {
    const buf = await fetchContainer(url, 'streets');
    st = parseStreets(buf);
    return { nodes: st.M };
  },
  async loadShapes({ url }) {
    const buf = await fetchContainer(url, 'shapes');
    sh = parseShapes(buf);
    return sh.header.counts;
  },
  /** Courses for ride legs planned before the shapes were loaded: null where there is none. */
  ridePaths({ legs }) { return legs.map((l) => ridePath(l.pattern, l.boardPos, l.alightPos)); },
  async loadPlaces({ url }) {
    const buf = await fetchContainer(url, 'places');
    pl = parsePlaces(buf);
    return pl.header.counts;
  },
  /** Stops and stations first, then addresses, streets, places and cities from the address book. */
  search({ q, limit = 10, lang = 'he', near = null }) {
    let stops = searchStops(tt, q, limit).map((g) => ({ kind: 'stop', key: g.key, name: g.name, city: g.city, stops: g.stops, lat: g.lat, lon: g.lon, code: g.code, platforms: g.stops.length }));
    if (near) {
      // nearby first, search order within each distance band
      const band = (g) => { const km = haversine(near.lat, near.lon, g.lat, g.lon) / 1000; return km < 3 ? 0 : km < 15 ? 1 : 2; };
      stops = stops.map((g, i) => ({ g, i, b: band(g) })).sort((a, b) => a.b - b.b || a.i - b.i).map((x) => x.g);
    }
    const hasDigit = /\d/.test(q);
    let places = [];
    if (pl) {
      places = searchPlaces(pl, q, limit, near).map((r) => ({ kind: r.kind, name: r.name, city: r.city, lat: r.lat, lon: r.lon, approx: r.approx ?? null,
        label: r.kind === 'poi' ? kindLabel(r.poiKind, lang) : null, score: r.score }));
    }
    // an address-looking query puts addresses first; otherwise stops first, then the best places
    const top = places.filter((p) => p.kind === 'address' || (p.kind === 'city' && p.score >= 6));
    const rest = places.filter((p) => !top.includes(p));
    const merged = hasDigit ? [...top, ...stops, ...rest] : [...stops.slice(0, 5), ...top, ...rest, ...stops.slice(5)];
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
    const r = profile(tt, q.from.places, q.to.places, fromTime, toTime, { maxTransfers, bikeOnBoard: bike === 'along', folding, weekday });
    let found = r.journeys;
    if (arriveBy) found = found.filter((j) => j.arrive <= toTime);
    const journeys = found.map((j) => ({
      depart: j.depart, arrive: j.arrive, transfers: j.transfers, walkSeconds: j.walkSeconds,
      legs: j.legs.filter((l) => l.type === 'ride' || l.seconds > 0).map((l) => legOut(l, q)),
    }));
    let bikeOnly = null;
    if (st && bike !== 'none' && q.from.point && q.to.point) {
      const br = route(st, q.from.point.lat, q.from.point.lon, q.to.point.lat, q.to.point.lon, 'bike', 3 * 3600);
      if (br) bikeOnly = { seconds: br.seconds, metres: br.metres, path: br.path };
    }
    return { journeys, groups: groupJourneys(journeys), bikeOnly, candidates: r.candidates, streets: !!st, live, ms: performance.now() - t0 };
    }
  },
  /** Line labels for SIRI line refs (GTFS route ids) of the loaded day. */
  routeLabels({ ids }) {
    if (!routeById) indexRoutes();
    const out = {};
    for (const id of ids) { const ri = routeById.get(String(id)); if (ri != null) { const r = tt.routes[ri]; out[id] = { line: routeLabel(r), type: r[3], agency: r[2], headsign: headsign(r), route: ri }; } }
    return out;
  },
  /** Lines by number: exact matches first, then prefix; one row per direction, grouped by line and agency. */
  searchLines({ q, limit = 20 }) {
    if (!routePats) indexRoutes();
    const n = String(q || '').trim().toLowerCase();
    if (!n) return [];
    const rows = [];
    const trainQ = 'train'.startsWith(n) || 'רכבת'.startsWith(n);
    tt.routes.forEach((r, i) => {
      const label = routeLabel(r).toLowerCase();
      const score = label === n ? 3 : (label === 'train' && trainQ) ? 2 : label.startsWith(n) ? 1 : 0;
      if (!score) return;
      let trips = 0;
      for (const p of routePats.get(i) || []) trips += tt.patTripsOff[p + 1] - tt.patTripsOff[p];
      rows.push({ route: i, routeId: r[4] ?? null, line: routeLabel(r), agency: r[2], routeType: r[3], headsign: headsign(r), trips, score });
    });
    const num = (x) => { const m = /^\d+/.exec(x); return m ? +m[0] : 1e9; };
    rows.sort((a, b) => b.score - a.score || num(a.line) - num(b.line) || a.line.localeCompare(b.line) || a.agency.localeCompare(b.agency) || b.trips - a.trips);
    return rows.slice(0, limit);
  },
  /** One direction of a line: its main pattern's stops and course, today's trips, and its other directions. */
  lineInfo({ route }) {
    if (!routePats) indexRoutes();
    const r = tt.routes[route];
    const pats = routePats.get(route) || [];
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
    const others = [];
    const label = routeLabel(r);
    tt.routes.forEach((o, i) => { if (i !== route && routeLabel(o) === label && o[2] === r[2] && (routePats.get(i) || []).length) others.push({ route: i, headsign: headsign(o) }); });
    return { route, routeId: r[4] ?? null, line: label, agency: r[2], routeType: r[3], headsign: headsign(r), stops, path, pathKind: best >= 0 && hasCourse(best) ? 'shape' : 'stops', trips, first, last, variants: pats.length, others: others.slice(0, 6) };
  },
  /** Which trip each reported vehicle runs and how late it is (for the line page's map). */
  vehiclesStatus({ vehicles }) {
    const day = tt.header.date;
    return vehicles.map((v) => {
      const t = tripFor(v.lineRef, secondsOn(new Date(v.scheduledStart), day));
      if (t < 0) return { trip: -1 };
      const { stops } = tripStopList(t);
      const est = estimateDelay({ lat: v.lat, lon: v.lon, recordedAt: new Date(v.recordedAt) }, stops, day);
      return { trip: t, delay: est ? est.delay : null, stale: est ? est.ageSec > 240 : true, index: est ? est.index : -1, headsign: headsign(tt.routes[tt.patRoute[tt.tripPat[t]]]) };
    });
  },
  /** The trip a reported vehicle is running: route id and scheduled start (ISO or ms). */
  tripFor({ routeId, scheduledStart }) { return tripFor(routeId, secondsOn(new Date(scheduledStart), tt.header.date)); },
  /** Every stop of the day as GeoJSON, for the live map. */
  stopsGeo() {
    const features = [];
    for (let s = 0; s < tt.stops.length; s++) features.push({ type: 'Feature', properties: { stop: s, name: tt.stops[s][1] }, geometry: { type: 'Point', coordinates: [tt.stopLon[s], tt.stopLat[s]] } });
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
    return { trip, routeId: r[4] ?? null, line: routeLabel(r), headsign: headsign(r), routeType: r[3], agency: r[2], firstDep: tt.dep[base], stops };
  },
  /** A name for a point on the map: address, place or street from the address book, else the nearest stop. */
  reverse({ lat, lon }) {
    if (pl) {
      const r = reverseGeocode(pl, lat, lon);
      if (r) return { name: r.city && r.kind !== 'city' ? `${r.name}, ${r.city}` : r.name, kind: r.kind, distance: r.distance };
    }
    let best = -1, bd = 600;
    for (let s = 0; s < tt.stops.length; s++) {
      const d = haversine(lat, lon, tt.stopLat[s], tt.stopLon[s]);
      if (d < bd) { bd = d; best = s; }
    }
    if (best >= 0) return { name: tt.stops[best][1], kind: 'stop', distance: Math.round(bd) };
    return { name: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, kind: 'point', distance: 0 };
  },
  nearby({ lat, lon, limit = 15, radius = 1200 }) {
    const out = [];
    for (let s = 0; s < tt.stops.length; s++) {
      const d = haversine(lat, lon, tt.stopLat[s], tt.stopLon[s]);
      if (d <= radius) out.push({ ...stopOut(s), distance: Math.round(d) });
    }
    out.sort((a, b) => a.distance - b.distance);
    return out.slice(0, limit).map((o) => ({ ...o, lines: linesAt(o.stop) }));
  },
  stopInfo({ stop }) { return { ...stopOut(stop), lines: linesAt(stop, 30) }; },
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
        if (d >= fromTime) out.push({ time: d, line: routeLabel(r), headsign: headsign(r), routeType: r[3], agency: r[2], trip: t, routeId: r[4] ?? null, firstDep: tt.dep[base + (t - tFirst) * ns], last: pos === ns - 1 });
      }
    }
    out.sort((a, b) => a.time - b.time);
    return out.slice(0, limit);
  },
};

self.onmessage = async (ev) => {
  const { id, op, args } = ev.data;
  try {
    if (!ops[op]) throw new Error('unknown op ' + op);
    if (!tt && op !== 'loadTimetable') throw new Error('timetable not loaded');
    const result = await ops[op](args || {});
    post({ id, result });
  } catch (e) {
    post({ id, error: e && e.message ? e.message : String(e) });
  }
};
