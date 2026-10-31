// Wayli: compact street graph for the first and last mile, on foot or by bike.
// Loads the container from pipeline/streets.py; bounded Dijkstra from a point
// to every transit stop nearby, and point-to-point routes for bike-only trips.
import { haversine, scaleAt, nearestOnSegment } from './geo.ts';
import { readContainer, type ContainerHeader } from './container.ts';
import type { StopAccess } from './raptor.ts';

/** How the rider moves on the streets: on foot or by bike. */
export type StreetMode = 'walk' | 'bike';
/** What a climb costs (streets.py CLIMB, estimates; read by secondsOn). On foot: seconds per metre up, and per metre
 *  down on a descent steeper than `steep` (metres down per metre of length). By bike: the vertical speed a climb is
 *  held to (metres up per second), the seconds a metre down saves, and the speed a descent cannot exceed (m/s). */
export type Climb = {
  walk_up: number;
  walk_down_steep: number;
  steep: number;
  bike_vam: number;
  bike_down: number;
  bike_vmax: number;
};
/** The street graph's header, as pipeline/streets.py writes it. */
export type StreetsHeader = ContainerHeader & {
  /** 2 stores positions as offsets inside grid cells and edge heads as deltas (1 stored nodeLat, nodeLon and edgeTo
   *  outright); 3 adds edgeUp and edgeDown. */
  format: number;
  source?: string;
  built?: string;
  counts: { nodes: number; edges: number; cells: number };
  cell_deg: number; // the grid cell's side, degrees
  cell_key?: string; // how cellKey is made, for the reader
  /** How edgeFlags reads: the kind is flags & kind_mask; (flags >> flag_shift) & walk, & bike say who may use the edge. */
  flags: { walk: number; bike: number; flag_shift: number; kind_mask: number };
  /** Metres per second by edge kind (the kind's number as the JSON key). */
  walk_speed: Record<string, number>;
  bike_speed: Record<string, number>;
  climb?: Climb; // only in a graph built with heights (--dem)
  dem?: string;
};
/** The sections the street graph file has; edgeUp and edgeDown only in a graph built with heights. */
type StreetsSection =
  | 'nodeLatOff'
  | 'nodeLonOff'
  | 'edgeOff'
  | 'edgeToDelta'
  | 'edgeLen'
  | 'edgeFlags'
  | 'edgeUp'
  | 'edgeDown'
  | 'cellKey'
  | 'cellStart'
  | 'cellEnd';
/**
 * The street graph: nodes are intersections and way ends, numbered cell by cell on a grid of `cell` degrees; edges
 * are directed, node n's being edgeOff[n] .. edgeOff[n + 1]). An edge's kind (streets.py KIND) sets its speed:
 * 0 road, 1 cycleway, 2 footway, 3 path, 4 steps, 5 living or service street.
 */
export type Streets = {
  header: StreetsHeader;
  // ---- the sections
  /** Per cell: its key, floor(lat / cell) * 100000 + floor(lon / cell), and its nodes, cellStart[i] .. cellEnd[i]). */
  cellKey: Int32Array;
  cellStart: Int32Array;
  cellEnd: Int32Array;
  /** Per node: where it is inside its cell, 0..65535 for 0..cell degrees (format 2 and later). */
  nodeLatOff: Uint16Array;
  nodeLonOff: Uint16Array;
  edgeOff: Int32Array;
  /** Per edge: its head node as an offset from its tail (format 2 and later). */
  edgeToDelta: Int32Array;
  /** Per edge: its length, metres. */
  edgeLen: Uint16Array;
  /** Per edge: its kind and who may use it (see the header's flags). */
  edgeFlags: Uint8Array;
  /** Per edge, in a graph built with heights: the metres climbed and descended along it, in its direction. */
  edgeUp?: Uint8Array;
  edgeDown?: Uint8Array;
  // ---- derived on load (stored sections in format 1)
  nodeLat: Float32Array;
  nodeLon: Float32Array;
  /** Per edge: its head node. */
  edgeTo: Int32Array;
  // ---- from the header
  M: number; // how many nodes
  cell: number; // the grid cell's side, degrees
  kindMask: number;
  flagShift: number;
  walkFlag: number;
  bikeFlag: number;
  /** Metres per second by edge kind. */
  walkSpeed: Float32Array;
  bikeSpeed: Float32Array;
  /** What a climb costs; null in a graph without heights. */
  climb: Climb | null;
  /** Cell key -> its index in cellKey. */
  cellIndex: Map<number, number>;
};

