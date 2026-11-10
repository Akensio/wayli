// How late a vehicle runs, and when it reaches each stop ahead: where it is along its trip, the learned running times
// of trains' sections (pipeline/railtimes.py) and of buses' (pipeline/bustimes.py, with a live correction from the
// buses that just ran a section), the delay against the timetable, and a stop's live time for the rider.
import { metres } from './geo.ts';
import { secondsOn } from './clock.ts';
import { nearestOnSegment, projectOnStops, scaleAt, type Projection } from './geo.ts';

/** A stop of a trip as the estimates read it (worker/trips.ts tripStopList; the page's TripStop carries more): where
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
  due?: number; // a train standing at a station: when it was due away (its time, or its usual stand after it came)
};
/** A train's times from here on, from the learned sections: arrival and departure at each later station. A train
 *  standing at a station (taken as having come at its time, or now if that is earlier) leaves as at any station ahead:
 *  not before its time, nor before its usual stand is over, nor before now. The feed's one time per station is about when a train pulls in, and at Tel Aviv Center it then stands some 4
 *  minutes: taken as leaving at its time, a train standing there read a minute later every minute it stood, and the
 *  next station early first, then late (2026-10-26, train 959: 08:18, then 08:23 for 08:21; it came at 08:21:20). */
function railAhead(stops: readonly TimedStop[], pr: Projection, seen: number, lat: number, lon: number): Ahead | null {
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
  let i: number, t: number, index: number, frac: number, due: number | undefined;
  if (at >= 0) {
    // standing at a station: it leaves after its stand (at its first station, at its time)
    arr[at] = Math.min(seen, stops[at].arr);
    if (at === n - 1) return { arr, dep, index: n - 2, frac: 1, next: at };
    due = Math.max(stops[at].dep, at > 0 ? arr[at]! + stand(at) : 0);
    dep[at] = Math.max(due, seen);
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
  return { arr, dep, index, frac, next: j, at, late, rail: true, due };
}
// A train's lateness is shown only as far as we are sure of it. Most small train delays are made up on the way (the
// timetable has slack), and a train does not leave a station before its time, so the rider is shown the timetable's
// time plus the lateness we are 85% sure of: the predicted lateness less a margin that grows with how far ahead the
// station is, from 2 minutes up, and beyond 30 minutes ahead only what the stations before it carry. Backtested on three mornings' raw minute
// files (measure/trainbacktest.mjs, its last line; 2026-10-21, 25 and 26): the point estimate showed a delay on 70% of
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
 *  which ride (`ride`; a bus's own runs are left out of its factor). The data worker builds these (worker/traffic.ts
 *  noteRoads) and may add fields of its own. */
export type RoadRun = { ratio: number; t: number; ride: string | number };
/** By section ("code>code"), the buses' runs over it in the last 15 minutes. */
export type RoadsNow = Map<string, RoadRun[]>;
let roadsNow: RoadsNow = new Map();
export function setRoadsNow(m: RoadsNow): void {
  roadsNow = m;
}
const ROADS_MS = 900e3,
  FADE_S = 1800,
  ROADS_MIN = 2, // one bus's run over a section is no evidence of how the road runs
  ROADS_BAND = 0.1; // a factor within this of 1 is read as 1: small swings of the median are noise, not traffic
/** The middle of the buses' ratios on a section (of two in the middle, their mean); the traffic on the map uses it too. */
export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b),
    n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
/** One vote per bus: the middle of each ride's own ratios, then the middle of those. A bus seen several times along a
 *  long section gave ratios from 0.3 to 3.7 within a quarter of an hour (crawling out of its terminal, then catching
 *  up), and three such readings from one bus outvoted the other (2026-11-07, the Levanda corridor red on a Saturday
 *  with two buses on it). */
export function rideMedian(runs: readonly RoadRun[]): number {
  const by = new Map<string | number, number[]>();
  for (const r of runs) {
    if (!by.has(r.ride)) by.set(r.ride, []);
    by.get(r.ride)!.push(r.ratio);
  }
  return median([...by.values()].map(median));
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
  const rs = v.filter((x) => x.ride !== ride && x.t <= seenMs + 120e3 && x.t > seenMs - ROADS_MS);
  const rides = new Set(rs.map((x) => x.ride)).size;
  if (rides < ROADS_MIN) return 1;
  const dev = ((rideMedian(rs) - 1) * rides) / (rides + 2);
  // the band taken out, not just cut off, so the factor moves smoothly as the median crosses it (measure/busbacktest.ts,
  // 2026-11-07: with the factor as it was, a third more of the minutes moved the time shown; it bought 2 to 3 points)
  return 1 + Math.sign(dev) * Math.max(0, Math.abs(dev) - ROADS_BAND);
}
/**
 * Where a vehicle is along its trip (geo.ts projectOnStops), read from where it was last placed when that is known
 * (`from`, the stretch of its last report; worker/vehicles.ts estimateFor): the earliest stretch from one before it on
 * that is about as near (AMBIGUOUS_M) as the nearest of all. A looping trip passes the same spot twice: without memory
 * a bus at its end read as at its start and the other way round, a third of the place jumps of 3 minutes or more
 * (measure/busbacktest.ts, 2026-11-07). When no stretch from there on comes near, the memory was wrong (or the fix is
 * off the trip), and the nearest of all stands.
 */
