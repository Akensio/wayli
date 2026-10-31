// Stops and stations: which stops trains and light rail call at, light rail stops grouped into stations (the feed
// gives most a stop per direction and no parent), the station a stop belongs to, stops by the number on their sign,
// the lines at a stop; and what the stop search, a stop's page and the train timetable ask about them.
import { searchStops, routeLabel, centreOf, stationStopsOf } from '../engine/raptor.ts';
import { haversine } from '../engine/geo.ts';
import type { StopGroup } from '../state/search';
import type { Dest } from '../state/station';
import { lang, tt, onNewDay, onNewLang } from './data.ts';
import { cName, headsign, lineLabel, liveId, sName, stName, stopOut } from './names.ts';
import type { Departure, OpsPart, RecentStation } from './ops.ts';

/** A line at a stop, as the stop lists carry it: its label, its vehicle type, its operator, one of its routes. */
type LineAt = StopGroup['lines'][number];
/** The station a stop belongs to (stationOf): a key the stop search groups by ('p' + a parent station's index,
 *  'l' + a light rail station's first stop, 's' + a stop on its own), every stop of it, and its name. */
export type StopStation = { key: string; stops: number[]; name: string };
/** What a stop is for the stop search: a train station, a light rail stop, or a bus stop. */
type StopMode = 'rail' | 'lrt' | 'bus';
/** A row of the stop search before its lines are added (stopGroups): the page's StopGroup with the match's score. */
type StopRow = Omit<StopGroup, 'lines'> & { mode: StopMode; score: number };

/** Lines (route labels) serving a stop, deduplicated, with their vehicle type. */
function linesAt(stop: number, limit = 12): LineAt[] {
  const seen = new Map<string, LineAt>();
  for (let i = tt!.stopPatsOff[stop]; i < tt!.stopPatsOff[stop + 1]; i++) {
    const p = tt!.stopPats[2 * i];
    const r = tt!.routes[tt!.patRoute[p]];
    const label = lineLabel(r);
    if (!seen.has(label)) seen.set(label, { label, type: r[3], agency: r[2], route: tt!.patRoute[p] });
  }
  return Array.from(seen.values()).slice(0, limit);
}
let stopRail: Uint8Array | null = null;
/** Which stops trains call at: standing anywhere on such a station counts as being at the stop. */
export function railStops(): Uint8Array {
  if (stopRail) return stopRail;
  stopRail = new Uint8Array(tt!.stops.length);
  for (let p = 0; p < tt!.patRoute.length; p++)
    if (tt!.routes[tt!.patRoute[p]][3] === 2)
      for (let i = tt!.patStopsOff[p]; i < tt!.patStopsOff[p + 1]; i++) stopRail[tt!.patStops[i]] = 1;
  return stopRail;
}
let stopLrt: Uint8Array | null = null;
function lrtStops(): Uint8Array {
  if (stopLrt) return stopLrt;
  stopLrt = new Uint8Array(tt!.stops.length);
  for (let p = 0; p < tt!.patRoute.length; p++)
    if (tt!.routes[tt!.patRoute[p]][3] === 0)
      for (let i = tt!.patStopsOff[p]; i < tt!.patStopsOff[p + 1]; i++) stopLrt[tt!.patStops[i]] = 1;
  return stopLrt;
}
/** Light rail stops as stations: the feed gives most of them one stop per direction and no parent station, so the stops
 *  of one name in one city (within 400 m of each other) are one station here, as a parent station would make them. */
let lrtGroup: Map<number, StopStation> | null = null;
onNewDay(() => {
  stopRail = stopLrt = lrtGroup = stopByCode = null;
});
onNewLang(() => {
  lrtGroup = null;
}); // its stations carry their names
function lrtGroups(): Map<number, StopStation> {
  if (lrtGroup) return lrtGroup;
  lrtGroup = new Map();
  const lrt = lrtStops(),
    byName = new Map<string, StopStation[]>();
  for (let s = 0; s < tt!.stops.length; s++) {
    if (!lrt[s] || tt!.stopParent[s] >= 0) continue;
    const k = sName(s) + '|' + tt!.stops[s][3];
    let gs = byName.get(k);
    if (!gs) byName.set(k, (gs = []));
    let g = gs.find(
      (x) => haversine(tt!.stopLat[x.stops[0]], tt!.stopLon[x.stops[0]], tt!.stopLat[s], tt!.stopLon[s]) < 400,
    );
    if (!g) gs.push((g = { key: 'l' + s, stops: [], name: sName(s) }));
    g.stops.push(s);
    lrtGroup.set(s, g);
  }
  return lrtGroup;
}
/** The station a stop belongs to: its parent station, its light rail pair, or the stop alone. */
export function stationOf(s: number): StopStation {
  const p = tt!.stopParent[s];
  if (p >= 0) return { key: 'p' + p, stops: stationStopsOf(tt!, s), name: stName(p) || sName(s) };
  const g = lrtGroups().get(s);
  return g ? { key: g.key, stops: g.stops.slice(), name: g.name } : { key: 's' + s, stops: [s], name: sName(s) };
}
let stopByCode: Map<string, number> | null = null;
export function codeIndex(): Map<string, number> {
  if (!stopByCode) {
    stopByCode = new Map();
    for (let i = 0; i < tt!.stops.length; i++) if (tt!.stops[i][2]) stopByCode.set(String(tt!.stops[i][2]), i);
  }
  return stopByCode;
}