export function parseStreets(ab: ArrayBuffer): Streets {
  const g = readContainer<StreetsSection, StreetsHeader>(ab) as Streets, // the rest is added below
    header = g.header;
  Object.assign(g, { M: header.counts.nodes, cell: header.cell_deg });
  if (header.format >= 2) {
    const M = g.M,
      cell = g.cell;
    g.nodeLat = new Float32Array(M);
    g.nodeLon = new Float32Array(M);
    for (let i = 0; i < g.cellKey.length; i++) {
      const key = g.cellKey[i],
        cy = Math.floor(key / 100000),
        cx = key - cy * 100000;
      for (let n = g.cellStart[i]; n < g.cellEnd[i]; n++) {
        g.nodeLat[n] = (cy + g.nodeLatOff[n] / 65535) * cell;
        g.nodeLon[n] = (cx + g.nodeLonOff[n] / 65535) * cell;
      }
    }
    const E = g.edgeToDelta.length;
    g.edgeTo = new Int32Array(E);
    for (let n = 0; n < M; n++)
      for (let e = g.edgeOff[n]; e < g.edgeOff[n + 1]; e++) g.edgeTo[e] = n + g.edgeToDelta[e];
  }
  const fl = header.flags;
  g.kindMask = fl.kind_mask;
  g.flagShift = fl.flag_shift;
  g.walkFlag = fl.walk;
  g.bikeFlag = fl.bike;
  g.walkSpeed = new Float32Array(8);
  g.bikeSpeed = new Float32Array(8);
  for (let k = 0; k < 6; k++) {
    g.walkSpeed[k] = header.walk_speed[k];
    g.bikeSpeed[k] = header.bike_speed[k];
  }
  g.climb = header.climb && g.edgeUp ? header.climb : null; // a graph built with heights (streets.py --dem)
  g.cellIndex = new Map();
  for (let i = 0; i < g.cellKey.length; i++) g.cellIndex.set(g.cellKey[i], i);
  return g;
}

/** The edge of `from` that reaches `to`, or -1. */
function edgeBetween(g: Streets, from: number, to: number): number {
  for (let e = g.edgeOff[from]; e < g.edgeOff[from + 1]; e++) if (g.edgeTo[e] === to) return e;
  return -1;
}

/** A point on a street: on the segment from node u to node v (edge e), f of the way along it (0 at u), `metres`
 *  from the point asked about, and where it is. */
type StreetPoint = { u: number; v: number; e: number; f: number; metres: number; lat: number; lon: number };

/**
 * The nearest points on the streets usable by `mode` within `radius` metres, nearest first: one per street
 * segment (u -> v), how far along it (f, 0 at u), the point and its distance. Nodes are intersections, so
 * the nearest node can be half a block away; the street in front of the door is what a walk starts on.
 * Segments up to `slack` metres further than the nearest come too: the nearest can be a path that leads
 * nowhere, and the router picks the best way in.
 */