const AMBIGUOUS_M = 100;
export function placeOn(lat: number, lon: number, stops: readonly TimedStop[], from?: number | null): Projection {
  if (from == null || from < 1 || stops.length < 3) return projectOnStops(lat, lon, stops);
  const { kx, ky } = scaleAt(lat);
  const d: { f: number; d: number }[] = [];
  let best = Infinity;
  for (let i = 0; i < stops.length - 1; i++) {
    const ax = (stops[i].lon - lon) * kx,
      ay = (stops[i].lat - lat) * ky;
    d.push(nearestOnSegment(ax, ay, (stops[i + 1].lon - stops[i].lon) * kx, (stops[i + 1].lat - stops[i].lat) * ky));
    if (d[i].d < best) best = d[i].d;
  }
  for (let i = Math.min(from - 1, stops.length - 2); i < stops.length - 1; i++)
    if (d[i].d <= best + AMBIGUOUS_M) return { index: i, frac: d[i].f, metres: d[i].d };
  return projectOnStops(lat, lon, stops);
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
  lastIndex?: number | null; // the stretch the ride was last placed on (worker/vehicles.ts estimateFor), for placeOn
  sameSince?: number | null; // ms since when its position has been exactly the same (worker/vehicles.ts), if known
  stillSince?: number | null; // and since when it has stayed within 100 m of where it is
};
/** How late a vehicle runs and where it is (estimateDelay). Seconds on the service day throughout; "late" is always
 *  against the listed time at the same stop (docs/architecture.md, "Live times, end to end"). */
/** How old a report may be and still be trusted as it stands (seconds): a vehicle's report older than this is `stale`,
 *  and the result list stops reading a ride as due on it (state/results.ts due). */
export const FRESH_S = 240;
/**
 * No news past due: the one measure of how far a report can be trusted. Once a vehicle was due to move on from where it
 * is (`due`: when its trip has it leave that place), a report that shows no movement is less and less a report of a
 * running ride. Two signs, for every vehicle at every stop; nothing here knows a bus from a train or a first stop from
 * a later one, and without the worker's memory of the vehicle nothing is claimed.
 *  - The same position exactly (`sameSince`) for DEAD_S past due: a live GPS jitters even while the vehicle stands, so
 *    this is a unit repeating itself (a parked set, a dead receiver, a train that never ran). No estimate. Half of all
 *    train rides do it at some point and one bus ride in a thousand (2026-11-06, 2026-11-10); a train read from such a
 *    position, or placed by its next-stop field instead, was predicted worse than by the timetable alone
 *    (measure/trainbacktest.mjs).
 *  - Staying within 100 m (`stillSince`): past UNSURE_STILL_S its times are not certain (`stale`), past GONE_STILL_S
 *    it is more likely than not that it is not running, and it gets no estimate. Of the buses still standing 5 minutes
 *    past due 86% moved on; 10 minutes, 71%; 20 minutes, 52%; 25 minutes, 48% (two days of minute files, 360,000 still
 *    spans).
 */
export const DEAD_S = 120,
  UNSURE_STILL_S = 300,
  GONE_STILL_S = 1500;
