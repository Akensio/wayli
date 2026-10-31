// How late a vehicle runs, and when it reaches each stop ahead: where it is along its trip, the learned running times
// of trains' sections (pipeline/railtimes.py) and of buses' (pipeline/bustimes.py, with a live correction from the
// buses that just ran a section), the delay against the timetable, and a stop's live time for the rider.
import { metres } from './geo.ts';
import { secondsOn } from './clock.ts';
import { projectOnStops, type Projection } from './geo.ts';
import type { Fix } from './feed.ts';

/** A stop of a trip as the estimates read it (worker/trips.js tripStopList; the page's TripStop carries more): where
 *  it is (degrees), its listed times there (seconds on the service day; a train's arr = dep), and its code in the feed,
 *  which names the learned sections ("code>code"). A stop without one keeps the timetable's time to the next. */
export type TimedStop = { lat: number; lon: number; arr: number; dep: number; code?: string | number | null };

// ------------------------------------------------------------------ trains: learned running times
// A train does not run at one speed between stations: it pulls out slowly, runs fast, brakes, and some sections are
// slow. pipeline/railtimes.py learns from the last days' positions how long each section between two stations
// really takes and how the time spreads along it, and how long trains stand at each station. With it a train's
// position says when it reaches the next station, and from there each later one: it leaves a station no earlier
// than the timetable, after its usual stand. Sections never seen fall back to the timetable's.
/** The learned train times, pipeline/railtimes.py's railtimes.json. */
export type RailTimes = {
  built?: string;
  days?: string[];
  /** "code>code" → [run, g0..g10]: the section's usual running time (s), then the share of it (0 to 1) done at each
   *  tenth of the way between the two stations (g0 = 0, g10 = 1). */
  s: Record<string, number[]>;
  /** station code → how long trains stand there (s). */
  d: Record<string, number>;
  /** Seconds a late train was taken to make up per station: ignored (it made every prediction early, 2026-10-25). */
  h?: number;
};
let railTimes: RailTimes | null = null;
export function setRailTimes(m: RailTimes | null | undefined): void {
  railTimes = m && m.s ? m : null;
}
const AT_STATION = 300; // m: a train this close to a station is at it (the same in pipeline/railtimes.py)
const section = (stops: readonly TimedStop[], k: number): number[] | null =>
  railTimes && stops[k].code != null && stops[k + 1].code != null
    ? railTimes.s[`${stops[k].code}>${stops[k + 1].code}`] || null
    : null;
const along = (g: number[], x: number): number => {
  const p = x * 10,
    i = Math.min(9, Math.floor(p));
  return g[i + 1] + (g[i + 2] - g[i + 1]) * (p - i);
}; // g[0] is the run
/** A train known by its call only: when it reached the station the call names (`at`) and now (`now`), seconds on the
 *  service day. */
type Call = { at: number; now: number };
/** A vehicle's times from where it is on (railAhead, busAhead): `arr[i]` and `dep[i]`, seconds on the service day at
 *  stop i, null at the stops behind it; where it is (`index`: the stretch from that stop to the next, `frac`: how far
 *  along it); `next`, the stop it comes to next (a train standing at a station: that station). A train adds `at` (the
 *  station it stands at, -1 between two), `late` (how late it pulls in at `next`; standing, also how much later it
 *  leaves than an on-time train would) and `rail`. */
type Ahead = {
  arr: (number | null)[];
  dep: (number | null)[];
  index: number;
  frac: number;
  next: number;
  at?: number;
  late?: number;
  rail?: boolean;
};
/** A train's times from here on, from the learned sections: arrival and departure at each later station. A train
 *  without GPS (`call`) is put at the station its call names, and not as standing there now: the call names a station
 *  from about a kilometre before it until about a kilometre before the next, so a train still named after one may
 *  well have left it (2026-10-25: named Herzliya at 09:08, it had left at 09:04 and was on time). It reached that
 *  station when the call first named it (`call.at`), stands its usual stand, and has not reached the next one yet:
 *  it gets there no sooner than `call.now` plus the last kilometre (45 s).
 *  A train standing at a station (`came`: when it pulled in, from its trail; else the earlier of now and the station's
 *  time) leaves as at any station ahead: not before its time, nor before its usual stand is over, nor before now. The
 *  feed's one time per station is about when a train pulls in, and at Tel Aviv Center it then stands some 4 minutes:
 *  taken as leaving at its time, a train standing there read a minute later every minute it stood, and the next station
 *  early first, then late (2026-10-26, train 959: 08:18, then 08:23 for 08:21; it came at 08:21:20). */