function nearestEdges(
  g: Streets,
  lat: number,
  lon: number,
  mode: StreetMode = 'walk',
  radius = 300,
  slack = 150,
  k = 8,
): StreetPoint[] {
  const c = g.cell,
    cy = Math.floor(lat / c),
    cx = Math.floor(lon / c);
  const flag = mode === 'bike' ? g.bikeFlag : g.walkFlag;
  const { kx, ky } = scaleAt(lat);
  const found = new Map<number, StreetPoint>(); // one per segment, either direction
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const ci = g.cellIndex.get((cy + dy) * 100000 + (cx + dx));
      if (ci === undefined) continue;
      for (let u = g.cellStart[ci]; u < g.cellEnd[ci]; u++) {
        const ax = (g.nodeLon[u] - lon) * kx,
          ay = (g.nodeLat[u] - lat) * ky;
        for (let e = g.edgeOff[u]; e < g.edgeOff[u + 1]; e++) {
          if (!((g.edgeFlags[e] >> g.flagShift) & flag)) continue;
          const v = g.edgeTo[e];
          const { f, d } = nearestOnSegment(
            ax,
            ay,
            (g.nodeLon[v] - g.nodeLon[u]) * kx,
            (g.nodeLat[v] - g.nodeLat[u]) * ky,
          );
          if (d >= radius) continue;
          const key = Math.min(u, v) * g.M + Math.max(u, v);
          if (found.has(key)) continue;
          found.set(key, {
            u,
            v,
            e,
            f,
            metres: d,
            lat: g.nodeLat[u] + f * (g.nodeLat[v] - g.nodeLat[u]),
            lon: g.nodeLon[u] + f * (g.nodeLon[v] - g.nodeLon[u]),
          });
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
export function secondsOn(g: Streets, e: number, bike: boolean): number {
  const L = g.edgeLen[e],
    k = g.edgeFlags[e] & g.kindMask,
    v = (bike ? g.bikeSpeed : g.walkSpeed)[k];
  let t = L / v;
  const c = g.climb;
  if (!c) return t;
  const up = g.edgeUp![e], // climb is set only when the graph has them (parseStreets)
    down = g.edgeDown![e];
  if (!up && !down) return t;
  if (bike && v >= 3) return Math.max(L / c.bike_vmax, Math.max(t, up / c.bike_vam) - c.bike_down * down);
  if (k === 4) return t;
  return t + c.walk_up * up + (down > c.steep * L ? c.walk_down_steep * down : 0);
}
/** Seconds along an edge for `mode`, or -1 when the edge is missing or closed to it. */
function edgeSeconds(g: Streets, e: number, mode: StreetMode): number {
  if (e < 0) return -1;
  const bike = mode === 'bike';
  if (!((g.edgeFlags[e] >> g.flagShift) & (bike ? g.bikeFlag : g.walkFlag))) return -1;
  return secondsOn(g, e, bike);
}

/** Where a point meets the network at a node: after `s` seconds, from the `i`-th of the points. */
type Join = { s: number; i: number };
/**
 * Where points on the streets meet the network: node -> { s: seconds, i: which point }, the cheapest per
 * node. `out` (from the points into the network) or not (from the network to the points); the metres
 * between each point and its street are walked first or last.
 */
const OFF_STREET = 3;
function joins(g: Streets, points: StreetPoint[], mode: StreetMode, out: boolean): Map<number, Join> {
  const m = new Map<number, Join>();
  // off the street there are buildings and fences: the metres beyond the nearest street count three times
  const near = points[0].metres,
    off = (p: StreetPoint) => (near + (p.metres - near) * OFF_STREET) / 1.2;
  const add = (n: number, sec: number, i: number): void => {
    if (sec >= 0) {
      const s = off(points[i]) + sec;
      if (!m.has(n) || m.get(n)!.s > s) m.set(n, { s, i });
    }
  };
  points.forEach((p, i) => {
    const fwd = edgeSeconds(g, p.e, mode),
      rev = edgeSeconds(g, edgeBetween(g, p.v, p.u), mode);
    // out: to v along u -> v, to u along v -> u; in: from u along u -> v, from v along v -> u
    if (out) {
      if (fwd >= 0) add(p.v, (1 - p.f) * fwd, i);
      if (rev >= 0) add(p.u, p.f * rev, i);
    } else {
      if (fwd >= 0) add(p.u, p.f * fwd, i);
      if (rev >= 0) add(p.v, (1 - p.f) * rev, i);
    }
  });
  return m;
}
/** A node a search starts from, with the seconds already spent getting to it. */
export type Seed = [node: number, seconds: number];
const asSeeds = (m: Map<number, Join>): Seed[] => [...m].map(([n, x]) => [n, x.s]);

// binary heap on parallel typed arrays
class Heap {
  k: Float64Array;
  v: Int32Array;
  n: number;
  constructor(cap = 1024) {
    this.k = new Float64Array(cap);
    this.v = new Int32Array(cap);
    this.n = 0;
  }
  push(key: number, val: number): void {
    if (this.n === this.k.length) {
      const k2 = new Float64Array(this.n * 2),
        v2 = new Int32Array(this.n * 2);
      k2.set(this.k);
      v2.set(this.v);
      this.k = k2;
      this.v = v2;
    }
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p];
      this.v[i] = this.v[p];
      i = p;
    }
    this.k[i] = key;
    this.v[i] = val;
  }
  pop(): { key: number; val: number } {
    const key = this.k[0],
      val = this.v[0];
    const lk = this.k[--this.n],
      lv = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= lk) break;
      this.k[i] = this.k[c];
      this.v[i] = this.v[c];
      i = c;
    }
    this.k[i] = lk;
    this.v[i] = lv;
    return { key, val };
  }
}