function noNews(est: DelayEstimate, due: number, v: VehicleReport, day: string): DelayEstimate | null {
  const since = (ms: number | null | undefined): number =>
    ms == null ? 0 : est.seen - Math.max(due, secondsOn(new Date(ms), day));
  if (since(v.sameSince) >= DEAD_S || since(v.stillSince) > GONE_STILL_S) return null;
  return since(v.stillSince) > UNSURE_STILL_S ? { ...est, stale: true } : est;
}
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
  stale: boolean; // not certain: its report older than FRESH_S, or standing UNSURE_STILL_S past due
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
  // A bus waiting to start gets its times at the stops ahead from the same learned sections as one under way, from its
  // listed departure or now if that has passed (busAhead at the first stop): shown the timetable's times until it moved,
  // the time at every stop jumped the moment it did, 6 minutes later in the median (measure/busbacktest.ts, 2026-11-07:
  // 39% of all jumps of 3 minutes or more).
  // every estimate leaves through `done` with when, standing where it is, the vehicle was due to move on (noNews)
  const done = (est: DelayEstimate, due: number): DelayEstimate | null => noNews(est, due, vehicle, day);
  const waiting = (late: number, offPath: number): DelayEstimate | null => {
    const ahead = busTimes
      ? busAhead(stops, { index: 0, frac: 0, metres: offPath }, seen, day, recordedAt.getTime(), vehicle.rideId)
      : null;
    const est: DelayEstimate = {
      delay: late,
      late,
      index: 0,
      frac: 0,
      offPath,
      seen,
      ageSec,
      stale: ageSec > FRESH_S,
      vehicle,
      waiting: true,
      arr: ahead ? ahead.arr : undefined,
      dep: ahead ? ahead.dep : undefined,
    };
    return done(est, stops[0].dep); // waiting to start: due away at its time
  };
  if (seen < stops[0].dep - 120) return waiting(0, 0);
  const pr = placeOn(vehicle.lat, vehicle.lon, stops, vehicle.lastIndex);
  if (pr.metres > 600) return null; // not on this trip's path (or a very different route shape)
  // placed further along than it could have gone since its start (in under half the scheduled time, starting up to two
  // minutes early): it is at its start, which a loop shares with its end (2026-10-25 21:38: 62 buses, 2 minutes after
  // their start, read as 15 minutes early 30 minutes along). It leaves when it leaves, late only once its time has passed.
  // Not for a bus already seen under way (`lastIndex`): one running early went back to waiting, and every time with it.
  const schedHere = stops[pr.index].dep + pr.frac * Math.max(0, stops[pr.index + 1].arr - stops[pr.index].dep);
  if (
    !(vehicle.lastIndex != null && vehicle.lastIndex >= 1) &&
    schedHere - stops[0].dep > 300 &&
    seen - (stops[0].dep - 120) < 0.5 * (schedHere - stops[0].dep)
  )
    return waiting(Math.max(0, seen - stops[0].dep), pr.metres);
  const ahead =
    (railTimes && railAhead(stops, pr, seen, vehicle.lat, vehicle.lon)) ||
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
    // a train at its last station has nothing left to be due for; one standing at a station was due away at its time or
    // after its stand; anything else under way should be where the timetable has it by now
    const arrived = ahead.rail && ahead.at === stops.length - 1;
    return done(
      {
        delay,
        late,
        rail: !!ahead.rail,
        index: ahead.index,
        frac: ahead.frac,
        offPath: pr.metres,
        seen,
        ageSec,
        stale: ageSec > FRESH_S,
        vehicle,
        arr: ahead.arr,
        dep: ahead.dep,
        at: ahead.at,
      },
      arrived ? Infinity : (ahead.due ?? schedHere),
    );
  }
  let delay: number;
  if (pr.index === 0 && pr.frac < 0.05) delay = Math.max(0, seen - stops[0].dep);
  else {
    const a = stops[pr.index].dep,
      b = stops[pr.index + 1].arr;
    delay = seen - (a + pr.frac * Math.max(0, b - a));
  }
  delay = Math.max(-900, Math.min(5400, Math.round(delay)));
  return done(
    {
      delay,
      late: delay,
      index: pr.index,
      frac: pr.frac,
      offPath: pr.metres,
      seen,
      ageSec,
      stale: ageSec > FRESH_S,
      vehicle,
    },
    schedHere,
  );
}
/** A vehicle's time at one stop of its trip, the one time shown everywhere (liveAt): when (seconds on the service
 *  day), how late that is against the listed time there (s; a train's sure part only), whether the vehicle is past the
 *  stop, and whether its report is stale. */
export type LiveTime = { time: number; delay: number; passed: boolean; stale: boolean };
/** The live time at a stop of the trip, given a delay estimate; passed when the vehicle is beyond it. A train's time
 *  is its time at the station, late only by what we are sure of (sureLate; at the station it stands at, est.delay). */
/** Whether a vehicle on the stretch from stop `index` (`frac` of the way along it) is past stop `i`: beyond it, or at it
 *  and more than a fifth of the way on (liveAt's `passed`; the planner's `ahead` is its opposite at the boarding stop). */
export const passedStop = (index: number, frac: number, i: number): boolean => index > i || (index === i && frac > 0.2);
export function liveAt(est: DelayEstimate | null, stops: readonly TimedStop[], stopIndex: number): LiveTime | null {
  if (!est) return null;
  const passed = passedStop(est.index, est.frac, stopIndex);
  if (est.rail) {
    const late = railShown(est, stops)[stopIndex] ?? est.delay;
    return { time: stops[stopIndex].arr + late, delay: late, passed, stale: est.stale };
  }
  let own: number | null = null;
  if (est.dep)
    own =
      est.at === stopIndex ? (est.dep[stopIndex] ?? est.arr![stopIndex]) : (est.arr![stopIndex] ?? est.dep[stopIndex]);
  // at the stop itself (its own time there is behind the bus): it is there now, not at the listed time plus its
  // lateness at the next stop, which read minutes off (measure/busbacktest.ts, 2026-11-07)
  if (own == null && est.dep && est.index === stopIndex && !passed) own = est.seen;
  const time = own != null ? Math.round(own) : stops[stopIndex].dep + est.delay;
  return { time, delay: time - stops[stopIndex].dep, passed, stale: est.stale };
}
/** Rounded delay for display: minutes, "on time" within half a minute. */
export function delayMinutes(delay: number): number {
  return Math.round(delay / 60);
}
