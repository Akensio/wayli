// Distances on the ground, in metres: one place for both ways the app measures them.
//   haversine  the great circle: places, the street graph, distances shown to the rider
//   metres     a flat approximation, faster, as good under a few kilometres: where vehicles are along their trips (the
//              pipeline's bustimes.py and railtimes.py use the same, so the learned times answer the app's question)
// and, on the same flat approximation, where a point falls on a segment and along a sequence of stops.

/** A point on the ground, as the whole app passes one around. */
export type LatLon = { lat: number; lon: number };
/** A point of a drawn path, as the courses, the streets and the map keep them: [lat, lon] in degrees. */
export type PathPoint = [lat: number, lon: number];

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000,
    p1 = (lat1 * Math.PI) / 180,
    p2 = (lat2 * Math.PI) / 180;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lon2 - lon1) * Math.PI) / 360) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export function metres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const kx = 111320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180),
    ky = 110540;
  const dx = (lon2 - lon1) * kx,
    dy = (lat2 - lat1) * ky;
  return Math.sqrt(dx * dx + dy * dy);
}
/** The flat approximation's scale near a latitude: metres per degree of longitude (kx) and of latitude (ky). */
export const scaleAt = (lat: number): { kx: number; ky: number } => ({
  kx: 111320 * Math.cos((lat * Math.PI) / 180),
  ky: 110540,
});
/** The point of a segment nearest to the origin, the segment starting at (ax, ay) and running (dx, dy), in metres:
 *  how far along it (f, 0 to 1) and how far from the origin (d). */
export function nearestOnSegment(ax: number, ay: number, dx: number, dy: number): { f: number; d: number } {
  const l2 = dx * dx + dy * dy,
    f = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return { f, d: Math.hypot(ax + f * dx, ay + f * dy) };
}
/** Where a point is along a sequence of stops: the stretch (from stop `index` to the next) it is nearest to, how far
 *  along it (`frac`, 0 to 1) and how far off it (`metres`). */
export type Projection = { index: number; frac: number; metres: number };
/** Where along a sequence of stops a point is, from stop `from` on. */
export function projectOnStops(lat: number, lon: number, stops: readonly LatLon[], from = 0): Projection {
  const { kx, ky } = scaleAt(lat);
  let best: Projection = { index: from, frac: 0, metres: Infinity };
  for (let i = from; i < stops.length - 1; i++) {
    const ax = (stops[i].lon - lon) * kx,
      ay = (stops[i].lat - lat) * ky;
    const p = nearestOnSegment(ax, ay, (stops[i + 1].lon - stops[i].lon) * kx, (stops[i + 1].lat - stops[i].lat) * ky);
    if (p.d < best.metres) best = { index: i, frac: p.f, metres: p.d };
  }
  return best;
}
