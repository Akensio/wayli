// Live vehicles: the newest SIRI snapshot of every vehicle in the country, through the relay (relay/relay.js), about a
// minute old where Hasadna's database can be 15 minutes behind. It is downloaded here (4 MB of JSON once unpacked:
// parsing it on the page would stall the screen), kept for 30 s, and every live question is answered from it.
import { routeLabel } from '../engine/raptor.ts';
import { secondsOn } from '../engine/clock.ts';
import { estimateDelay, hasBusTimes } from '../engine/delays.ts';
import type { Fix, Vehicle } from '../engine/feed.ts';
import { metres } from '../engine/geo.ts';
import { tt } from './data.ts';
import { headsign } from './names.ts';
import { codeIndex } from './stops.ts';
import { noteRoads } from './traffic.ts';
import { tripFor, tripStopList } from './trips.ts';
import type { OpsPart, VehicleStatus } from './ops.ts';

/** A vehicle as the snapshot gives it (snapVehicles): feed.ts's Vehicle with everything the relay's SIRI carries set:
 *  its line ref as a string, a number for its bearing and speed (0 when it reports none), its operator, and whether it
 *  was put at the stop its call names for want of a position. */
export type SnapVehicle = Vehicle & {
  lineRef: string;
  bearing: number;
  velocity: number;
  rideId: string;
  operator: number;
  atStop: boolean;
};
/** The relay's snapshot: Hasadna's raw SIRI StopMonitoring JSON, the fields read here. The feed writes its numbers
 *  as strings; they are read with Number() and String(), so either form does. */
