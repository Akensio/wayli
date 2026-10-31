// Lines as riders know them: routes indexed by their live id and by pattern; lines grouped from routes (a number and
// operator in an area, both directions and variants together; a train line is every train between two stations);
// and what the line search and a line's page ask: the lines matching, a line's course and stops, its times at a stop.
import { routeLabel, parseHeadsign, stationStopsOf } from '../engine/raptor.ts';
import { haversine } from '../engine/geo.ts';
import { modeOfType, type Mode } from '../engine/modes.ts';
import type { PathPoint } from '../engine/geo.ts';
import type { LineGroup } from './ops.ts';
import { hasCourse, ridePath } from './courses.ts';
import { tt, onNewDay, onNewLang } from './data.ts';
import { cName, headsign, lineLabel, liveId, ssName, stopOut } from './names.ts';
import type { LineTime, OpsPart, RouteLabel, StopOut } from './ops.ts';

/** A line as the index holds it (indexLines): its `key` (what its routes share), its mode and label, its routes
 *  (indices into the timetable's), the day's trips over them, `names` (a train line's two stations, lower-cased, in
 *  the feed's spelling and the rider's language) and `text`, where it runs as words to match (placeText, on demand). */
type LineIdx = {
  key: string;
  mode: Mode;
  label: string;
  routes: number[];
  trips: number;
  names: string[];
  text?: string;
};
/** The lines of the day and, per route, which line it is in (an index into `groups`). */
type LineIndex = { groups: LineIdx[]; byRoute: Map<number, number> };
/** A direction of a line (lineDirs): the route standing for it, where it heads, the day's trips that way. */
type LineDir = { route: number; headsign: string; trips: number };

/** Route by its GTFS route id (the live data's line ref), and the patterns of each route. */
export let routeById: Map<string, number> | null = null,
  routePats: Map<number, number[]> | null = null;