const LAST_KM = 45;
function railAhead(
  stops: readonly TimedStop[],
  pr: Projection,
  seen: number,
  lat: number,
  lon: number,
  call: Call | null = null,
  cameAtStation: (st: TimedStop) => number | null = () => null,
): Ahead | null {
  const n = stops.length,
    k = pr.index;
  let at = -1;
  if (metres(lat, lon, stops[k].lat, stops[k].lon) <= AT_STATION) at = k;
  else if (metres(lat, lon, stops[k + 1].lat, stops[k + 1].lon) <= AT_STATION) at = k + 1;
  if (!section(stops, Math.min(at >= 0 ? at : k, n - 2))) return null;
  const run = (j: number): number => {
    const m = section(stops, j);
    return m ? m[0] : Math.max(0, stops[j + 1].arr - stops[j].dep);
  };
  const stand = (j: number): number => {
    const d = railTimes!.d[String(stops[j].code)];
    return d != null ? d : stops[j].dep - stops[j].arr;
  };
  const arr: (number | null)[] = new Array(n).fill(null),
    dep: (number | null)[] = new Array(n).fill(null);
  let i: number, t: number, index: number, frac: number;
  if (at >= 0 && call) {
    // without GPS: reached it then, stands, and is not at the next one before now + the last km
    arr[at] = seen;
    if (at === n - 1) return { arr, dep, index: n - 2, frac: 1, next: at };
    dep[at] = Math.max(stops[at].dep, seen + stand(at), call.now + LAST_KM - run(at));
    t = dep[at]! + run(at);
    i = at + 1;
    index = at;
    frac = 0;
  } else if (at >= 0) {
    // standing at a station: it leaves after its stand (at its first station, at its time)
    const came = cameAtStation(stops[at]);
    arr[at] = came != null ? Math.min(came, seen) : Math.min(seen, stops[at].arr);
    if (at === n - 1) return { arr, dep, index: n - 2, frac: 1, next: at };
    dep[at] = Math.max(stops[at].dep, at > 0 ? arr[at]! + stand(at) : 0, seen);
    t = dep[at]! + run(at);
    i = at + 1;
    index = at;
    frac = 0;
  } else {
    // between two: the learned profile says how much of the section's time is behind it
    const m = section(stops, k),
      done = m ? along(m, pr.frac) : pr.frac;
    dep[k] = seen - done * run(k);
    t = seen + (1 - done) * run(k);
    i = k + 1;
    index = k;
    frac = pr.frac;
  }
  const next = i;
  for (; i < n; i++) {
    arr[i] = t;
    if (i === n - 1) break;
    dep[i] = Math.max(stops[i].dep, t + stand(i));
    t = dep[i]! + run(i);
  }
  // late, at the station it is at or comes to next: how late it pulls in; standing there, also how much later it leaves
  // than an on-time train would (at its time, or its stand after its time)
  const j = at >= 0 ? at : next;
  const late =
    at >= 0 && at < n - 1
      ? Math.max(arr[at]! - stops[at].arr, dep[at]! - Math.max(stops[at].dep, at > 0 ? stops[at].arr + stand(at) : 0))
      : arr[j]! - stops[j].arr;
  return { arr, dep, index, frac, next: j, at, late, rail: true };
}
// A train's lateness is shown only as far as we are sure of it. Most small train delays are made up on the way (the
// timetable has slack), and a train does not leave a station before its time, so the rider is shown the timetable's
// time plus the lateness we are 85% sure of: the predicted lateness less a margin that grows with how far ahead the
// station is, from 2 minutes up, and beyond 30 minutes ahead only what the stations before it carry. Backtested on three mornings' raw minute
// files (tools/trainbacktest.mjs, its last line; 2026-10-21, 25 and 26): the point estimate showed a delay on 70% of
// predictions, and a train that came on time as late in about 20% on ordinary mornings; this shows a delay on 7 to 14%,
// one that came on time in about 1%, a time 2 minutes or more after the train came 1.5 to 4.8% (the timetable alone
// 0.9 to 3.2%), and 19 to 22% of real delays of 3 minutes or more. Beyond 30 minutes a station carries the lateness of
// the one before it, less what the train can make up (railShown): an hour-late train stays an hour late.
const SURE_MARGIN = [
  [300, 20],
  [600, 60],
  [1200, 100],
  [1800, 140],
]; // [up to this many seconds ahead, margin in s]
const SHOW_FROM = 120;
/** How late to show a train at a station `ahead` seconds away, predicted `late` seconds late: 0, or whole minutes from
 *  2 up, rounded down (the time shown and its "+N" then always agree: 08:58 and 7.5 minutes read 09:05 and +8). */