type SiriCall = { StopPointRef?: string | number; DistanceFromStop?: string | number };
type SiriJourney = {
  LineRef: string | number;
  OriginAimedDepartureTime: string;
  OperatorRef: string | number;
  VehicleRef?: string | null;
  Bearing?: string | number;
  Velocity?: string | number;
  MonitoredCall?: SiriCall;
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
// Frozen positions: a vehicle that reports speed but the same position for 2 minutes is repeating an old fix (37% of
// trains with GPS did, and no bus, 2026-10-21 19:26; the stop it names froze with it). Read as current, it adds every
// minute to its delay, so it is dropped and its trip shows the timetable. Each ride's position is remembered with when
// it was first seen there; the first load also reads the snapshot of 3 minutes before, so this works at once.
const FROZEN_MS = 120e3,
  MOVING_KMH = 5;
const posSince = new Map<string, { loc: string; since: number; seen: number }>();
// ride -> { loc, since: ms, seen: ms }
// A train without GPS names only a station (its call), from about a kilometre before it until about a kilometre before
// the next: when the call first named that station says when it got there (delays.ts railAhead). `change`: a different
// call was seen before it, so `since` is the change itself, not just when the app started looking.
const callSince = new Map<string, { code: string; since: number; seen: number; change: boolean }>();
// ride -> { code, since: ms, seen: ms, change }
// A train's trail: its fixes of the last half hour, oldest first, so that a train standing at a station says when it
// pulled in (delays.ts cameAt: it leaves after its usual stand from then, not at the station's time).
const trails = new Map<string, Fix[]>();
// ride -> [[recorded ms, lat, lon], ...]
const snapTime = (id: string): number => {
  const m = /^(\d{4})\/(\d\d)\/(\d\d)\/(\d\d)\/(\d\d)$/.exec(id || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
};
function remember(j: SiriSnapshot, t: number): void {
  for (const d of (j && j.Siri && j.Siri.ServiceDelivery && j.Siri.ServiceDelivery.StopMonitoringDelivery) || []) {
    for (const x of d.MonitoredStopVisit || []) {
      const m = x.MonitoredVehicleJourney;
      if (!m) continue;
      const key = `${m.LineRef}/${m.OriginAimedDepartureTime}`,
        c = m.MonitoredCall;
      if (c && c.StopPointRef != null) {
        const code = String(c.StopPointRef),
          rt = Date.parse(x.RecordedAtTime) || t,
          k = callSince.get(key);
        if (!k) callSince.set(key, { code, since: rt, seen: t, change: false });
        else if (k.code === code) {
          k.since = Math.min(k.since, rt);
          k.seen = Math.max(k.seen, t);
        } else if (t < k.seen)
          k.change = true; // an older snapshot, read late, with the call before: the change came after it
        else callSince.set(key, { code, since: rt, seen: t, change: true });
      }
      const l = m.VehicleLocation;
      if (!l) continue;
      if (String(m.OperatorRef) === '2') {
        const rt = Date.parse(x.RecordedAtTime),
          tr = trails.get(key) || [];
        if (rt && !tr.some((f) => f[0] === rt)) {
          tr.push([rt, Number(l.Latitude), Number(l.Longitude)]);
          tr.sort((a, b) => a[0] - b[0]);
        }
        trails.set(key, tr);
      }
      const loc = `${l.Latitude},${l.Longitude}`,
        o = posSince.get(key);
      // snapshots can come in out of order (the earlier one follows in the background): keep the earliest time at this place
      if (o && o.loc === loc) {
        o.since = Math.min(o.since, t);
        o.seen = Math.max(o.seen, t);
      } else posSince.set(key, { loc, since: t, seen: t });
    }
  }
  for (const [k, o] of posSince) if (t - o.seen > SNAP_WINDOW_MS) posSince.delete(k);
  for (const [k, o] of callSince) if (t - o.seen > SNAP_WINDOW_MS) callSince.delete(k);
  for (const [k, tr] of trails) {
    while (tr.length && t - tr[0][0] > SNAP_WINDOW_MS) tr.shift();
    if (!tr.length) trails.delete(k);
  }
}
// A train takes its next trip's number some minutes before that trip starts: 18% of train fixes came before their
// trip's start (2026-10-19 to 21), 94% of those from the train standing at its first station. The rest come from a
// train still running elsewhere, typically 12 minutes before the start (up to 17), a median 12 km away and mostly off
// the trip's path: about 35 trips a day. Some are the train finishing its trip before under the next number (the maintainer's
// reading): another trip went quiet a couple of minutes earlier close by. The feed cannot say so outright (a train's
// vehicle number is its trip number, not the set), so a fix goes back to such a trip only when it plainly continues
// it: that trip has not reported for 2-15 minutes, the fix is on its path, further along it, no further from its last
// report than a train runs in that time, the delay it gives that trip is within 5 minutes of its last one (it carried
// over within 0.2 minutes in the median), and no other trip fits. A quarter of these fixes come with a twin, another
// trip running reports from the same spot that minute: one train under two numbers, or two coupled; the running trip
// has its own report, and the copy is dropped. The trip then shows the train to its end instead of going quiet. Any other such fix is dropped: it
// is no position of the trip it names (a dot of that line far away, or a made-up delay).
function notYetItsTrip(v: SnapVehicle): boolean {
  if (v.operator !== 2 || v.atStop || !(v.velocity > 10) || !tt) return false;
  const day = tt.header.date,
    t = tripFor(v.lineRef, secondsOn(v.scheduledStart, day));
  if (t < 0) return false;
  const { stops } = tripStopList(t);
  return secondsOn(v.recordedAt, day) < stops[0].dep - 120 && metres(v.lat, v.lon, stops[0].lat, stops[0].lon) > 300;
}
function handedOver(early: SnapVehicle, trains: SnapVehicle[]): SnapVehicle | null {
  const day = tt!.header.date,
    seen = early.recordedAt.getTime();
  let best: SnapVehicle | null = null;
  for (const o of trains) {
    const gap = seen - o.recordedAt.getTime();
    // quiet: two report cycles missed (trains report every minute; a running train a cycle late is no handover), and
    // not over a quarter of an hour
    if (o === early || !(gap >= 120e3 && gap <= 900e3)) continue;
    // the same train going on: no further away than it could have run since (160 km/h)
    if (metres(o.lat, o.lon, early.lat, early.lon) > 500 + (gap / 1000) * 45) continue;
    const t = tripFor(o.lineRef, secondsOn(o.scheduledStart, day));
    if (t < 0) continue;
    const { stops } = tripStopList(t);
    if (secondsOn(early.recordedAt, day) > stops[stops.length - 1].arr + 3600) continue;
    const was = estimateDelay(o, stops, day),
      now = estimateDelay(early, stops, day);
    if (!was || !now || now.index + now.frac < was.index + was.frac) continue; // and further along its trip
    const real = (d: number): boolean => d > -900 && d < 5400; // a delay at the estimate's bounds is no estimate (a trip far off its time)
    if (!real(was.late) || !real(now.late) || Math.abs(now.late - was.late) > 300) continue;
    if (best) return null; // two trips fit: no guessing (a wrong one shows a train where it is not)
    best = o;
  }
  return best;
}
/** The snapshot's vehicles in the shape feed.ts gives Hasadna's. One with no position (most often a train) is put at the stop it
 *  reports when it is at it; Hasadna's database drops those (about one train in eight, 2026-10-21). A train
 *  that has taken its next trip's number while still running elsewhere goes back to the trip it is finishing when
 *  that is clear (handedOver), and is left out otherwise. */
function snapVehicles(j: SiriSnapshot, t: number): SnapVehicle[] {
  let out: SnapVehicle[] = [];
  const early: SnapVehicle[] = [],
    now = Date.now();
  const codes = tt ? codeIndex() : null;
  for (const d of (j && j.Siri && j.Siri.ServiceDelivery && j.Siri.ServiceDelivery.StopMonitoringDelivery) || []) {
    for (const x of d.MonitoredStopVisit || []) {
      const m = x.MonitoredVehicleJourney;
      if (!m) continue;
      const recordedAt = new Date(x.RecordedAtTime),
        rt = recordedAt.getTime();
      if (!(rt > now - SNAP_WINDOW_MS && rt < now + 600e3)) continue; // gone quiet half an hour ago, or an impossible time
      // a report stamped after the snapshot was taken is a vehicle's wrong clock (2026-10-22: 13 of 8,915, from a minute
      // to two days ahead): read as the newest, it made every true report in its area look old, and the map hid them
      if (rt > t + 120e3) continue; // t: the snapshot's minute, the source's own clock
      if (m.VehicleLocation && Number(m.Velocity) > MOVING_KMH) {
        const o = posSince.get(`${m.LineRef}/${m.OriginAimedDepartureTime}`);
        if (o && t - o.since >= FROZEN_MS) continue; // t: the snapshot's minute
      }
      let lat = Number(m.VehicleLocation && m.VehicleLocation.Latitude),
        lon = Number(m.VehicleLocation && m.VehicleLocation.Longitude),
        atStop = false;
      if (!lat || !lon) {
        const c = m.MonitoredCall,
          s = codes && c ? codes.get(String(c.StopPointRef)) : undefined;
        if (s === undefined || Number(c!.DistanceFromStop) > 0) continue; // s was found through c
        lat = tt!.stopLat[s];
        lon = tt!.stopLon[s];
        atStop = true;
      }
      const v: SnapVehicle = {
        lineRef: String(m.LineRef),
        lat,
        lon,
        bearing: Number(m.Bearing) || 0,
        velocity: Number(m.Velocity) || 0,
        recordedAt,
        scheduledStart: new Date(m.OriginAimedDepartureTime),
        rideId: `${m.LineRef}/${m.OriginAimedDepartureTime}`,
        vehicleRef: m.VehicleRef,
        operator: Number(m.OperatorRef),
        atStop,
      };
      if (!atStop && v.operator === 2) v.trail = trails.get(v.rideId) || null;
      if (atStop && v.operator === 2) {
        // a train known only by its call: when the call first named this station
        const k = callSince.get(v.rideId);
        if (k && k.code === String(m.MonitoredCall!.StopPointRef)) {
          v.callSince = k.since;
          v.callSeenChange = k.change;
        }
      }
      if (notYetItsTrip(v)) early.push(v);
      else out.push(v);
    }
  }
  // one report per bus: a bus that started its next trip often still has a report of the one before in the snapshot
  // (570 of 4,798 vehicles, 2026-10-25 21:38), older, from where that trip ended, which read hugely late or early
  const newest = new Map<string, SnapVehicle>();
  for (const v of out)
    if (v.operator !== 2 && v.vehicleRef != null) {
      const k = `${v.operator}/${v.vehicleRef}`,
        o = newest.get(k);
      if (!o || v.recordedAt > o.recordedAt) newest.set(k, v);
    }
  if (newest.size)
    out = out.filter(
      (v) => v.operator === 2 || v.vehicleRef == null || newest.get(`${v.operator}/${v.vehicleRef}`) === v,
    );
  if (!early.length) return out;
  const trains = out.filter((v) => v.operator === 2 && !v.atStop),
    gone = new Set<SnapVehicle>();
  for (const v of early) {
    const o = handedOver(v, trains);
    if (!o || gone.has(o)) continue;
    gone.add(o); // its own older report gives way to the newer one
    out.push({ ...v, lineRef: o.lineRef, scheduledStart: o.scheduledStart, rideId: o.rideId, handedOver: true });
  }
  return gone.size ? out.filter((v) => !gone.has(v)) : out;
}
let relayAt = 0; // which of the relay's addresses answered last: tried first next time
async function snapshot(urls: string[]): Promise<Snapshot> {
  if (snap && Date.now() - snap.at < SNAP_MS) return snap;
  if (!snapLoading)
    snapLoading = (async () => {
      // 15 s for the relay to start answering; reading the body then gets a minute: on a phone at start-up it competes
      // with the timetable and street downloads and waits behind their unpacking here (a 12 s limit on the whole read
      // aborted it on the maintainer's phone every time, 2026-10-21)
      const fetchFrom = async (url: string, ago: number): Promise<Response> => {
        const ctl = new AbortController(),
          timer = setTimeout(() => ctl.abort(new Error('relay did not answer in 15 s')), 15000);
        try {
          return await fetch(ago ? `${url}?ago=${ago}` : url, { cache: 'no-store', signal: ctl.signal });
        } finally {
          clearTimeout(timer);
        }
      };
      const get = async (ago: number): Promise<{ id: string; t: number; j: SiriSnapshot }> => {
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
      };
      const first = !posSince.size;
      const cur = await get(0);
      // a feed that stalled is no better than the database: then Hasadna's API answers instead
      if (!(Date.now() - cur.t <= 600e3)) throw new Error(`relay snapshot ${cur.id || '?'} is old`);
      remember(cur.j, cur.t);
      snap = { at: Date.now(), id: cur.id, vehicles: snapVehicles(cur.j, cur.t) };
      noteRoads(snap.vehicles);
      // the first time, the snapshot of 3 minutes before follows in the background, so frozen positions show at once:
      // its positions count as seen first then, and the current vehicles are filtered again
      if (first)
        get(3)
          .then((before) => {
            if (!(before.t < cur.t)) return;
            remember(before.j, before.t);
            remember(cur.j, cur.t);
            if (snap && snap.id === cur.id) snap = { ...snap, vehicles: snapVehicles(cur.j, cur.t) };
            // and the one of 10 minutes before: how the roads run is known at once, not after minutes of use
            if (hasBusTimes())
              return get(10).then((older) => {
                noteRoads(snapVehicles(older.j, older.t));
                noteRoads(snap ? snap.vehicles : []);
              });
          })
          .catch(() => {});
      return snap;
    })().finally(() => {
      snapLoading = null;
    });
  return snapLoading;
}

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
  /** A vehicle's delay and its time at each stop ahead (delays.ts estimateDelay), made here where the learned times are. */
  estimate({ vehicle, stops, day }) {
    return estimateDelay(vehicle, stops, day);
  },
  /** Which trip each reported vehicle runs and how late it is (for the line page's map). */
  vehiclesStatus({ vehicles }) {
    const day = tt!.header.date;
    return vehicles.map((v): VehicleStatus => {
      const t = tripFor(v.lineRef, secondsOn(new Date(v.scheduledStart), day));
      if (t < 0) return { trip: -1 };
      const { stops } = tripStopList(t);
      const est = estimateDelay(v, stops, day);
      const ri = tt!.patRoute[tt!.tripPat[t]];
      return {
        trip: t,
        delay: est ? est.delay : null,
        stale: est ? est.ageSec > 240 : true,
        index: est ? est.index : -1,
        headsign: headsign(ri),
        route: ri,
        line: routeLabel(tt!.routes[ri]),
        agency: tt!.routes[ri][2],
        routeType: tt!.routes[ri][3],
      };
    });
  },
} satisfies OpsPart<'liveQuery' | 'estimate' | 'vehiclesStatus'>;
