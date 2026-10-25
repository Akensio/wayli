// Wayli: compact street graph for the first and last mile, on foot or by bike.
// Loads the container from pipeline/streets.py; bounded Dijkstra from a point
// to every transit stop nearby, and point-to-point routes for bike-only trips.
import { haversine } from './geo.js';
import { readContainer } from './container.js';

export function parseStreets(ab) {
  const g = readContainer(ab), header = g.header;
  Object.assign(g, { M: header.counts.nodes, cell: header.cell_deg });
  if (header.format >= 2) {
    const M = g.M, cell = g.cell;
    g.nodeLat = new Float32Array(M); g.nodeLon = new Float32Array(M);
    for (let i = 0; i < g.cellKey.length; i++) {
      const key = g.cellKey[i], cy = Math.floor(key / 100000), cx = key - cy * 100000;
      for (let n = g.cellStart[i]; n < g.cellEnd[i]; n++) {
        g.nodeLat[n] = (cy + g.nodeLatOff[n] / 65535) * cell;
        g.nodeLon[n] = (cx + g.nodeLonOff[n] / 65535) * cell;
      }
    }
    const E = g.edgeToDelta.length;
    g.edgeTo = new Int32Array(E);
    for (let n = 0; n < M; n++) for (let e = g.edgeOff[n]; e < g.edgeOff[n + 1]; e++) g.edgeTo[e] = n + g.edgeToDelta[e];
  }
  const fl = header.flags;
  g.kindMask = fl.kind_mask; g.flagShift = fl.flag_shift; g.walkFlag = fl.walk; g.bikeFlag = fl.bike;
  g.walkSpeed = new Float32Array(8); g.bikeSpeed = new Float32Array(8);
  for (let k = 0; k < 6; k++) { g.walkSpeed[k] = header.walk_speed[k]; g.bikeSpeed[k] = header.bike_speed[k]; }
  g.climb = header.climb && g.edgeUp ? header.climb : null;   // a graph built with heights (streets.py --dem)
  g.cellIndex = new Map();
  for (let i = 0; i < g.cellKey.length; i++) g.cellIndex.set(g.cellKey[i], i);
  return g;
}


/** The edge of `from` that reaches `to`, or -1. */
function edgeBetween(g, from, to) {
  for (let e = g.edgeOff[from]; e < g.edgeOff[from + 1]; e++) if (g.edgeTo[e] === to) return e;
  return -1;
}

/**
 * The nearest points on the streets usable by `mode` within `radius` metres, nearest first: one per street
 * segment (u -> v), how far along it (f, 0 at u), the point and its distance. Nodes are intersections, so
 * the nearest node can be half a block away; the street in front of the door is what a walk starts on.
 * Segments up to `slack` metres further than the nearest come too: the nearest can be a path that leads
 * nowhere, and the router picks the best way in.
 */
function nearestEdges(g, lat, lon, mode = 'walk', radius = 300, slack = 150, k = 8) {
  const c = g.cell, cy = Math.floor(lat / c), cx = Math.floor(lon / c);
  const flag = mode === 'bike' ? g.bikeFlag : g.walkFlag;
  const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
  const found = new Map();   // one per segment, either direction
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const ci = g.cellIndex.get((cy + dy) * 100000 + (cx + dx));
    if (ci === undefined) continue;
    for (let u = g.cellStart[ci]; u < g.cellEnd[ci]; u++) {
      const ax = (g.nodeLon[u] - lon) * kx, ay = (g.nodeLat[u] - lat) * ky;
      for (let e = g.edgeOff[u]; e < g.edgeOff[u + 1]; e++) {
        if (!((g.edgeFlags[e] >> g.flagShift) & flag)) continue;
        const v = g.edgeTo[e];
        const bx = (g.nodeLon[v] - lon) * kx, by = (g.nodeLat[v] - lat) * ky;
        const sx = bx - ax, sy = by - ay, ss = sx * sx + sy * sy;
        const f = ss > 0 ? Math.max(0, Math.min(1, -(ax * sx + ay * sy) / ss)) : 0;
        const d = Math.hypot(ax + f * sx, ay + f * sy);
        if (d >= radius) continue;
        const key = Math.min(u, v) * g.M + Math.max(u, v);
        if (found.has(key)) continue;
        found.set(key, { u, v, e, f, metres: d, lat: g.nodeLat[u] + f * (g.nodeLat[v] - g.nodeLat[u]), lon: g.nodeLon[u] + f * (g.nodeLon[v] - g.nodeLon[u]) });
      }
    }
  }
  const all = [...found.values()].sort((a, b) => a.metres - b.metres);
  return all.length ? all.filter((p) => p.metres <= all[0].metres + slack).slice(0, k) : all;
}

