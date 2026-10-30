// How the roads run now, from the buses on them: each bus is followed across the snapshots read (the last 15
// minutes); between two of its positions at least 90 s apart it covered part of its trip, and the time that took
// against the part's usual time (delays.js usualRun: learned by hour, else the timetable's) says how that stretch runs
// now. Every section it covered gets that ratio. delays.js applies them to the sections ahead of other buses
// (roadFactor), and the map colours the sections by them (trafficIn).
import { secondsOn } from '../engine/clock.js';
import { hasBusTimes, setRoadsNow, usualRun, freeRun, median } from '../engine/delays.js';
import { metres, scaleAt, nearestOnSegment, projectOnStops } from '../engine/geo.js';
import { ridePath } from './courses.js';
import { tt, onNewDay } from './data.js';
import { tripFor, tripStopList } from './trips.js';

const TRACK_MS = 900e3,
  PAIR_MS = 90e3;
const tracks = new Map();
// ride -> { lineRef, start, pts: [[ms, lat, lon]] } oldest first
let roads = new Map();
// "code>code" -> [{ ratio, t, ride, p, k }]
// A pattern's course cut at its stops, for placing a bus on it: per section the points, the length along them and a
// box around them. Placed on the straight line between two stops instead, a bus on a long highway section (stops
// kilometres apart, the road curving away from that line) was more than 120 m off it and left out: no traffic on Route
// 4 or on half of Route 1 (Gadi, 2026-10-24).
const courseSections = new Map();
// a new day numbers its patterns anew: the courses and the tracks of the old one would draw the wrong roads
onNewDay(() => {
  courseSections.clear();
  tracks.clear();
  roads = new Map();
  setRoadsNow(roads);
});
function sectionsOf(p) {
  if (courseSections.has(p)) return courseSections.get(p);
  const ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p],
    out = [];
  for (let k = 0; k < ns - 1; k++) {
    const pts = ridePath(p, k, k + 1);
    if (!pts) {
      out.length = 0;
      break;
    }
    const cum = [0];
    let s = 0,
      la0 = Infinity,
      la1 = -Infinity,
      lo0 = Infinity,
      lo1 = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (i) {
        s += metres(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
        cum.push(s);
      }
      la0 = Math.min(la0, pts[i][0]);
      la1 = Math.max(la1, pts[i][0]);
      lo0 = Math.min(lo0, pts[i][1]);
      lo1 = Math.max(lo1, pts[i][1]);
    }
    out.push({ pts, cum, len: s, box: [la0 - 0.002, la1 + 0.002, lo0 - 0.0025, lo1 + 0.0025] });
  }
  const r = out.length ? out : null;
  if (courseSections.size > 4000) courseSections.clear();
  courseSections.set(p, r);
  return r;
}
/** Where a position lies along a trip: the section and how far along it, and how far off the course (the straight
 *  lines between stops where the pattern has no course). */