/**
 * Dijkstra from `node` (or from seeds, [[node, seconds], ...]) by `mode` up to `maxSeconds`. Calls onNode(node, seconds)
 * for every settled node; returns the settled count. `prev` (optional Int32Array)
 * records the tree for path extraction.
 */
export function reach(
  g: Streets,
  node: number | Seed[],
  mode: StreetMode,
  maxSeconds: number,
  onNode?: (node: number, seconds: number) => boolean | void,
  prev?: Int32Array,
): number {
  const bike = mode === 'bike';
  const flag = bike ? g.bikeFlag : g.walkFlag;
  const seeds: Seed[] = Array.isArray(node) ? node : [[node, 0]];
  const dist = new Map<number, number>();
  const heap = new Heap();
  for (const [n, d] of seeds)
    if (!((dist.get(n) ?? Infinity) <= d)) {
      dist.set(n, d);
      heap.push(d, n);
    }
  let settled = 0;
  while (heap.n) {
    const { key: d, val: u } = heap.pop();
    if (d > dist.get(u)!) continue;
    settled++;
    if (onNode && onNode(u, d) === false) break;
    for (let e = g.edgeOff[u]; e < g.edgeOff[u + 1]; e++) {
      const f = g.edgeFlags[e];
      if (!((f >> g.flagShift) & flag)) continue;
      const nd = d + secondsOn(g, e, bike);
      if (nd > maxSeconds) continue;
      const v = g.edgeTo[e];
      const cur = dist.get(v);
      if (cur === undefined || nd < cur) {
        dist.set(v, nd);
        if (prev) prev[v] = u;
        heap.push(nd, v);
      }
    }
  }
  return settled;
}

/** A stop the streets reach from a point: the router's StopAccess (the stop, the seconds to it) and how the rider gets there. */
export type ReachedStop = StopAccess & { mode: StreetMode };

/**
 * Transit stops reachable from (lat, lon) by `mode` within maxSeconds.
 * stopNode: Int32Array from the timetable (stop -> street node). Returns [{stop, walk}].
 */
export function accessStops(
  g: Streets,
  stopNode: Int32Array,
  lat: number,
  lon: number,
  mode: StreetMode,
  maxSeconds: number,
  extraPerStop = 30,
  stopLat: Float32Array | null = null,
  stopLon: Float32Array | null = null,
  stopBig: Uint8Array | null = null,
): ReachedStop[] {
  const points = nearestEdges(g, lat, lon, mode);
  if (!points.length) return [];
  const byNode = new Map<number, number[]>();
  for (let s = 0; s < stopNode.length; s++) {
    const n = stopNode[s];
    if (n >= 0) {
      if (!byNode.has(n)) byNode.set(n, []);
      byNode.get(n)!.push(s);
    }
  }
  const { kx, ky } = scaleAt(lat);
  const out: ReachedStop[] = [];
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
        const straight = Math.hypot((stopLon![s] - lon) * kx, (stopLat[s] - lat) * ky); // given with stopLat
        const at = stopBig && stopBig[s] ? 150 : 60; // a railway station is one point in the feed but a big place
        if (straight <= at) walk = Math.min(straight / 1.2, 30);
        else if (straight <= 300) walk = Math.min(walk, (straight * 1.3) / 1.2 + extraPerStop);
      }
      out.push({ stop: s, walk: Math.round(walk), mode });
    }
  });
  return out;
}