/** Seconds along an open edge: its length at the speed of its kind, and its climbs (streets.py `CLIMB`, estimates): a
 *  walker loses seconds per metre up and on steep descents (not on steps, whose speed has the climb in it); a rider
 *  climbs no faster than a rider rises and gains on a descent up to a safe speed; a bike pushed (footways, steps)
 *  climbs as on foot. */
export function secondsOn(g, e, bike) {
  const L = g.edgeLen[e], k = g.edgeFlags[e] & g.kindMask, v = (bike ? g.bikeSpeed : g.walkSpeed)[k];
  let t = L / v;
  const c = g.climb;
  if (!c) return t;
  const up = g.edgeUp[e], down = g.edgeDown[e];
  if (!up && !down) return t;
  if (bike && v >= 3) return Math.max(L / c.bike_vmax, Math.max(t, up / c.bike_vam) - c.bike_down * down);
  if (k === 4) return t;
  return t + c.walk_up * up + (down > c.steep * L ? c.walk_down_steep * down : 0);
}
/** Seconds along an edge for `mode`, or -1 when the edge is missing or closed to it. */
function edgeSeconds(g, e, mode) {
  if (e < 0) return -1;
  const bike = mode === 'bike';
  if (!((g.edgeFlags[e] >> g.flagShift) & (bike ? g.bikeFlag : g.walkFlag))) return -1;
  return secondsOn(g, e, bike);
}

/**
 * Where points on the streets meet the network: node -> { s: seconds, i: which point }, the cheapest per
 * node. `out` (from the points into the network) or not (from the network to the points); the metres
 * between each point and its street are walked first or last.
 */
const OFF_STREET = 3;
function joins(g, points, mode, out) {
  const m = new Map();
  // off the street there are buildings and fences: the metres beyond the nearest street count three times
  const near = points[0].metres, off = (p) => (near + (p.metres - near) * OFF_STREET) / 1.2;
  const add = (n, sec, i) => { if (sec >= 0) { const s = off(points[i]) + sec; if (!m.has(n) || m.get(n).s > s) m.set(n, { s, i }); } };
  points.forEach((p, i) => {
    const fwd = edgeSeconds(g, p.e, mode), rev = edgeSeconds(g, edgeBetween(g, p.v, p.u), mode);
    // out: to v along u -> v, to u along v -> u; in: from u along u -> v, from v along v -> u
    if (out) { if (fwd >= 0) add(p.v, (1 - p.f) * fwd, i); if (rev >= 0) add(p.u, p.f * rev, i); }
    else { if (fwd >= 0) add(p.u, p.f * fwd, i); if (rev >= 0) add(p.v, (1 - p.f) * rev, i); }
  });
  return m;
}
const asSeeds = (m) => [...m].map(([n, x]) => [n, x.s]);

// binary heap on parallel typed arrays
class Heap {
  constructor(cap = 1024) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  push(key, val) {
    if (this.n === this.k.length) { const k2 = new Float64Array(this.n * 2), v2 = new Int32Array(this.n * 2); k2.set(this.k); v2.set(this.v); this.k = k2; this.v = v2; }
    let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= key) break; this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p; }
    this.k[i] = key; this.v[i] = val;
  }
  pop() {
    const key = this.k[0], val = this.v[0];
    const lk = this.k[--this.n], lv = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= lk) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = lk; this.v[i] = lv;
    return { key, val };
  }
}

/**
 * Dijkstra from `node` (or from seeds, [[node, seconds], ...]) by `mode` up to `maxSeconds`. Calls onNode(node, seconds)
 * for every settled node; returns the settled count. `prev` (optional Int32Array)
 * records the tree for path extraction.
 */
export function reach(g, node, mode, maxSeconds, onNode, prev) {
  const bike = mode === 'bike';
  const flag = bike ? g.bikeFlag : g.walkFlag;
  const seeds = Array.isArray(node) ? node : [[node, 0]];
  const dist = new Map();
  const heap = new Heap();
  for (const [n, d] of seeds) if (!(dist.get(n) <= d)) { dist.set(n, d); heap.push(d, n); }
  let settled = 0;
  while (heap.n) {
    const { key: d, val: u } = heap.pop();
    if (d > dist.get(u)) continue;
    settled++;
    if (onNode && onNode(u, d) === false) break;
    for (let e = g.edgeOff[u]; e < g.edgeOff[u + 1]; e++) {
      const f = g.edgeFlags[e];
      if (!((f >> g.flagShift) & flag)) continue;
      const nd = d + secondsOn(g, e, bike);
      if (nd > maxSeconds) continue;
      const v = g.edgeTo[e];
      const cur = dist.get(v);
      if (cur === undefined || nd < cur) { dist.set(v, nd); if (prev) prev[v] = u; heap.push(nd, v); }
    }
  }
  return settled;
}