export function sureLate(late: number, ahead: number): number {
  const m = SURE_MARGIN.find(([upTo]) => Math.max(0, ahead) < upTo);
  if (!m) return 0;
  const l = late - m[1];
  return l >= SHOW_FROM ? Math.floor(l / 60) * 60 : 0;
}
/**
 * The lateness shown at each station of a train's trip (seconds, by station index; null before the next one). Each
 * station's own sure lateness (sureLate), but never less than the station before's plus what the train can make up
 * between the two at its predicted pace: shown at station i at T, it cannot reach i + 1 before T plus its run there.
 * Taken one by one, a train an hour late read an hour late at the stations within half an hour and on time beyond
 * them: its times ran backwards, and a plan boarded it late and left it "on time" before it had boarded (2026-10-26,
 * 236 at Tel Aviv Center 10:42, then University 09:35; a trip shown 10:19 → 10:17). A late train may run faster than
 * its usual pace: the run carried over is three quarters of the predicted one (backtested: fewer trains shown late
 * that came on time than at the full pace, 1.2-1.3% against 1.4-1.6%). Kept on the estimate.
 */
const CATCH_UP = 0.75;
function railShown(est: DelayEstimate, stops: readonly TimedStop[]): (number | null)[] {
  if (est.shown) return est.shown;
  const n = stops.length,
    out: (number | null)[] = new Array(n).fill(null),
    j0 = est.at! >= 0 ? est.at! : est.index + 1;
  for (let i = j0; i < n; i++) {
    const a = est.arr![i];
    if (a == null) break;
    let late = i === j0 && est.at === i ? est.delay : sureLate(a - stops[i].arr, a - est.seen);
    if (i > j0 && est.dep![i - 1] != null) {
      // the station before's shown time plus the run between the two (predicted departure to predicted arrival)
      const carried = stops[i - 1].arr + out[i - 1]! + CATCH_UP * (a - est.dep![i - 1]!) - stops[i].arr;
      if (carried > late) late = Math.floor(carried / 60) * 60;
    }
    out[i] = Math.max(0, late);
  }
  est.shown = out;
  return out;
}
/** When a train standing at a station pulled in, from its trail of recent fixes ([ms, lat, lon], oldest first, the last
 *  one now): halfway between its first fix there and the one before, as pipeline/railtimes.py measures stands; its first
 *  fix there when the trail starts at the station; null when the train is not at it. Seconds on `day`. */
function cameAt(trail: readonly Fix[] | null | undefined, st: TimedStop, day: string): number | null {
  if (!trail || !trail.length) return null;
  const inside = (f: Fix): boolean => metres(f[1], f[2], st.lat, st.lon) <= AT_STATION;
  let i = trail.length - 1;
  if (!inside(trail[i])) return null;
  while (i > 0 && inside(trail[i - 1])) i--;
  return secondsOn(new Date(i > 0 ? (trail[i - 1][0] + trail[i][0]) / 2 : trail[i][0]), day);
}

// ------------------------------------------------------------------ buses: learned running times
// The timetable gives a stretch of road the same time all day, and buses do not keep it (Namir Road southbound: 6.5
// minutes in the feed at every hour, 6.5 at 06:00 and 18 at 16:00 in fact). pipeline/bustimes.py learns from the last
// two weeks of positions how long buses take between each two consecutive stops, all lines pooled, by hour and kind of
// day. A bus's position then says when it reaches each stop ahead: the rest of the section it is on, then each
// section's learned time at the hour the bus will be there. Sections never seen fall back to the timetable's.
/** The learned bus times, pipeline/bustimes.py's bustimes.bin.gz unpacked (parseBusTimes): per section between two
 *  consecutive stops, all lines pooled, the median time buses took, by kind of day and hour band. */