/** A way along the streets: how long, how far, and the path from the first point to the last ([lat, lon] each). */
export type StreetRoute = { seconds: number; metres: number; path: [number, number][] };

/**
 * Point-to-point route by mode: { seconds, metres, path: [[lat, lon], ...] } or null. Both ends snap to the
 * streets nearby (not the nearest intersection), so the path starts and ends in front of the two points.
 */
export function route(
  g: Streets,
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  mode: StreetMode,
  maxSeconds = 7200,
): StreetRoute | null {
  const A = nearestEdges(g, fromLat, fromLon, mode),
    B = nearestEdges(g, toLat, toLon, mode);
  if (!A.length || !B.length) return null;
  const starts = joins(g, A, mode, true),
    ends = joins(g, B, mode, false);
  let best = Infinity,
    last = -1,
    pa: StreetPoint | null = null,
    pb: StreetPoint | null = null;
  // both points on the same segment: along it, where the street is open that way
  for (const a of A)
    for (const b of B) {
      if (!((a.u === b.u && a.v === b.v) || (a.u === b.v && a.v === b.u))) continue;
      const fb = a.u === b.u ? b.f : 1 - b.f;
      const sec = edgeSeconds(g, fb >= a.f ? a.e : edgeBetween(g, a.v, a.u), mode);
      const s =
        (A[0].metres + (a.metres - A[0].metres) * OFF_STREET + B[0].metres + (b.metres - B[0].metres) * OFF_STREET) /
          1.2 +
        Math.abs(fb - a.f) * sec;
      if (sec >= 0 && s < best) {
        best = s;
        pa = a;
        pb = b;
      }
    }
  const prev = new Int32Array(g.M).fill(-1);
  reach(
    g,
    asSeeds(starts),
    mode,
    maxSeconds,
    (u, d) => {
      if (d >= best) return false;
      const x = ends.get(u);
      if (x && d + x.s < best) {
        best = d + x.s;
        last = u;
        pb = B[x.i];
      }
    },
    prev,
  );
  if (best === Infinity) return null;
  const chain: number[] = [];
  if (last >= 0) {
    for (let u = last; u !== -1; u = prev[u]) chain.push(u);
    chain.reverse();
    pa = A[starts.get(chain[0])!.i];
  }
  const start = pa!, // both are set: by the same-segment pass, or by the search (the end in its callback, the start
    end = pb!; // from the chain's first node)
  const path: [number, number][] = [[start.lat, start.lon]];
  let metres = start.metres + end.metres,
    at = path[0];
  for (let i = 0; i < chain.length; i++) {
    const u = chain[i];
    metres += i ? segLen(g, chain[i - 1], u) : haversine(at[0], at[1], g.nodeLat[u], g.nodeLon[u]);
    path.push([g.nodeLat[u], g.nodeLon[u]]);
  }
  at = path[path.length - 1];
  metres += haversine(at[0], at[1], end.lat, end.lon);
  path.push([end.lat, end.lon]);
  return { seconds: Math.round(best), metres: Math.round(metres), path };
}

function segLen(g: Streets, u: number, v: number): number {
  for (let e = g.edgeOff[u]; e < g.edgeOff[u + 1]; e++) if (g.edgeTo[e] === v) return g.edgeLen[e];
  return haversine(g.nodeLat[u], g.nodeLon[u], g.nodeLat[v], g.nodeLon[v]);
}
