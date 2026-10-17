// Wayli worker: holds the timetable and the street graph, answers every query off the main thread.
import { parseTimetable, searchStops, profile, fmtTime, routeLabel } from './raptor.js';
import { parseStreets, accessStops, route } from './streets.js';
import { parsePlaces, searchPlaces, kindLabel, reverseGeocode } from './places.js';

let tt = null, st = null, pl = null;
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
    if (!seen.has(label)) seen.set(label, { label, type: r[3], agency: r[2] });
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

function legOut(l, q) {
  const o = { type: l.type, depart: l.depart, arrive: l.arrive, seconds: l.seconds };
  if (l.type === 'ride') {
    Object.assign(o, { from: stopOut(l.from), to: stopOut(l.to), stops: l.stops, line: routeLabel(l.route),
      headsign: headsign(l.route), agency: l.route[2], routeType: l.route[3],
      path: l.via.map((s) => [tt.stopLat[s], tt.stopLon[s]]) });
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
  plan({ from, to, fromTime, toTime, bike = 'none', folding = false, weekday = true, maxTransfers = 3 }) {
    const t0 = performance.now();
    const q = {
      from: resolvePlace(from, bike === 'none' ? 'walk' : 'bike', bike === 'none' ? 900 : 1200),
      to: resolvePlace(to, bike === 'along' ? 'bike' : 'walk', bike === 'along' ? 1200 : 900),
    };
    if (!q.from.places.length || !q.to.places.length) return { journeys: [], reason: !q.from.places.length ? 'noOriginStops' : 'noDestStops', ms: 0 };
    const r = profile(tt, q.from.places, q.to.places, fromTime, toTime, { maxTransfers, bikeOnBoard: bike === 'along', folding, weekday });
    const journeys = r.journeys.map((j) => ({
      depart: j.depart, arrive: j.arrive, transfers: j.transfers, walkSeconds: j.walkSeconds,
      legs: j.legs.filter((l) => l.type === 'ride' || l.seconds > 0).map((l) => legOut(l, q)),
    }));
    let bikeOnly = null;
    if (st && bike !== 'none' && q.from.point && q.to.point) {
      const br = route(st, q.from.point.lat, q.from.point.lon, q.to.point.lat, q.to.point.lon, 'bike', 3 * 3600);
      if (br) bikeOnly = { seconds: br.seconds, metres: br.metres, path: br.path };
    }
    return { journeys, bikeOnly, candidates: r.candidates, streets: !!st, ms: performance.now() - t0 };
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
      if (pos === ns - 1) continue;
      const r = tt.routes[tt.patRoute[p]];
      const tFirst = tt.patTripsOff[p], tEnd = tt.patTripsOff[p + 1], base = tt.tripTimesOff[p];
      for (let t = tFirst; t < tEnd; t++) {
        const d = tt.dep[base + (t - tFirst) * ns + pos];
        if (d >= fromTime) out.push({ time: d, line: routeLabel(r), headsign: headsign(r), routeType: r[3], agency: r[2], trip: t });
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