export type BusTimes = {
  /** "code>code" → the section's row in `cells`. */
  idx: Map<string, number>;
  /** By [section][kind][band], a byte each: 0 for no data, else the seconds encoded (decode: up to 150, 2 s a step;
   *  above, 300 s plus 15 a step). */
  cells: Uint8Array;
  /** The hour bands: 05:00 to 23:00 one an hour from band 0, then the night in band 0 as well. */
  bands: number;
  /** The kinds of day: 0 Sunday to Thursday, 1 Friday, 2 Saturday. */
  kinds: number;
  built?: string; // when the file was built (ISO)
};
/** The file's header (pipeline/bustimes.py): when it was built and from which days, the table's shape, the section count. */
type BusTimesHeader = { built?: string; days?: string[]; bands: number; kinds: number; n: number };
let busTimes: BusTimes | null = null;
/** The learned bus times (the file pipeline/bustimes.py writes, unpacked): a header, the sections' stop codes, the times. */
export function parseBusTimes(buf: ArrayBuffer): BusTimes {
  const dv = new DataView(buf),
    hl = dv.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))) as BusTimesHeader;
  const n = head.n,
    a = new Uint32Array(buf, 4 + hl, n),
    b = new Uint32Array(buf, 4 + hl + 4 * n, n);
  const idx = new Map<string, number>();
  for (let i = 0; i < n; i++) idx.set(`${a[i]}>${b[i]}`, i);
  return {
    idx,
    cells: new Uint8Array(buf, 4 + hl + 8 * n, n * head.kinds * head.bands),
    bands: head.bands,
    kinds: head.kinds,
    built: head.built,
  };
}
export function setBusTimes(m: BusTimes | null): void {
  busTimes = m;
}
export const hasBusTimes = (): boolean => !!busTimes;
/** 0 Sunday to Thursday, 1 Friday, 2 Saturday, for a service day YYYYMMDD. */
const kindOf = (day: string): number => {
  const w = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8))).getUTCDay();
  if (w === 5) return 1;
  if (w === 6) return 2;
  return 0;
};
const bandOf = (sec: number): number => {
  const h = Math.floor(sec / 3600);
  return h < 5 ? 0 : Math.min(busTimes!.bands - 1, h - 5);
};
const decode = (v: number): number | null => {
  if (!v) return null;
  return v <= 150 ? 2 * v : 300 + 15 * (v - 150);
};
/** The learned time of section k (stop k to stop k+1) for a bus there at `at`, else null. */
function busRun(stops: readonly TimedStop[], k: number, at: number, kind: number): number | null {
  const i =
    busTimes && stops[k].code && stops[k + 1].code
      ? busTimes.idx.get(`${stops[k].code}>${stops[k + 1].code}`)
      : undefined;
  return i === undefined ? null : decode(busTimes!.cells[(i * busTimes!.kinds + kind) * busTimes!.bands + bandOf(at)]);
}
/** How long section k usually takes at `at`: learned, else the timetable's. */
export function usualRun(stops: readonly TimedStop[], k: number, at: number, day: string): number {
  const r = busTimes ? busRun(stops, k, at, kindOf(day)) : null;
  return r != null ? r : Math.max(0, stops[k + 1].arr - stops[k].dep);
}
/** How fast the section runs at its best in the day's hours (06:00 to 22:00) on that kind of day, else null: free flow
 *  with passengers boarding, the second-fastest hour (the fastest of 16 medians is low by chance). The night, with nobody
 *  at the stops, is faster still: measured against it every road read slow at 10:00 (Tel Aviv, 2026-10-22: the median
 *  section 1.66 times its night time). */
export function freeRun(code1: string | number, code2: string | number, day: string): number | null {
  const i = busTimes ? busTimes.idx.get(`${code1}>${code2}`) : undefined;
  if (i === undefined) return null;
  const o = (i * busTimes!.kinds + kindOf(day)) * busTimes!.bands,
    v: number[] = [];
  for (let b = 1; b < Math.min(busTimes!.bands - 1, 18); b++) {
    const x = decode(busTimes!.cells[o + b]);
    if (x != null) v.push(x);
  }
  v.sort((a, b) => a - b);
  return v.length ? v[Math.min(1, v.length - 1)] : null;
}

