// Live vehicles: the newest SIRI snapshot of every vehicle in the country, through the relay (relay/relay.js), about a
// minute old where Hasadna's database can be 15 minutes behind. It is downloaded here (4 MB of JSON once unpacked:
// parsing it on the page would stall the screen), kept for 30 s, and every live question is answered from it.
import { routeLabel } from '../engine/raptor.ts';
import { secondsOn } from '../engine/clock.ts';
import {
  estimateDelay,
  hasBusTimes,
  liveAt,
  type DelayEstimate,
  type TimedStop,
  type VehicleReport,
} from '../engine/delays.ts';
import { newest, type Vehicle } from '../engine/feed.ts';
import { haversine } from '../engine/geo.ts';
import { tt, onBusTimes } from './data.ts';
import { headsign } from './names.ts';
import { noteRoads } from './traffic.ts';
import { tripFor, tripStopList } from './trips.ts';
import type { LiveTrips, OpsPart, TripLive, VehicleStatus } from './ops.ts';

/** A vehicle as the snapshot gives it (snapVehicles): feed.ts's Vehicle with everything the relay's SIRI carries set:
 *  its line ref as a string, a number for its bearing and speed (0 when it reports none) and its operator. */
export type SnapVehicle = Vehicle & {
  lineRef: string;
  bearing: number;
  velocity: number;
  rideId: string;
  operator: number;
};
/** The relay's snapshot: Hasadna's raw SIRI StopMonitoring JSON, the fields read here. The feed writes its numbers
 *  as strings; they are read with Number() and String(), so either form does. */
type SiriJourney = {
  LineRef: string | number;
  OriginAimedDepartureTime: string;
  OperatorRef: string | number;
  VehicleRef?: string | null;
  Bearing?: string | number;
  Velocity?: string | number;
  VehicleLocation?: { Latitude: string | number; Longitude: string | number };
};
type SiriVisit = { RecordedAtTime: string; MonitoredVehicleJourney?: SiriJourney };
type SiriSnapshot = {
  Siri?: { ServiceDelivery?: { StopMonitoringDelivery?: { MonitoredStopVisit?: SiriVisit[] }[] } };
};
/** The snapshot as kept: when it was read (ms), the relay's id for it (its minute), and its vehicles. */
type Snapshot = { at: number; id: string; vehicles: SnapVehicle[] };

const SNAP_MS = 30000,
  SNAP_WINDOW_MS = 1800e3;
let snap: Snapshot | null = null,
  snapLoading: Promise<Snapshot> | null = null;
// What is remembered of each ride between snapshots, for the estimate to tell how far its position can be believed
// (delays.ts noNews). On a fresh open the snapshots of 3 and 10 minutes before are read in as well, so this is known
// at once.
//  - `same`: since when its position has been exactly the same (the report's `sameSince`). A live GPS jitters even
//    while the vehicle stands; an identical position is a unit repeating itself.
//  - `near`: since when it has stayed within STILL_M of where it settled (`stillSince`), and `away`, the latest time
//    it is known to have been elsewhere.
const STILL_M = 100;
type Seen = { loc: string; same: number; lat: number; lon: number; near: number; seen: number; away: number };
const seenAt = new Map<string, Seen>();
function note(key: string, loc: string, lat: number, lon: number, t: number): void {
  const o = seenAt.get(key);
  if (!o) {
    seenAt.set(key, { loc, same: t, lat, lon, near: t, seen: t, away: 0 });
    return;
  }
  const here = haversine(lat, lon, o.lat, o.lon) <= STILL_M;
  if (t >= o.seen) {
    if (loc !== o.loc) Object.assign(o, { loc, same: t });
    if (!here) Object.assign(o, { lat, lon, near: t, away: o.seen }); // it moved: it stands here from now
    o.seen = t;
  } else {
    // an older snapshot read late: it takes the times back while the ride was at the same place then
    if (loc === o.loc) o.same = Math.min(o.same, t);
    if (!here) o.away = Math.max(o.away, t);
    else if (t > o.away) o.near = Math.min(o.near, t);
  }
}
// Where each ride was last placed on its trip (estimateFor): the stretch and the report's time. The next report of the
// ride within PLACE_MS is read from there on (delays.ts placeOn), so a looping trip is not read backwards or at its far
// end, and a bus once under way is not read as waiting to start again.
const PLACE_MS = 600e3;
const places = new Map<string, { index: number; at: number }>();
/** The vehicle's delay and its times ahead (delays.ts estimateDelay), read from where the ride was last placed, and
 *  that place remembered: the one way the worker estimates a bus or train it has a ride for. */
