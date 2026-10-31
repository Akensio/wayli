// Where rides and walks run on the map: a ride's course between two of its stops (the feed's shape, or the track for a
// train), a walk along the streets.
import { route, type StreetMode } from '../engine/streets.ts';
import type { LatLon as Point } from '../engine/geo.ts';
import type { LatLon } from '../journey/types';
import { sh, st, tt } from './data.ts';
import { sName } from './names.ts';
import type { OpsPart } from './ops.ts';

/** Does this pattern have a course: a feed shape (loaded) or a track from the rail pairs? */
export const hasCourse = (p: number): boolean =>
  !!tt!.patShape && (tt!.patShape[p] === -2 ? !!tt!.railPairOff : tt!.patShape[p] >= 0 && !!sh);
/** The course of a ride between two stops of a pattern, along the road or the track; null without one. */
export function ridePath(p: number, bp: number, ap: number): LatLon[] | null {
  if (!tt!.patShape) return null;
  const at = (i: number): number => tt!.patStopsOff[p] + i;
  if (tt!.patShape[p] === -2) {
    // a train: the track, one stored piece per pair of consecutive stations
    if (!tt!.railPairOff) return null;
    const path: LatLon[] = [];
    for (let i = bp; i < ap; i++) {
      const k = tt!.patShapeSeg![at(i)],
        o = tt!.railPairOff[k],
        e = tt!.railPairOff[k + 1];
      for (let j = o + (i > bp ? 1 : 0); j < e; j++) path.push([tt!.railLat![j] / 1e5, tt!.railLon![j] / 1e5]);
    }
    return path.length >= 2 ? path : null;
  }
  if (!sh || tt!.patShape[p] < 0) return null;
  const si = sh.index.get(tt!.patShape[p]);
  if (si == null) return null;
  const off = sh.shapeOff[si],
    n = sh.shapeOff[si + 1] - off;
  const seg0 = tt!.patShapeSeg![at(bp)],
    f0 = tt!.patShapeFrac![at(bp)] / 65535,
    seg1 = tt!.patShapeSeg![at(ap)],
    f1 = tt!.patShapeFrac![at(ap)] / 65535;
  if (seg1 < seg0 || seg1 + 1 >= n) return null;
  const pt = (i: number): LatLon => [sh!.ptLat[off + i] / 1e5, sh!.ptLon[off + i] / 1e5];
  const lerp = (seg: number, f: number): LatLon => {
    const a = pt(seg),
      b = pt(seg + 1);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const path = [lerp(seg0, f0)];
  for (let i = seg0 + 1; i <= seg1; i++) path.push(pt(i));
  path.push(lerp(seg1, f1));
  return path;
}
/** The way along the streets from a to b ([lat, lon] each), both ends included, or null without the street graph. */
export function streetPath(a: LatLon, b: LatLon, mode: StreetMode | undefined): LatLon[] | null {
  if (!st) return null;
  const r = route(st, a[0], a[1], b[0], b[1], mode === 'bike' ? 'bike' : 'walk', 3600);
  return r && r.path.length ? [a, ...r.path, b] : null;
}
/** The way from a point to a stop along the streets, or the two joined straight; reversed for the way back from it. */
export function pathTo(point: Point | null, stop: number, mode: StreetMode | undefined, reverse?: boolean): LatLon[] {
  if (!point) return [];
  const a: LatLon = [point.lat, point.lon],
    b: LatLon = [tt!.stopLat[stop], tt!.stopLon[stop]];
  const path = streetPath(a, b, mode) || [a, b];
  return reverse ? path.reverse() : path;
}

export const coursesOps = {
  /** Street paths for walks drawn straight because the street graph was not there yet: null where there is none. */
  streetPaths({ legs }) {
    return legs.map((l) => streetPath(l.from, l.to, l.mode));
  },
  /** Courses for ride legs planned before the shapes were loaded: null where there is none. */
  ridePaths({ legs }) {
    return legs.map((l) => ridePath(l.pattern, l.boardPos, l.alightPos));
  },
  /** Rides as the map draws them: each one's course from where it is boarded to where it is left, and its stops.
   *  `course` says the path follows the road or the track; without one (the courses not loaded yet, or a pattern
   *  whose trips name no shape) the path joins the stops straight, and the map must not draw it as a route. */
  rideCourses({ legs }) {
    return legs.map((l) => {
      const o = tt!.patStopsOff[l.pattern],
        stops: { lat: number; lon: number; stop: number }[] = [];
      for (let i = l.boardPos; i <= l.alightPos; i++) {
        const st = tt!.patStops[o + i];
        stops.push({ lat: tt!.stopLat[st], lon: tt!.stopLon[st], stop: st });
      }
      const path = ridePath(l.pattern, l.boardPos, l.alightPos);
      return { path: path || stops.map((x): LatLon => [x.lat, x.lon]), course: !!path, stops };
    });
  },
  /** The whole course of each pattern and all its stops, for drawing a line around a ride or through a stop; `course`
   *  as in rideCourses. */
  patternCourse({ patterns }) {
    return patterns.map((p) => {
      const ns = tt!.patStopsOff[p + 1] - tt!.patStopsOff[p];
      const stops: [number, number, string, number][] = [];
      for (let i = 0; i < ns; i++) {
        const st = tt!.patStops[tt!.patStopsOff[p] + i];
        stops.push([tt!.stopLat[st], tt!.stopLon[st], sName(st), st]);
      }
      const path = ns >= 2 ? ridePath(p, 0, ns - 1) : null;
      return { path: path || stops.map((x): LatLon => [x[0], x[1]]), course: !!path, stops };
    });
  },
} satisfies OpsPart<'streetPaths' | 'ridePaths' | 'rideCourses' | 'patternCourse'>;