// How the roads run now: the data worker follows each bus across the snapshots it reads and sets, per section, how
// the buses that ran it in the last 15 minutes did against its usual time (`ratio`, `t` when, ms; `ride`). A section's
// time ahead is its usual time times the median of those ratios, shrunk towards 1 when there are few (n / (n + 2)), and
// fading back to the usual time for sections the bus reaches more than half an hour from now. Measured on held-out days
// (pipeline/bustimes.py --score).
/** How a section ran lately: a bus's time over it against its usual time (`ratio`), when (`t`, ms since the epoch) and
 *  which ride (`ride`; a bus's own runs are left out of its factor). The data worker builds these (worker/traffic.js
 *  noteRoads) and may add fields of its own. */
export type RoadRun = { ratio: number; t: number; ride: string | number };
/** By section ("code>code"), the buses' runs over it in the last 15 minutes. */
export type RoadsNow = Map<string, RoadRun[]>;
let roadsNow: RoadsNow = new Map();
export function setRoadsNow(m: RoadsNow): void {
  roadsNow = m;
}
const ROADS_MS = 900e3,
  FADE_S = 1800;
/** The middle of the buses' ratios on a section (of two in the middle, their mean); the traffic on the map uses it too. */
export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b),
    n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
/** The live factor of a section for a vehicle seen at `seenMs` (its own runs left out). */
function roadFactor(
  code1: TimedStop['code'],
  code2: TimedStop['code'],
  seenMs: number,
  ride: string | number | undefined,
): number {
  const v = roadsNow.get(`${code1}>${code2}`);
  if (!v) return 1;
  const rs = v.filter((x) => x.ride !== ride && x.t <= seenMs + 120e3 && x.t > seenMs - ROADS_MS).map((x) => x.ratio);
  if (!rs.length) return 1;
  const m = median(rs);
  return 1 + ((m - 1) * rs.length) / (rs.length + 2);
}
/** A bus's arrival at each later stop, from where it is and the learned sections; null when none is known ahead. */
function busAhead(
  stops: readonly TimedStop[],
  pr: Projection,
  seen: number,
  day: string,
  seenMs: number,
  ride: string | number | undefined,
): Ahead | null {
  const n = stops.length,
    kind = kindOf(day);
  const run = (j: number, at: number): number => {
    const r = busRun(stops, j, at, kind),
      base = r != null ? r : Math.max(0, stops[j + 1].arr - stops[j].dep);
    const w = Math.max(0, 1 - (at - seen) / FADE_S);
    return w > 0 && roadsNow.size
      ? base * (1 + (roadFactor(stops[j].code, stops[j + 1].code, seenMs, ride) - 1) * w)
      : base;
  };
  let known = false;
  for (let j = pr.index; j < n - 1 && !known; j++) known = busRun(stops, j, seen, kind) != null;
  if (!known) return null;
  const arr: (number | null)[] = new Array(n).fill(null);
  let t: number, i: number;
  if (pr.index === 0 && pr.frac < 0.05) {
    // still at its first stop: it leaves at its time, or now if that has passed
    t = Math.max(stops[0].dep, seen);
    arr[0] = t;
    t += run(0, t);
  } else t = seen + (1 - pr.frac) * run(pr.index, seen);
  for (i = pr.index + 1; i < n; i++) {
    arr[i] = t;
    if (i < n - 1) t += run(i, t);
  }
  return { arr, dep: arr, index: pr.index, frac: pr.frac, next: pr.index + 1 };
}

/** The report a delay is estimated from: a feed.ts Vehicle, or one that crossed to the page and back (its Date then a
 *  number or a string; worker/client.ts estimate), with what the data worker adds for trains. */