export function estimateFor(v: VehicleReport, stops: readonly TimedStop[], day: string): DelayEstimate | null {
  const ride = v.rideId != null ? String(v.rideId) : '',
    rec = new Date(v.recordedAt).getTime(),
    o = ride ? places.get(ride) : undefined;
  const known = o && rec >= o.at && rec - o.at <= PLACE_MS ? o.index : null;
  const est = estimateDelay(known != null && v.lastIndex == null ? { ...v, lastIndex: known } : v, stops, day);
  if (ride && est && !est.waiting && (!o || rec >= o.at)) places.set(ride, { index: est.index, at: rec });
  return est;
}
/** A trip's times as they stand now, from its vehicle's report: the time the rider is shown at each stop from the
 *  vehicle on (delays.ts liveAt), and how many stops it is past. A stop the vehicle has not passed cannot have been left
 *  before now: the report is up to a minute old, and a bus a few hundred metres short of a stop was otherwise planned
 *  and listed as gone (Nordau, 2026-11-08). Null when the report says nothing of the trip (estimateDelay). */
export function tripLive(t: number, v: VehicleReport, nowSec: number): TripLive | null {
  const { stops } = tripStopList(t),
    est = estimateFor(v, stops, tt!.header.date);
  if (!est) return null;
  const times: number[] = [];
  let passed = est.index;
  for (let i = est.index; i < stops.length; i++) {
    const at = liveAt(est, stops, i)!; // null only without an estimate
    if (at.passed) passed = i + 1;
    times.push(at.passed ? at.time : Math.max(at.time, nowSec));
  }
  return { seen: new Date(v.recordedAt).getTime(), sure: !est.stale, from: est.index, times, passed };
}
/** The live times of the trips asked for (of every trip a vehicle runs, when `want` is null), each from the newest
 *  report of its ride. A vehicle is its trip's by its line and scheduled start (trips.ts tripFor): the one matcher. */