export const stopsOps = {
  /**
   * Stops for the stop search: by name or by the code on the sign (exact codes first), or, with nothing typed, those
   * near the rider (every station, nearest first, for trains). `mode` narrows to bus stops, train stations or light
   * rail stops; `from` (a station's platforms) to the stations its trains reach without a change. A station is one
   * entry with its platforms (`stops`).
   */
  stopGroups({ q = '', mode = 'all', near = null, limit = 30, from = null }): StopGroup[] {
    const rail = railStops(),
      lrt = lrtStops();
    // the To box of the train timetable: only the stations a train from the chosen one reaches without a change
    const reach =
      from && from.length
        ? new Set(
            stopsOps
              .stationReach({ stops: from, fromTime: 0, mode: mode === 'lrt' ? 'lrt' : 'rail' })
              .map((d) => d.key),
          )
        : null;
    const stopMode = (s: number): StopMode => {
      if (rail[s]) return 'rail';
      return lrt[s] ? 'lrt' : 'bus';
    };
    const gmode = (ss: number[]): StopMode => {
      if (ss.some((x) => rail[x])) return 'rail'; // the number on a station's sign is no rider's
      return ss.some((x) => lrt[x]) ? 'lrt' : 'bus';
    };
    const groupOf = stationOf;
    const out = new Map<string, StopRow>();
    const add = (s: number, score: number): void => {
      const g = groupOf(s),
        m = stopMode(s);
      if (mode !== 'all' && m !== mode && !g.stops.some((x) => stopMode(x) === mode)) return;
      if (reach && !reach.has(g.key)) return;
      const o = out.get(g.key);
      if (o) {
        if (score > o.score) o.score = score;
        return;
      }
      const { lat: la, lon: lo } = centreOf(tt!, g.stops);
      const gm = gmode(g.stops);
      out.set(g.key, {
        key: g.key,
        name: g.name,
        city: cName(tt!.stops[s][3]),
        code: g.stops.length === 1 && gmode(g.stops) !== 'rail' ? tt!.stops[s][2] : '',
        stops: g.stops,
        lat: la,
        lon: lo,
        mode: gm,
        score,
        dist: near ? Math.round(haversine(near.lat, near.lon, la, lo)) : null,
      });
    };
    const n = String(q || '').trim();
    if (!n) {
      for (let s = 0; s < tt!.stops.length; s++) {
        // trains and light rail: every station (nearest first); else the stops within 600 m
        if (mode === 'rail' && !rail[s]) continue;
        if (mode === 'lrt' && !lrt[s]) continue;
        if (
          mode !== 'rail' &&
          mode !== 'lrt' &&
          (!near || haversine(near.lat, near.lon, tt!.stopLat[s], tt!.stopLon[s]) > 600)
        )
          continue;
        add(s, 0);
      }
    } else {
      if (/^\d{2,6}$/.test(n)) {
        const s = codeIndex().get(n);
        if (s !== undefined) add(s, 100);
      }
      for (const g of searchStops(tt!, n, 60, lang)) add(g.stops[0], g.score);
    }
    const rows = Array.from(out.values());
    // the stations reachable from the From one are listed by name; anything else nearest first among equal matches
    rows.sort(
      (a, b) => b.score - a.score || (reach ? 0 : (a.dist ?? 1e9) - (b.dist ?? 1e9)) || a.name.localeCompare(b.name),
    );
    return rows.slice(0, limit).map((r) => ({ ...r, lines: r.mode === 'rail' ? [] : linesAt(r.stops[0], 8) }));
  },
  /**
   * A train station's direct destinations: every station a train from here reaches without a change, with today's
   * trains there, the next one from `fromTime` and how long it takes. `stops` are the station's platforms.
   */
  stationReach({ stops, fromTime, mode = 'rail' }): Dest[] {
    const from = new Set(stops),
      dests = new Map<string, Dest>(),
      type = mode === 'lrt' ? 0 : 2;
    for (const s of stops) {
      for (let i = tt!.stopPatsOff[s]; i < tt!.stopPatsOff[s + 1]; i++) {
        const p = tt!.stopPats[2 * i],
          pos = tt!.stopPats[2 * i + 1];
        if (tt!.routes[tt!.patRoute[p]][3] !== type) continue;
        const o = tt!.patStopsOff[p],
          ns = tt!.patStopsOff[p + 1] - o;
        for (let j = pos + 1; j < ns; j++) {
          const b = tt!.patStops[o + j];
          if (from.has(b)) continue;
          const st = stationOf(b),
            key = st.key;
          let d = dests.get(key);
          if (!d)
            dests.set(
              key,
              (d = {
                key,
                name: st.name,
                stops: st.stops,
                lat: tt!.stopLat[b],
                lon: tt!.stopLon[b],
                trips: 0,
                next: null,
                ride: null,
              }),
            );
          for (let t = tt!.patTripsOff[p]; t < tt!.patTripsOff[p + 1]; t++) {
            const base = tt!.tripTimesOff[p] + (t - tt!.patTripsOff[p]) * ns,
              dep = tt!.dep[base + pos],
              arr = tt!.arr[base + j];
            d.trips++;
            if (dep >= fromTime && (d.next == null || dep < d.next)) {
              d.next = dep;
              d.ride = arr - dep;
            }
          }
        }
      }
    }
    return Array.from(dests.values()).sort((a, b) => a.name.localeCompare(b.name));
  },
  /** The lines calling at a stop, for its page's map: one pattern per line (its busiest), with what names it in the
   *  live data and its colours. */
  stopRoutes({ stop, stops = null }) {
    const best = new Map<number, { p: number; n: number }>();
    for (const st of stops && stops.length ? stops : [stop])
      for (let i = tt!.stopPatsOff[st]; i < tt!.stopPatsOff[st + 1]; i++) {
        const p = tt!.stopPats[2 * i],
          ri = tt!.patRoute[p],
          n = tt!.patTripsOff[p + 1] - tt!.patTripsOff[p];
        const b = best.get(ri);
        if (!b || n > b.n) best.set(ri, { p, n });
      }
    return Array.from(best, ([ri, { p }]) => {
      const r = tt!.routes[ri];
      return { pattern: p, ref: liveId(r), type: r[3], agency: r[2] };
    });
  },
  /** Something opened on another day, found in the day loaded now (indices are the day's own): a line by its route
   *  id in the feed, a stop by the number on its sign (else the nearest within 60 m), a train station by position. */
  findRecent({ kind, ref = null, code = '', lat = 0, lon = 0, mode = 'rail' }): number | RecentStation | null {
    if (kind === 'line') {
      for (let i = 0; i < tt!.routes.length; i++)
        if (tt!.routes[i][4] != null && String(tt!.routes[i][4]) === ref) return i;
      return -1;
    }
    if (kind === 'station') {
      const g = stopsOps.stopGroups({ mode, near: { lat, lon }, limit: 1 })[0];
      return g && g.dist != null && g.dist < 400 ? { name: g.name, stops: g.stops, lat: g.lat, lon: g.lon } : null;
    }
    if (code) {
      const s = codeIndex().get(String(code));
      if (s !== undefined) return s;
    }
    let best = -1,
      bd = 60;
    for (let s = 0; s < tt!.stops.length; s++) {
      const d = haversine(lat, lon, tt!.stopLat[s], tt!.stopLon[s]);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  },
  /** Every stop of the day as GeoJSON, for the live map. */
  /** Every stop as a point with its kind: rail, lrt (light rail), station (a bus station: a parent with
   *  platforms), platform (a stop inside a station, with the station's kind in `st`), or bus. A station is one
   *  feature at the centre of its platforms, its first platform standing for it in taps. */
  stopsGeo() {
    const rail = railStops(),
      lrt = lrtStops();
    const kindOf = (s: number): StopMode => {
      if (rail[s]) return 'rail';
      return lrt[s] ? 'lrt' : 'bus';
    };
    const features: GeoJSON.Feature[] = [];
    const stKind = new Map<number, 'rail' | 'lrt' | 'station'>();
    for (const [p, members] of tt!.stationStops) {
      let k: 'rail' | 'lrt' | 'station' = 'station';
      for (const s of members) {
        const ks = kindOf(s);
        if (ks === 'rail' || (ks === 'lrt' && k === 'station')) k = ks;
      }
      if (k === 'station' && members.length < 3) continue; // a pair of opposite bus stops the feed groups is not a bus station
      stKind.set(p, k);
      const c = centreOf(tt!, members);
      features.push({
        type: 'Feature',
        properties: { stop: members[0], station: p, name: stName(p) || sName(members[0]), kind: k },
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      });
    }
    for (let s = 0; s < tt!.stops.length; s++) {
      const p = tt!.stopParent[s];
      features.push({
        type: 'Feature',
        properties:
          p >= 0 && stKind.has(p)
            ? { stop: s, name: sName(s), kind: 'platform', st: stKind.get(p) }
            : { stop: s, name: sName(s), kind: kindOf(s) },
        geometry: { type: 'Point', coordinates: [tt!.stopLon[s], tt!.stopLat[s]] },
      });
    }
    return { type: 'FeatureCollection', features };
  },
  /** A stop, or a station with all its platforms (`station`, or `stops` that share one): what the stop view shows
   *  about it, with the stops it stands for and whether trains call there. */
  stopInfo({ stop, station = -1, stops = null }) {
    if (station < 0 && stops && stops.length > 1) {
      const p = tt!.stopParent[stops[0]];
      if (p >= 0 && stops.every((s) => tt!.stopParent[s] === p)) station = p;
    }
    // a light rail stop is both its directions
    let members: number[] = [stop];
    if (station >= 0) members = (tt!.stationStops.get(station) || [stop]).slice();
    else if (stops && stops.length) members = stops.slice();
    else if (lrtGroups().has(stop)) members = lrtGroups().get(stop)!.stops.slice();
    const rail = railStops(),
      hasRail = members.some((s) => rail[s]),
      hasLrt = !hasRail && members.some((s) => lrtStops()[s]);
    let reach: 'rail' | 'lrt' | null = null; // where its trains go without a change (stationReach)
    if (hasRail) reach = 'rail';
    else if (hasLrt) reach = 'lrt';
    // the number on a stop's sign is for buses: a railway station's is no rider's
    if (station < 0 && members.length === 1)
      return {
        ...stopOut(stop),
        ...(hasRail ? { code: '' } : {}),
        stops: members,
        rail: hasRail,
        reach,
        lines: linesAt(stop, 30),
      };
    const seen = new Map<string, LineAt>();
    for (const s of members) for (const l of linesAt(s, 40)) if (!seen.has(l.label)) seen.set(l.label, l);
    return {
      ...stopOut(members[0]),
      ...centreOf(tt!, members),
      name: (station >= 0 && stName(station)) || sName(members[0]),
      code: '',
      station,
      stops: members,
      rail: hasRail,
      reach,
      lines: Array.from(seen.values()).slice(0, 30),
    };
  },
  /** The GTFS route ids of the lines serving stops within `radius` m of a point: what can be taken from there. */
  nearbyRoutes({ lat, lon, radius = 500 }) {
    const ids = new Set<string>();
    for (let s = 0; s < tt!.stops.length; s++) {
      if (haversine(lat, lon, tt!.stopLat[s], tt!.stopLon[s]) > radius) continue;
      for (let i = tt!.stopPatsOff[s]; i < tt!.stopPatsOff[s + 1]; i++) {
        const id = tt!.routes[tt!.patRoute[tt!.stopPats[2 * i]]][4];
        if (id != null) ids.add(String(id));
      }
    }
    return Array.from(ids);
  },
  departures({ stop, stops = null, fromTime, limit = 40 }) {
    const out: Departure[] = [];
    for (const st of stops && stops.length ? stops : [stop])
      for (let i = tt!.stopPatsOff[st]; i < tt!.stopPatsOff[st + 1]; i++) {
        const p = tt!.stopPats[2 * i],
          pos = tt!.stopPats[2 * i + 1];
        const ns = tt!.patStopsOff[p + 1] - tt!.patStopsOff[p];
        if (pos === ns - 1) continue; // a vehicle ending here is not a departure
        const r = tt!.routes[tt!.patRoute[p]];
        const tFirst = tt!.patTripsOff[p],
          tEnd = tt!.patTripsOff[p + 1],
          base = tt!.tripTimesOff[p];
        for (let t = tFirst; t < tEnd; t++) {
          const d = tt!.dep[base + (t - tFirst) * ns + pos];
          if (d >= fromTime)
            out.push({
              time: d,
              line: routeLabel(r),
              headsign: headsign(tt!.patRoute[p]),
              routeType: r[3],
              agency: r[2],
              trip: t,
              routeId: liveId(r),
              estimated: !!r[6],
              firstDep: tt!.dep[base + (t - tFirst) * ns],
              last: pos === ns - 1,
            });
        }
      }
    out.sort((a, b) => a.time - b.time);
    return out.slice(0, limit);
  },
} satisfies OpsPart<
  'stopGroups' | 'stationReach' | 'stopRoutes' | 'findRecent' | 'stopsGeo' | 'stopInfo' | 'nearbyRoutes' | 'departures'
>;