export type VehicleReport = {
  lat: number; // degrees
  lon: number;
  recordedAt: Date | number | string; // when it reported: a Date, ms since the epoch, or an ISO string
  rideId?: string | number; // the ride, to leave a bus's own runs out of the road factor
  trail?: readonly Fix[] | null; // a train's fixes of the last half hour, oldest first
  callSince?: number | null; // a train without GPS: ms when its call first named the station it is put at
  callSeenChange?: boolean; // and whether that change of call was itself seen
};
/** How late a vehicle runs and where it is (estimateDelay). Seconds on the service day throughout; "late" is always
 *  against the listed time at the same stop (docs/architecture.md, "Live times, end to end"). */
export type DelayEstimate = {
  /** The lateness the rider is shown at the vehicle's next stop: a train's sure part only (sureLate), a bus's `late`. */
  delay: number;
  /** The best estimate of its lateness at its next stop, held within -900 and 5400. */
  late: number;
  rail?: boolean; // a train with learned sections: liveAt shows its sure lateness, carried station to station
  index: number; // where it is: the stretch from this stop (its index in the trip's stops) to the next
  frac: number; // and how far along it, 0 to 1
  offPath: number; // how far it is off the straight line between those stops, metres
  seen: number; // when it reported, seconds on the service day
  ageSec: number; // how old the report is against the clock, seconds
  stale: boolean; // older than four minutes
  vehicle: VehicleReport; // the report it was made from
  waiting?: boolean; // seen before its trip begins, or back at its first stop: it waits to start, late only once its time has passed
  /** With learned sections: its predicted arrival and departure at each stop (by the stop's index), null behind it. */
  arr?: (number | null)[];
  dep?: (number | null)[];
  at?: number; // a train: the station it stands at, -1 between two
  shown?: (number | null)[]; // a train: the lateness shown at each station, kept from the first liveAt (railShown)
};
/**
 * How late a vehicle runs, from its position against its trip's schedule: the scheduled time at the
 * point of the trip it is at, compared with when it was seen there. A vehicle still at the first stop
 * is late only once its start time has passed. A train with learned sections, or a bus with learned sections
 * ahead, gets its time at each later stop instead (`arr`, `dep`), and its delay is the one at the next stop.
 * `late` is the best estimate, seconds; `delay` is what the rider is shown: the same for a bus, and for a train only
 * what we are sure of (sureLate). A train's `trail` ([ms, lat, lon] of its recent fixes) says when it pulled in to
 * the station it stands at.
 */
