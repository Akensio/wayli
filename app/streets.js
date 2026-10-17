// Wayli: compact street graph for the first and last mile, on foot or by bike.
// Loads the container from pipeline/streets.py; bounded Dijkstra from a point
// to every transit stop nearby, and point-to-point routes for bike-only trips.

const TYPES = { int32: Int32Array, uint16: Uint16Array, uint8: Uint8Array, float32: Float32Array };

export function parseStreets(ab) {
  const headerLen = new DataView(ab).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, headerLen)));
  const base = 4 + headerLen;
  const g = { header, M: header.counts.nodes, cell: header.cell_deg };
  for (const s of header.sections) g[s.name] = new TYPES[s.dtype](ab, base + s.offset, s.length);
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
  g.cellIndex = new Map();
  for (let i = 0; i < g.cellKey.length; i++) g.cellIndex.set(g.cellKey[i], i);
  return g;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((lon2 - lon1) * Math.PI / 360) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Nearest node usable by `mode` ('walk' | 'bike') within `radius` metres, or -1. */
export function nearestNode(g, lat, lon, mode = 'walk', radius = 300) {
  const c = g.cell, cy = Math.floor(lat / c), cx = Math.floor(lon / c);
  const flag = mode === 'bike' ? g.bikeFlag : g.walkFlag;
  let best = -1, bestD = radius;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const ci = g.cellIndex.get((cy + dy) * 100000 + (cx + dx));
    if (ci === undefined) continue;
    for (let n = g.cellStart[ci]; n < g.cellEnd[ci]; n++) {
      const d = haversine(lat, lon, g.nodeLat[n], g.nodeLon[n]);
      if (d >= bestD) continue;
      let ok = false;
      for (let e = g.edgeOff[n]; e < g.edgeOff[n + 1]; e++) if ((g.edgeFlags[e] >> g.flagShift) & flag) { ok = true; break; }
      if (ok) { best = n; bestD = d; }
    }
  }
  return { node: best, metres: bestD };
}

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
 * Dijkstra from `node` by `mode` up to `maxSeconds`. Calls onNode(node, seconds)
 * for every settled node; returns the settled count. `prev` (optional Int32Array)
 * records the tree for path extraction.
 */
export function reach(g, node, mode, maxSeconds, onNode, prev) {
  const bike = mode === 'bike';
  const flag = bike ? g.bikeFlag : g.walkFlag;
  const speed = bike ? g.bikeSpeed : g.walkSpeed;
  const dist = new Map([[node, 0]]);
  const heap = new Heap();
  heap.push(0, node);
  let settled = 0;
  while (heap.n) {
    const { key: d, val: u } = heap.pop();
    if (d > dist.get(u)) continue;
    settled++;
    if (onNode && onNode(u, d) === false) break;
    for (let e = g.edgeOff[u]; e < g.edgeOff[u + 1]; e++) {
      const f = g.edgeFlags[e];
      if (!((f >> g.flagShift) & flag)) continue;
      const nd = d + g.edgeLen[e] / speed[f & g.kindMask];
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
export function accessStops(g, stopNode, lat, lon, mode, maxSeconds, extraPerStop = 30) {
  const { node, metres } = nearestNode(g, lat, lon, mode);
  if (node < 0) return [];
  const byNode = new Map();
  for (let s = 0; s < stopNode.length; s++) {
    const n = stopNode[s];
    if (n >= 0) { if (!byNode.has(n)) byNode.set(n, []); byNode.get(n).push(s); }
  }
  const speed = mode === 'bike' ? 4.0 : 1.2;
  const start = metres / 1.2;  // the first metres to the network are always on foot
  const out = [];
  reach(g, node, mode, maxSeconds - start, (u, d) => {
    const stops = byNode.get(u);
    if (stops) for (const s of stops) out.push({ stop: s, walk: Math.round(start + d + extraPerStop), mode });
  });
  return out;
}

/** Point-to-point route by mode: { seconds, metres, path: [[lat, lon], ...] } or null. */
export function route(g, fromLat, fromLon, toLat, toLon, mode, maxSeconds = 7200) {
  const a = nearestNode(g, fromLat, fromLon, mode), b = nearestNode(g, toLat, toLon, mode);
  if (a.node < 0 || b.node < 0) return null;
  const prev = new Int32Array(g.M).fill(-1);
  let found = -1;
  reach(g, a.node, mode, maxSeconds, (u, d) => { if (u === b.node) { found = d; return false; } }, prev);
  if (found < 0) return null;
  const path = [];
  let metres = 0;
  for (let u = b.node; u !== -1; u = prev[u]) {
    path.push([g.nodeLat[u], g.nodeLon[u]]);
    if (prev[u] !== -1) metres += segLen(g, prev[u], u);
    if (u === a.node) break;
  }
  path.reverse();
  const walkIn = a.metres / 1.2, walkOut = b.metres / 1.2;
  return { seconds: Math.round(found + walkIn + walkOut), metres: Math.round(metres + a.metres + b.metres), path };
}

function segLen(g, u, v) {
  for (let e = g.edgeOff[u]; e < g.edgeOff[u + 1]; e++) if (g.edgeTo[e] === v) return g.edgeLen[e];
  return haversine(g.nodeLat[u], g.nodeLon[u], g.nodeLat[v], g.nodeLon[v]);
}