/**
 * Transit stops reachable from (lat, lon) by `mode` within maxSeconds.
 * stopNode: Int32Array from the timetable (stop -> street node). Returns [{stop, walk}].
 */
export function accessStops(g, stopNode, lat, lon, mode, maxSeconds, extraPerStop = 30, stopLat = null, stopLon = null, stopBig = null) {
  const points = nearestEdges(g, lat, lon, mode);
  if (!points.length) return [];
  const byNode = new Map();
  for (let s = 0; s < stopNode.length; s++) {
    const n = stopNode[s];
    if (n >= 0) { if (!byNode.has(n)) byNode.set(n, []); byNode.get(n).push(s); }
  }
  const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
  const out = [];
  // the first metres to the street are always on foot (in the seeds)
  // the extra seconds to reach the stop itself count within maxSeconds, so the whole walk keeps to the rider's setting
  reach(g, asSeeds(joins(g, points, mode, true)), mode, Math.max(0, maxSeconds - extraPerStop), (u, d) => {
    const stops = byNode.get(u);
    if (!stops) return;
    for (const s of stops) {
      let walk = d + extraPerStop;
      // standing at the stop (a platform, a station hall): the network detour and the buffer do not apply.
      // Nearby, the straight walk with a detour factor caps a network path that wanders off to reach the node.
      if (mode === 'walk' && stopLat) {
        const straight = Math.hypot((stopLon[s] - lon) * kx, (stopLat[s] - lat) * ky);
        const at = stopBig && stopBig[s] ? 150 : 60;   // a railway station is one point in the feed but a big place
        if (straight <= at) walk = Math.min(straight / 1.2, 30);
        else if (straight <= 300) walk = Math.min(walk, straight * 1.3 / 1.2 + extraPerStop);
      }
      out.push({ stop: s, walk: Math.round(walk), mode });
    }
  });
  return out;
}

/**
 * Point-to-point route by mode: { seconds, metres, path: [[lat, lon], ...] } or null. Both ends snap to the
 * streets nearby (not the nearest intersection), so the path starts and ends in front of the two points.
 */
export function route(g, fromLat, fromLon, toLat, toLon, mode, maxSeconds = 7200) {
  const A = nearestEdges(g, fromLat, fromLon, mode), B = nearestEdges(g, toLat, toLon, mode);
  if (!A.length || !B.length) return null;
  const starts = joins(g, A, mode, true), ends = joins(g, B, mode, false);
  let best = Infinity, last = -1, pa = null, pb = null;
  // both points on the same segment: along it, where the street is open that way
  for (const a of A) for (const b of B) {
    if (!((a.u === b.u && a.v === b.v) || (a.u === b.v && a.v === b.u))) continue;
    const fb = a.u === b.u ? b.f : 1 - b.f;
    const sec = edgeSeconds(g, fb >= a.f ? a.e : edgeBetween(g, a.v, a.u), mode);
    const s = (A[0].metres + (a.metres - A[0].metres) * OFF_STREET + B[0].metres + (b.metres - B[0].metres) * OFF_STREET) / 1.2 + Math.abs(fb - a.f) * sec;
    if (sec >= 0 && s < best) { best = s; pa = a; pb = b; }
  }
  const prev = new Int32Array(g.M).fill(-1);
  reach(g, asSeeds(starts), mode, maxSeconds, (u, d) => {
    if (d >= best) return false;
    const x = ends.get(u);
    if (x && d + x.s < best) { best = d + x.s; last = u; pb = B[x.i]; }
  }, prev);
  if (best === Infinity) return null;
  const chain = [];
  if (last >= 0) {
    for (let u = last; u !== -1; u = prev[u]) chain.push(u);
    chain.reverse();
    pa = A[starts.get(chain[0]).i];
  }
  const path = [[pa.lat, pa.lon]];
  let metres = pa.metres + pb.metres, at = path[0];
  for (let i = 0; i < chain.length; i++) {
    const u = chain[i];
    metres += i ? segLen(g, chain[i - 1], u) : haversine(at[0], at[1], g.nodeLat[u], g.nodeLon[u]);
    path.push([g.nodeLat[u], g.nodeLon[u]]);
  }
  at = path[path.length - 1];
  metres += haversine(at[0], at[1], pb.lat, pb.lon);
  path.push([pb.lat, pb.lon]);
  return { seconds: Math.round(best), metres: Math.round(metres), path };
}

function segLen(g, u, v) {
  for (let e = g.edgeOff[u]; e < g.edgeOff[u + 1]; e++) if (g.edgeTo[e] === v) return g.edgeLen[e];
  return haversine(g.nodeLat[u], g.nodeLon[u], g.nodeLat[v], g.nodeLon[v]);
}