function projectOnCourse(lat, lon, p, stops) {
  const secs = sectionsOf(p);
  if (!secs || secs.length !== stops.length - 1) return projectOnStops(lat, lon, stops);
  const { kx, ky } = scaleAt(lat);
  let best = { index: 0, frac: 0, metres: Infinity };
  secs.forEach((sec, k) => {
    const b = sec.box;
    if (lat < b[0] || lat > b[1] || lon < b[2] || lon > b[3]) return;
    for (let i = 0; i < sec.pts.length - 1; i++) {
      const ax = (sec.pts[i][1] - lon) * kx,
        ay = (sec.pts[i][0] - lat) * ky;
      const { f, d } = nearestOnSegment(
        ax,
        ay,
        (sec.pts[i + 1][1] - sec.pts[i][1]) * kx,
        (sec.pts[i + 1][0] - sec.pts[i][0]) * ky,
      );
      if (d < best.metres)
        best = {
          index: k,
          frac: sec.len > 0 ? (sec.cum[i] + f * (sec.cum[i + 1] - sec.cum[i])) / sec.len : 0,
          metres: d,
        };
    }
  });
  return best.metres === Infinity ? projectOnStops(lat, lon, stops) : best;
}
export function noteRoads(vehicles) {
  if (!tt || !hasBusTimes()) return; // without the learned times there is nothing to compare with
  let newest = 0;
  for (const v of vehicles) {
    if (v.operator === 2 || v.atStop) continue;
    const t = v.recordedAt.getTime();
    if (t > newest) newest = t;
    let tr = tracks.get(v.rideId);
    if (!tr) tracks.set(v.rideId, (tr = { lineRef: v.lineRef, start: v.scheduledStart, pts: [] }));
    if (tr.pts.some((x) => x[0] === t)) continue;
    tr.pts.push([t, v.lat, v.lon]);
    tr.pts.sort((a, b) => a[0] - b[0]);
  }
  for (const [k, tr] of tracks) {
    tr.pts = tr.pts.filter((x) => x[0] > newest - TRACK_MS);
    if (!tr.pts.length) tracks.delete(k);
  }
  const day = tt.header.date,
    out = new Map();
  for (const [ride, tr] of tracks) {
    if (tr.pts.length < 2) continue;
    const trip = tripFor(tr.lineRef, secondsOn(tr.start, day));
    if (trip < 0) continue;
    const { p, stops } = tripStopList(trip);
    let a = null;
    for (const pt of tr.pts) {
      const pr = projectOnCourse(pt[1], pt[2], p, stops);
      if (pr.metres > 120) continue;
      const at = { t: pt[0], x: pr.index + pr.frac };
      if (!a) {
        a = at;
        continue;
      }
      if (at.t - a.t < PAIR_MS) continue;
      if (at.x > a.x + 0.05 && at.x - a.x < 15) {
        // the usual time of the stretch covered: the parts of each section between the two positions
        const from = secondsOn(new Date(a.t), day);
        let usual = 0;
        for (let k = Math.floor(a.x); k < Math.min(stops.length - 1, Math.ceil(at.x)); k++)
          usual += (Math.min(at.x, k + 1) - Math.max(a.x, k)) * usualRun(stops, k, from, day);
        if (usual >= 30 && a.x >= 0.05) {
          // a bus still at its first stop is waiting for its time, not in traffic
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
  roads = out;
  setRoadsNow(out);
}
/**
 * Traffic in a box, from the buses: each section that at least two buses ran in the last 15 minutes, drawn along its
 * course, with how its time now (the median of their ratios to its usual time, times that) compares with its best in
 * the day's hours (delays.js freeRun): level 0 free (up to 1.5 times), 1 slow (to 2.2), 2 jammed (to 3.2), 3 stuck. On a
 * Thursday in Tel Aviv (2026-10-22) that made 10:00 mostly free and 17:00 a mix with jams where they were.
 */
function trafficIn(box) {
  if (!tt || !roads.size) return { type: 'FeatureCollection', features: [] };
  const day = tt.header.date,
    features = [];
  let newest = 0;
  for (const v of roads.values()) for (const x of v) if (x.t > newest) newest = x.t;
  const inBox = (s) =>
    tt.stopLat[s] >= box.south && tt.stopLat[s] <= box.north && tt.stopLon[s] >= box.west && tt.stopLon[s] <= box.east;
  const nowSec = secondsOn(new Date(newest), day);
  for (const [key, v] of roads) {
    const recent = v.filter((x) => x.t > newest - TRACK_MS);
    const { p, k } = recent.length ? recent[recent.length - 1] : { p: -1, k: 0 };
    if (p < 0) continue;
    const at = tt.patStopsOff[p] + k,
      s1 = tt.patStops[at],
      s2 = tt.patStops[at + 1];
    // two buses in town; on a long section (a highway between interchanges, where each line has its own pair of stops
    // and two rarely share one in a quarter of an hour) one bus seen along it at least three times will do
    const rides = new Set(recent.map((x) => x.ride)).size;
    const long = metres(tt.stopLat[s1], tt.stopLon[s1], tt.stopLat[s2], tt.stopLon[s2]) >= 2000;
    if (rides < 2 && !(long && recent.length >= 2)) continue;
    if (!inBox(s1) && !inBox(s2)) continue;
    const [c1, c2] = key.split('>'),
      free = freeRun(c1, c2, day);
    if (!free) continue;
    const rs = recent.map((x) => x.ratio),
      m = median(rs);
    const stops = [
      { code: c1, arr: 0, dep: 0 },
      { code: c2, arr: 0, dep: 0 },
    ];
    const now = m * usualRun(stops, 0, nowSec, day),
      x = now / free;
    if (!now) continue;
    const level = x <= 1.5 ? 0 : x <= 2.2 ? 1 : x <= 3.2 ? 2 : 3;
    const path = ridePath(p, k, k + 1) || [
      [tt.stopLat[s1], tt.stopLon[s1]],
      [tt.stopLat[s2], tt.stopLon[s2]],
    ];
    features.push({
      type: 'Feature',
      properties: { level, x: Math.round(x * 100) / 100, n: rs.length },
      geometry: { type: 'LineString', coordinates: path.map(([la, lo]) => [lo, la]) },
    });
  }
  return { type: 'FeatureCollection', features };
}

export const trafficOps = {
  /** Traffic from the buses in a box {south, west, north, east} as GeoJSON (trafficIn). */
  traffic({ box }) {
    return trafficIn(box);
  },
};