export function liveTrips(vs: readonly SnapVehicle[], want: ReadonlySet<number> | null): LiveTrips {
  const day = tt!.header.date,
    nowSec = secondsOn(new Date(), day),
    by = new Map<number, SnapVehicle>();
  for (const v of vs) {
    const t = tripFor(v.lineRef, secondsOn(v.scheduledStart, day));
    if (t < 0 || (want && !want.has(t))) continue;
    const o = by.get(t);
    if (!o || v.recordedAt > o.recordedAt) by.set(t, v);
  }
  const trips: Record<number, TripLive> = {};
  for (const [t, v] of by) {
    const live = tripLive(t, v, nowSec);
    if (live) trips[t] = live;
  }
  const nw = newest(vs);
  return { asOf: nw ? nw.getTime() : null, trips };
}
/** A snapshot's minute from its id ("2026/11/05/20/31", UTC). Exported for measure/trafficreplay.ts. */
export const snapTime = (id: string): number => {
  const m = /^(\d{4})\/(\d\d)\/(\d\d)\/(\d\d)\/(\d\d)$/.exec(id || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
};
const visitsOf = (j: SiriSnapshot): SiriVisit[] =>
  ((j && j.Siri && j.Siri.ServiceDelivery && j.Siri.ServiceDelivery.StopMonitoringDelivery) || []).flatMap(
    (d) => d.MonitoredStopVisit || [],
  );
const rideOf = (m: SiriJourney): string => `${m.LineRef}/${m.OriginAimedDepartureTime}`;
/** A snapshot (of minute `t`, ms) taken as the current one: into the memory, its vehicles kept. The poll does this;
 *  the replays in measure/ and the tests do too. */
export function take(j: SiriSnapshot, t: number, id = ''): Snapshot {
  remember(j, t);
  return (snap = { at: Date.now(), id, vehicles: snapVehicles(j, t) });
}
/** Take a snapshot (of minute `t`, ms) into the memory. Exported for the replays in measure/ and the tests. */
export function remember(j: SiriSnapshot, t: number): void {
  for (const x of visitsOf(j)) {
    const m = x.MonitoredVehicleJourney,
      l = m && m.VehicleLocation;
    if (m && l) note(rideOf(m), `${l.Latitude},${l.Longitude}`, Number(l.Latitude), Number(l.Longitude), t);
  }
  for (const [k, o] of seenAt) if (t - o.seen > SNAP_WINDOW_MS) seenAt.delete(k);
  for (const [k, o] of places) if (t - o.at > SNAP_WINDOW_MS) places.delete(k);
}
/** The snapshot's vehicles in the shape feed.ts gives Hasadna's: every report that names a position (one in ten train
 *  reports names none), with what is remembered of it. */
export function snapVehicles(j: SiriSnapshot, t: number): SnapVehicle[] {
  const out: SnapVehicle[] = [],
    now = Date.now();
  for (const x of visitsOf(j)) {
    const m = x.MonitoredVehicleJourney,
      l = m && m.VehicleLocation;
    if (!m || !l) continue;
    const recordedAt = new Date(x.RecordedAtTime),
      rt = recordedAt.getTime();
    if (!(rt > now - SNAP_WINDOW_MS && rt < now + 600e3)) continue; // gone quiet half an hour ago, or an impossible time
    // a report stamped after the snapshot was taken is a vehicle's wrong clock (2026-10-22: 13 of 8,915, from a minute
    // to two days ahead): read as the newest, it made every true report in its area look old, and the map hid them
    if (rt > t + 120e3) continue; // t: the snapshot's minute, the source's own clock
    const o = seenAt.get(rideOf(m));
    out.push({
      lineRef: String(m.LineRef),
      lat: Number(l.Latitude),
      lon: Number(l.Longitude),
      bearing: Number(m.Bearing) || 0,
      velocity: Number(m.Velocity) || 0,
      recordedAt,
      scheduledStart: new Date(m.OriginAimedDepartureTime),
      rideId: rideOf(m),
      vehicleRef: m.VehicleRef,
      operator: Number(m.OperatorRef),
      sameSince: o ? o.same : null,
      stillSince: o ? o.near : null,
    });
  }
  // one report per bus: a bus that started its next trip often still has a report of the one before in the snapshot
  // (570 of 4,798 vehicles, 2026-10-25 21:38), older, from where that trip ended, which read hugely late or early
  const newest = new Map<string, SnapVehicle>();
  for (const v of out)
    if (v.operator !== 2 && v.vehicleRef != null) {
      const k = `${v.operator}/${v.vehicleRef}`,
        n = newest.get(k);
      if (!n || v.recordedAt > n.recordedAt) newest.set(k, v);
    }
  return out.filter(
    (v) => v.operator === 2 || v.vehicleRef == null || newest.get(`${v.operator}/${v.vehicleRef}`) === v,
  );
}
let relayAt = 0; // which of the relay's addresses answered last: tried first next time
let relayUrls: string[] = []; // the relay's addresses as last asked, for a snapshot fetched outside a poll (busTimesIn)
// 15 s for the relay to start answering; reading the body then gets a minute: on a phone at start-up it competes
// with the timetable and street downloads and waits behind their unpacking here (a 12 s limit on the whole read
// aborted it on the maintainer's phone every time, 2026-10-21)
async function fetchFrom(url: string, ago: number): Promise<Response> {
  const ctl = new AbortController(),
    timer = setTimeout(() => ctl.abort(new Error('relay did not answer in 15 s')), 15000);
  try {
    return await fetch(ago ? `${url}?ago=${ago}` : url, { cache: 'no-store', signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}
/** The relay's snapshot of `ago` minutes back (0: the newest), from the first of its addresses that answers. */
async function fetchSnapshot(urls: string[], ago: number): Promise<{ id: string; t: number; j: SiriSnapshot }> {
  let r: Response | null = null,
    err: unknown = null;
  for (let k = 0; k < urls.length && !r; k++) {
    const i = (relayAt + k) % urls.length;
    try {
      const res = await fetchFrom(urls[i], ago);
      if (!res.ok) throw new Error(`relay HTTP ${res.status}`);
      // an address not (yet) pointed at the relay answers with someone's page: a snapshot names itself
      if (!res.headers.get('x-snapshot')) throw new Error('not the relay');
      r = res;
      relayAt = i;
    } catch (e) {
      err = e;
    }
  }
  if (!r) throw err || new Error('relay unavailable');
  const id = r.headers.get('x-snapshot') || '';
  let late: ReturnType<typeof setTimeout> | undefined;
  // the body is JSON of the relay's making (any): read as the SIRI shape above
  const j: SiriSnapshot = await Promise.race([
    r.json(),
    new Promise<never>((_, no) => {
      late = setTimeout(() => no(new Error('relay body took over 60 s')), 60000);
    }),
  ]).finally(() => clearTimeout(late));
  return { id, t: snapTime(id), j };
}
// The learned bus times land after the first snapshots on a fresh open (they are a download among others), and the
// road model dropped every snapshot until then: it now gets the snapshots of 10 and 3 minutes before and the current
// one, so the roads are coloured as soon as the times are in, not after minutes of polling (maintainer, 2026-11-05:
// "why does it not show me the traffic on the road immediately? I see the buses but not the lines"). Three snapshots,
// not two: replayed against the steady state (measure/trafficreplay.ts, 2026-11-05 evening), 10 and now coloured 76% of
// the sections a quarter of an hour of polling does, 10, 3 and now 92%, both agreeing with it on the level 92-93% of
// the time with no lean towards slower.
onBusTimes(async () => {
  if (!snap || !relayUrls.length) return;
  for (const ago of [10, 3]) {
    try {
      const older = await fetchSnapshot(relayUrls, ago);
      noteRoads(snapVehicles(older.j, older.t));
    } catch {
      /* without it the next poll pairs with what there is */
    }
  }
  noteRoads(snap.vehicles);
});
async function snapshot(urls: string[]): Promise<Snapshot> {
  if (snap && Date.now() - snap.at < SNAP_MS) return snap;
  if (!snapLoading)
    snapLoading = (async () => {
      relayUrls = urls;
      const get = (ago: number) => fetchSnapshot(urls, ago);
      const first = !seenAt.size;
      const cur = await get(0);
      // a feed that stalled is no better than the database: then Hasadna's API answers instead
      if (!(Date.now() - cur.t <= 600e3)) throw new Error(`relay snapshot ${cur.id || '?'} is old`);
      const now = take(cur.j, cur.t, cur.id);
      noteRoads(now.vehicles);
      // the first time, the snapshots of 3 and 10 minutes before follow in the background, newest first, so what the
      // memory is for shows at once and not after minutes of use: dead positions, how long each vehicle has stood
      // where it is, and how the roads run (three snapshots, not two: finer pairs, more sections,
      // measure/trafficreplay.ts). The current vehicles are read again after each.
      if (first)
        (async () => {
          const older: SnapVehicle[][] = [];
          for (const ago of [3, 10]) {
            const o = await get(ago);
            if (!(o.t < cur.t)) return;
            remember(o.j, o.t);
            older.unshift(snapVehicles(o.j, o.t));
            if (snap && snap.id === cur.id) snap = { ...snap, vehicles: snapVehicles(cur.j, cur.t) };
          }
          if (hasBusTimes()) for (const vs of [...older, snap ? snap.vehicles : []]) noteRoads(vs);
        })().catch(() => {});
      return now;
    })().finally(() => {
      snapLoading = null;
    });
  return snapLoading;
}

/** The newest snapshot's vehicles, or null when live times are not asked for (`urls`) or cannot be had: the planner
 *  then routes on the timetable alone. */
export const vehiclesNow = (urls: string[] | null | undefined): Promise<SnapVehicle[] | null> =>
  urls
    ? snapshot(urls).then(
        (s) => s.vehicles,
        () => null,
      )
    : Promise.resolve(null);

export const vehiclesOps = {
  /** Live vehicles from the newest snapshot: of a line ({line}), in a box ({box}) or of an operator ({operator}). */
  async liveQuery({ urls, filter }) {
    const s = await snapshot(urls);
    let vs = s.vehicles;
    if ('line' in filter && filter.line != null) vs = vs.filter((v) => v.lineRef === String(filter.line));
    else if ('box' in filter && filter.box) {
      const b = filter.box;
      vs = vs.filter((v) => v.lat >= b.south && v.lat <= b.north && v.lon >= b.west && v.lon <= b.east);
    } else if ('operator' in filter && filter.operator != null) vs = vs.filter((v) => v.operator === filter.operator);
    return vs;
  },
  /** The live times of some trips (liveTrips): what every screen that shows a ride's time asks. */
  async live({ urls, trips }) {
    return liveTrips((await snapshot(urls)).vehicles, new Set(trips));
  },
  /** Which trip each reported vehicle runs and how late it is (for the line page's map). */
  vehiclesStatus({ vehicles }) {
    const day = tt!.header.date;
    return vehicles.map((v): VehicleStatus => {
      const t = tripFor(v.lineRef, secondsOn(new Date(v.scheduledStart), day));
      if (t < 0) return { trip: -1 };
      const { stops } = tripStopList(t);
      const est = estimateFor(v, stops, day);
      const ri = tt!.patRoute[tt!.tripPat[t]];
      return {
        trip: t,
        delay: est ? est.delay : null,
        stale: est ? est.stale : true,
        index: est ? est.index : -1,
        headsign: headsign(ri),
        route: ri,
        line: routeLabel(tt!.routes[ri]),
        agency: tt!.routes[ri][2],
        routeType: tt!.routes[ri][3],
      };
    });
  },
} satisfies OpsPart<'liveQuery' | 'live' | 'vehiclesStatus'>;