export function estimateDelay(vehicle: VehicleReport, stops: readonly TimedStop[], day: string): DelayEstimate | null {
  if (!stops || stops.length < 2) return null;
  const recordedAt = new Date(vehicle.recordedAt); // a Date, or its string or ms once it has crossed to the page and back
  const seen = secondsOn(recordedAt, day);
  const ageSec = (Date.now() - recordedAt.getTime()) / 1000;
  // a report an hour after its trip should have ended is no position of that trip (a vehicle still naming a trip it
  // finished long ago: one named its 15:05 trip at 21:37, 2026-10-25)
  if (seen > stops[stops.length - 1].arr + 3600) return null;
  // seen before its trip begins: it waits to start it (at its terminal, or still finishing the trip before on roads
  // this one shares), and has not run any of it. Placed along the trip it read as up to 15 minutes early, 73 buses in a
  // snapshot of 2026-10-25 21:38, most of them at a loop's terminal, which is near its last stops as well as its first.
  if (seen < stops[0].dep - 120)
    return {
      delay: 0,
      late: 0,
      index: 0,
      frac: 0,
      offPath: 0,
      seen,
      ageSec,
      stale: ageSec > 240,
      vehicle,
      waiting: true,
    };
  const pr = projectOnStops(vehicle.lat, vehicle.lon, stops);
  if (pr.metres > 600) return null; // not on this trip's path (or a very different route shape)
  // placed further along than it could have gone since its start (in under half the scheduled time, starting up to two
  // minutes early): it is at its start, which a loop shares with its end (2026-10-25 21:38: 62 buses, 2 minutes after
  // their start, read as 15 minutes early 30 minutes along). It leaves when it leaves, late only once its time has passed.
  const schedHere = stops[pr.index].dep + pr.frac * Math.max(0, stops[pr.index + 1].arr - stops[pr.index].dep);
  if (schedHere - stops[0].dep > 300 && seen - (stops[0].dep - 120) < 0.5 * (schedHere - stops[0].dep)) {
    const late = Math.max(0, seen - stops[0].dep);
    return {
      delay: late,
      late,
      index: 0,
      frac: 0,
      offPath: pr.metres,
      seen,
      ageSec,
      stale: ageSec > 240,
      vehicle,
      waiting: true,
    };
  }
  // a train without GPS: when its call first named the station (or that station's time, when the change was not seen)
  let call: Call | null = null;
  if (vehicle.callSince != null && railTimes) {
    const k = stops.findIndex((s) => metres(s.lat, s.lon, vehicle.lat, vehicle.lon) <= AT_STATION);
    if (k >= 0) {
      const since = secondsOn(new Date(vehicle.callSince), day) + LAST_KM;
      call = { at: vehicle.callSeenChange ? since : Math.min(since, stops[k].arr), now: seen };
    }
  }
  const ahead =
    (railTimes &&
      railAhead(stops, pr, call ? call.at : seen, vehicle.lat, vehicle.lon, call, (st) =>
        cameAt(vehicle.trail, st, day),
      )) ||
    (busTimes && busAhead(stops, pr, seen, day, recordedAt.getTime(), vehicle.rideId));
  if (ahead) {
    // late is when it comes, against the one time the feed lists per station: arriving on time and standing its usual
    // stand is on time (a departure-based delay made every train late by its stand, 2026-10-25); a train standing at
    // the station already is late by when it leaves, against when an on-time train would (railAhead's `late`)
    const j = ahead.next,
      standing = ahead.at === j && j < stops.length - 1;
    const late = Math.max(
      -900,
      Math.min(
        5400,
        Math.round(ahead.late ?? (standing ? ahead.dep[j]! - stops[j].dep : ahead.arr[j]! - stops[j].arr)),
      ),
    );
    const delay = ahead.rail ? sureLate(late, (ahead.arr[j] ?? seen) - seen) : late;
    return {
      delay,
      late,
      rail: !!ahead.rail,
      index: ahead.index,
      frac: ahead.frac,
      offPath: pr.metres,
      seen,
      ageSec,
      stale: ageSec > 240,
      vehicle,
      arr: ahead.arr,
      dep: ahead.dep,
      at: ahead.at,
    };
  }
  let delay: number;
  if (pr.index === 0 && pr.frac < 0.05) delay = Math.max(0, seen - stops[0].dep);
  else {
    const a = stops[pr.index].dep,
      b = stops[pr.index + 1].arr;
    delay = seen - (a + pr.frac * Math.max(0, b - a));
  }
  delay = Math.max(-900, Math.min(5400, Math.round(delay)));
  return {
    delay,
    late: delay,
    index: pr.index,
    frac: pr.frac,
    offPath: pr.metres,
    seen,
    ageSec,
    stale: ageSec > 240,
    vehicle,
  };
}
/** A vehicle's time at one stop of its trip, the one time shown everywhere (liveAt): when (seconds on the service
 *  day), how late that is against the listed time there (s; a train's sure part only), whether the vehicle is past the
 *  stop, and whether its report is stale. */
export type LiveTime = { time: number; delay: number; passed: boolean; stale: boolean };
/** The live time at a stop of the trip, given a delay estimate; passed when the vehicle is beyond it. A train's time
 *  is its time at the station, late only by what we are sure of (sureLate; at the station it stands at, est.delay). */
export function liveAt(est: DelayEstimate | null, stops: readonly TimedStop[], stopIndex: number): LiveTime | null {
  if (!est) return null;
  const passed = est.index > stopIndex || (est.index === stopIndex && est.frac > 0.2);
  if (est.rail) {
    const late = railShown(est, stops)[stopIndex] ?? est.delay;
    return { time: stops[stopIndex].arr + late, delay: late, passed, stale: est.stale };
  }
  let own: number | null = null;
  if (est.dep)
    own =
      est.at === stopIndex ? (est.dep[stopIndex] ?? est.arr![stopIndex]) : (est.arr![stopIndex] ?? est.dep[stopIndex]);
  const time = own != null ? Math.round(own) : stops[stopIndex].dep + est.delay;
  return { time, delay: time - stops[stopIndex].dep, passed, stale: est.stale };
}
/** Rounded delay for display: minutes, "on time" within half a minute. */
export function delayMinutes(delay: number): number {
  return Math.round(delay / 60);
}