onNewDay(() => {
  routeById = routePats = lineIdx = null;
});
onNewLang(() => {
  lineIdx = null;
}); // its lines carry their places' names
export function indexRoutes(): void {
  routeById = new Map();
  routePats = new Map();
  tt!.routes.forEach((r, i) => {
    if (r[4] != null) routeById!.set(String(r[4]), i);
  });
  for (let p = 0; p < tt!.patRoute.length; p++) {
    const r = tt!.patRoute[p];
    if (!routePats.has(r)) routePats.set(r, []);
    routePats.get(r)!.push(p);
  }
}
// ---- lines as riders know them: a number and operator in an area, both directions and their variants together
let lineIdx: LineIndex | null = null;
/** The two ends of a route as the feed names them ('origin-city<->destination-city-1#' to ['origin-city', 'destination-city']). */
function routeEnds(longName: string): string[] | null {
  const parts = String(longName || '').split('<->');
  return parts.length === 2 ? parts.map((x) => x.replace(/-\d+[#א-ת]*$/, '').trim()) : null;
}
const endCity = (e: string): string => {
  const i = e.lastIndexOf('-');
  return i > 0 ? e.slice(i + 1).trim() : e;
};
/** The pattern of a route with the most trips: what its line page and search rows describe. */
function mainPat(ri: number): number {
  let best = -1,
    most = -1;
  for (const p of routePats!.get(ri) || []) {
    const n = tt!.patTripsOff[p + 1] - tt!.patTripsOff[p];
    if (n > most) {
      most = n;
      best = p;
    }
  }
  return best;
}
/** The routes that make one line with `ri`: itself, or for a train every train between the same two stations. */
function lineSiblings(ri: number): number[] {
  if (!lineIdx) indexLines();
  const gi = lineIdx!.byRoute.get(ri),
    g = gi != null ? lineIdx!.groups[gi] : undefined; // a route with no trips today is in no line
  return g && g.mode === 'rail' ? g.routes.filter((x) => tt!.routes[x][1] === tt!.routes[ri][1]) : [ri];
}
const tripsOf = (ri: number): number => {
  let n = 0;
  for (const p of routePats!.get(ri) || []) n += tt!.patTripsOff[p + 1] - tt!.patTripsOff[p];
  return n;
};
/** A pattern's first and last stop by name (a train's stations). */
function endNames(p: number): [string, string] | null {
  if (p < 0) return null;
  return [ssName(tt!.patStops[tt!.patStopsOff[p]]), ssName(tt!.patStops[tt!.patStopsOff[p + 1] - 1])];
}
function indexLines(): void {
  if (!routePats) indexRoutes();
  const groups = new Map<string, LineIdx>();
  tt!.routes.forEach((r, i) => {
    if (!(routePats!.get(i) || []).length) return;
    const mode = modeOfType(r[3]),
      ends = routeEnds(r[1]);
    // a train line is its two stations (each train is a route of its own, with its train number). Any other line is its code in the feed (the "makat" its
    // directions and variants share), or, in a timetable built before it was kept, its number and operator where it runs.
    let key = `${mode}|${routeLabel(r)}|${r[2]}|${ends ? ends.map(endCity).sort().join('|') : ''}`;
    if (mode === 'rail') key = `rail|${ends ? ends.slice().sort().join('|') : r[1]}`;
    else if (r[5]) key = `${mode}|${r[2]}|${r[5]}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, mode, label: lineLabel(r), routes: [], trips: 0, names: [] }));
    g.routes.push(i);
    g.trips += tripsOf(i);
    if (mode === 'rail' && ends)
      for (const e of ends) {
        const x = e.toLowerCase();
        if (!g.names.includes(x)) g.names.push(x);
      }
  });
  lineIdx = { groups: Array.from(groups.values()), byRoute: new Map() };
  lineIdx.groups.forEach((g, n) => {
    for (const ri of g.routes) lineIdx!.byRoute.set(ri, n);
  });
  // a train line is also found by its stations' names in the rider's language
  lineIdx.groups.forEach((g) => {
    if (g.mode === 'rail')
      for (const x of endNames(mainPat(g.routes[0])) || [])
        if (x && !g.names.includes(x.toLowerCase())) g.names.push(x.toLowerCase());
  });
}
/** Hebrew written with or without the extra yod and vav (קריית / קרית, תיכון / תכון) reads as one. */
const spell = (s: string): string =>
  s
    .replace(/יי/g, 'י')
    .replace(/וו/g, 'ו')
    .replace(/['"״׳`]/g, '');
/** Where a line runs, as text to match words against: its cities and every direction's destination, in the rider's
 *  language and in Hebrew (the feed's own). */
function placeText(g: LineIdx): string {
  if (g.text == null) {
    const parts: string[] = [];
    for (const d of lineDirs(g)) {
      parts.push(d.headsign, parseHeadsign(tt!.routes[d.route][1]));
      const p = mainPat(d.route);
      if (p >= 0)
        for (const k of [tt!.patStopsOff[p], tt!.patStopsOff[p + 1] - 1])
          parts.push(cName(tt!.stops[tt!.patStops[k]][3]));
    }
    for (const ri of g.routes) {
      const e = routeEnds(tt!.routes[ri][1]);
      if (e) parts.push(...e);
    }
    g.text = spell(parts.join(' ').toLowerCase());
  }
  return g.text;
}
/** A line's directions, the busiest first: one per destination, standing for the variants that share it. */
function lineDirs(g: LineIdx): LineDir[] {
  const dirs = new Map<string, { route: number; most: number; trips: number }>();
  for (const ri of g.routes) {
    const k = parseHeadsign(tt!.routes[ri][1]),
      n = tripsOf(ri);
    let d = dirs.get(k);
    if (!d) dirs.set(k, (d = { route: ri, most: -1, trips: 0 }));
    d.trips += n;
    if (n > d.most) {
      d.most = n;
      d.route = ri;
    }
  }
  return [...dirs.values()]
    .sort((a, b) => b.trips - a.trips)
    .map((d) => ({ route: d.route, headsign: headsign(d.route), trips: d.trips }));
}
/** A line for the search list: its label, where it runs (a train's stations, another line's cities), its directions. */
function groupOut(n: number, dist: number): LineGroup {
  const g = lineIdx!.groups[n],
    dirs = lineDirs(g),
    r = tt!.routes[dirs[0].route],
    p = mainPat(dirs[0].route);
  let area: string[] = [];
  if (g.mode === 'rail') area = endNames(p) || [];
  else if (p >= 0) {
    const a = cName(tt!.stops[tt!.patStops[tt!.patStopsOff[p]]][3]),
      b = cName(tt!.stops[tt!.patStops[tt!.patStopsOff[p + 1] - 1]][3]);
    area = a === b ? [a] : [a, b];
  }
  return {
    key: g.key,
    mode: g.mode,
    line: g.label,
    agency: r[2],
    routeType: r[3],
    estimated: !!r[6],
    trips: g.trips,
    area: area.filter(Boolean),
    dirs: dirs.slice(0, 4),
    dist: Number.isFinite(dist) ? Math.round(dist) : null,
  };
}
/** The lines with a stop within `radius` m of a point, each with the distance to its nearest such stop. */
function linesNear(lat: number, lon: number, radius: number): Map<number, number> {
  if (!lineIdx) indexLines();
  const out = new Map<number, number>();
  const dlat = radius / 110500,
    dlon = radius / (111300 * Math.cos((lat * Math.PI) / 180));
  for (let s = 0; s < tt!.stops.length; s++) {
    if (Math.abs(tt!.stopLat[s] - lat) > dlat || Math.abs(tt!.stopLon[s] - lon) > dlon) continue;
    const d = haversine(lat, lon, tt!.stopLat[s], tt!.stopLon[s]);
    if (d > radius) continue;
    for (let i = tt!.stopPatsOff[s]; i < tt!.stopPatsOff[s + 1]; i++) {
      const n = lineIdx!.byRoute.get(tt!.patRoute[tt!.stopPats[2 * i]]);
      if (n != null && !((out.get(n) ?? Infinity) <= d)) out.set(n, d);
    }
  }
  return out;
}

export const linesOps = {
  /** Line labels for SIRI line refs (GTFS route ids) of the loaded day. */
  routeLabels({ ids }) {
    if (!routeById) indexRoutes();
    const out: Record<string, RouteLabel> = {};
    const other = tt!.header.otherRoutes || {};
    for (const id of ids) {
      const ri = routeById!.get(String(id));
      if (ri != null) {
        const r = tt!.routes[ri];
        out[id] = { line: routeLabel(r), type: r[3], agency: r[2], headsign: headsign(ri), route: ri };
        continue;
      }
      // a line of the feed with no trips today: named, with no page to open
      const o = other[String(id)];
      if (o) out[id] = { line: o[0], type: o[2], agency: o[1], headsign: o[3], route: null, offDay: true };
    }
    return out;
  },
  /**
   * Lines as riders know them, for the line search: one entry per line with its directions, the nearest first when
   * the rider's position is known. `mode` narrows to buses, trains, light rail or cable lines; an empty query lists
   * the lines near the rider (every line, for the modes with few).
   */
  lineGroups({ q = '', mode = 'all', near = null, limit = 30 }) {
    if (!lineIdx) indexLines();
    const n = String(q || '')
      .trim()
      .toLowerCase()
      .replace(/^(קו|line)\s*/, '');
    const wanted = (g: LineIdx): boolean =>
      mode === 'all' || g.mode === mode || (mode === 'bus' && (g.mode === 'flex' || g.mode === 'taxi'));
    const dist = near ? linesNear(near.lat, near.lon, 800) : new Map<number, number>();
    const rows: { i: number; score: number; dist: number }[] = [];
    // a number (with any letters: "4א", "L1") is the line's; other words name where it runs ("274 תל אביב", "קרית אונו")
    const toks = n.split(/\s+/).filter(Boolean),
      numTok = toks.find((x) => /\d/.test(x)) || null;
    const words = toks.filter((x) => x !== numTok && x.length > 1);
    const placeOk = (g: LineIdx): boolean => words.every((w) => placeText(g).includes(spell(w)));
    lineIdx!.groups.forEach((g, i) => {
      if (!wanted(g)) return;
      let score = 0;
      if (!n) score = dist.has(i) || mode === 'rail' || mode === 'lrt' || mode === 'cable' ? 1 : 0;
      else if (g.mode === 'rail')
        score = 'train'.startsWith(n) || 'רכבת'.startsWith(n) || g.names.some((x) => x.includes(n)) ? 2 : 0;
      else {
        const label = g.label.toLowerCase();
        if (numTok) {
          let byNumber = 0;
          if (label === numTok) byNumber = 3;
          else if (label.startsWith(numTok)) byNumber = 1;
          score = placeOk(g) ? byNumber : 0;
        } else {
          score = label === n ? 3 : 0;
          if (!score && g.mode === 'lrt' && n.length > 1 && ('light rail'.startsWith(n) || 'רכבת קלה'.startsWith(n)))
            score = 1.5; // after the trains for "רכבת"
          if (!score && words.length && placeOk(g)) score = 0.5; // only places: the lines running there
        }
      }
      if (score) rows.push({ i, score, dist: dist.has(i) ? dist.get(i)! : Infinity });
    });
    const num = (x: string): number => {
      const m = /^\d+/.exec(x);
      return m ? +m[0] : 1e9;
    };
    // a line within a short walk comes first among equal matches: line 1 here, not line 1 in another city
    rows.sort(
      (a, b) =>
        b.score - a.score ||
        Math.min(a.dist, 1e6) - Math.min(b.dist, 1e6) ||
        num(lineIdx!.groups[a.i].label) - num(lineIdx!.groups[b.i].label) ||
        lineIdx!.groups[b.i].trips - lineIdx!.groups[a.i].trips,
    );
    return rows.slice(0, limit).map((r) => groupOut(r.i, r.dist));
  },
  /**
   * A line's trips through a stop all day, by when each leaves it. `from` is a stop (a station's platforms all count,
   * since a train may call at another); a train line is every train between the same two stations, as on its page.
   */
  lineTimes({ route, from }) {
    if (!routePats) indexRoutes();
    const fromSet = new Set(from.flatMap((s) => stationStopsOf(tt!, s))),
      out: LineTime[] = [];
    for (const ri of lineSiblings(route)) {
      const r = tt!.routes[ri];
      for (const p of routePats!.get(ri) || []) {
        const o = tt!.patStopsOff[p],
          ns = tt!.patStopsOff[p + 1] - o;
        let i = -1;
        for (let k = 0; k < ns - 1 && i < 0; k++) if (fromSet.has(tt!.patStops[o + k])) i = k;
        if (i < 0) continue;
        const base = tt!.tripTimesOff[p];
        for (let t = tt!.patTripsOff[p]; t < tt!.patTripsOff[p + 1]; t++) {
          const row = base + (t - tt!.patTripsOff[p]) * ns;
          out.push({
            trip: t,
            dep: tt!.dep[row + i],
            arr: null,
            routeId: liveId(r),
            firstDep: tt!.dep[row],
            estimated: !!r[6],
          });
        }
      }
    }
    out.sort((a, b) => a.dep - b.dep);
    return out;
  },
  /** One direction of a line: its main pattern's stops and course, today's trips, and its other directions. A train
   *  line is every train between the same two stations, each of which the feed lists as a route of its own. */
  lineInfo({ route }) {
    const r = tt!.routes[route];
    if (!lineIdx) indexLines();
    const gi = lineIdx!.byRoute.get(route),
      g = gi != null ? lineIdx!.groups[gi] : undefined; // a route with no trips today is in no line
    const sibs = lineSiblings(route);
    const pats = sibs.flatMap((ri) => routePats!.get(ri) || []);
    let best = -1,
      bestTrips = -1,
      trips = 0,
      first = Infinity,
      last = -Infinity;
    for (const p of pats) {
      const n = tt!.patTripsOff[p + 1] - tt!.patTripsOff[p];
      trips += n;
      if (n > bestTrips) {
        bestTrips = n;
        best = p;
      }
      const ns = tt!.patStopsOff[p + 1] - tt!.patStopsOff[p];
      for (let t = tt!.patTripsOff[p]; t < tt!.patTripsOff[p + 1]; t++) {
        const d = tt!.dep[tt!.tripTimesOff[p] + (t - tt!.patTripsOff[p]) * ns];
        if (d < first) first = d;
        if (d > last) last = d;
      }
    }
    const stops: StopOut[] = [];
    if (best >= 0)
      for (let i = tt!.patStopsOff[best]; i < tt!.patStopsOff[best + 1]; i++) stops.push(stopOut(tt!.patStops[i]));
    const ns = stops.length;
    // the main pattern's course, or its stops joined straight before the courses are loaded (pathKind says which;
    // the map asks for the course again once they are, by the pattern)
    const path = best >= 0 && ns >= 2 ? ridePath(best, 0, ns - 1) || stops.map((s): PathPoint => [s.lat, s.lon]) : [];
    // the other directions of the same line (same number and operator in the same area; for trains, the same two stations)
    const own = parseHeadsign(r[1]);
    const others = g
      ? lineDirs(g)
          .filter((d) => parseHeadsign(tt!.routes[d.route][1]) !== own)
          .map((d) => ({ route: d.route, headsign: d.headsign }))
      : [];
    const routeIds = sibs.map((ri) => liveId(tt!.routes[ri])).filter((x) => x != null);
    return {
      route,
      ref: r[4] != null ? String(r[4]) : null,
      routeId: liveId(r),
      routeIds,
      estimated: !!r[6],
      mode: g ? g.mode : modeOfType(r[3]),
      line: lineLabel(r),
      agency: r[2],
      routeType: r[3],
      headsign: headsign(route),
      ends: g && g.mode === 'rail' ? endNames(best) : null,
      stops,
      path,
      pathKind: best >= 0 && hasCourse(best) ? 'shape' : 'stops',
      pattern: best >= 0 ? best : null,
      trips,
      first,
      last,
      variants: pats.length,
      others: others.slice(0, 6),
    };
  },
} satisfies OpsPart<'routeLabels' | 'lineGroups' | 'lineTimes' | 'lineInfo'>;
