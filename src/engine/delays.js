// How late a vehicle runs, and when it reaches each stop ahead: where it is along its trip, the learned running times
// of trains' sections (pipeline/railtimes.py) and of buses' (pipeline/bustimes.py, with a live correction from the
// buses that just ran a section), the delay against the timetable, and a stop's live time for the rider.
import { metres } from './geo.js';
import { secondsOn } from './clock.js';
import { projectOnStops } from './geo.js';

// ------------------------------------------------------------------ trains: learned running times
// A train does not run at one speed between stations: it pulls out slowly, runs fast, brakes, and some sections are
// slow. pipeline/railtimes.py learns from the last days' positions how long each section between two stations
// really takes and how the time spreads along it, and how long trains stand at each station. With it a train's
// position says when it reaches the next station, and from there each later one: it leaves a station no earlier
// than the timetable, after its usual stand. Sections never seen fall back to the timetable's.
/** @type {{ s: Record<string, number[]>, d: Record<string, number> } | null}
 *  s: "code>code" -> [run, g0..g10]; d: code -> dwell. (An `h`, seconds a late train was taken to make up per station,
 *  is ignored: it made every prediction early, 2026-10-25.) */
let railTimes = null;
export function setRailTimes(m) {
  railTimes = m && m.s ? m : null;
}
const AT_STATION = 300; // m: a train this close to a station is at it (the same in pipeline/railtimes.py)
const section = (stops, k) =>
  railTimes && stops[k].code != null && stops[k + 1].code != null
    ? railTimes.s[`${stops[k].code}>${stops[k + 1].code}`] || null
    : null;
const along = (g, x) => {
  const p = x * 10,
    i = Math.min(9, Math.floor(p));
  return g[i + 1] + (g[i + 2] - g[i + 1]) * (p - i);
}; // g[0] is the run
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
function railAhead(stops, pr, seen, lat, lon, call = null, cameAtStation = () => null) {
  const n = stops.length,
    k = pr.index;
  let at = -1;
  if (metres(lat, lon, stops[k].lat, stops[k].lon) <= AT_STATION) at = k;
  else if (metres(lat, lon, stops[k + 1].lat, stops[k + 1].lon) <= AT_STATION) at = k + 1;
  if (!section(stops, Math.min(at >= 0 ? at : k, n - 2))) return null;
  const run = (j) => {
    const m = section(stops, j);
    return m ? m[0] : Math.max(0, stops[j + 1].arr - stops[j].dep);
  };
  const stand = (j) => {
    const d = railTimes.d[stops[j].code];
    return d != null ? d : stops[j].dep - stops[j].arr;
  };
  const arr = new Array(n).fill(null),
    dep = new Array(n).fill(null);
  let i, t, index, frac;
  if (at >= 0 && call) {
    // without GPS: reached it then, stands, and is not at the next one before now + the last km
    arr[at] = seen;
    if (at === n - 1) return { arr, dep, index: n - 2, frac: 1, next: at };
    dep[at] = Math.max(stops[at].dep, seen + stand(at), call.now + LAST_KM - run(at));
    t = dep[at] + run(at);
    i = at + 1;
    index = at;
    frac = 0;
  } else if (at >= 0) {
    // standing at a station: it leaves after its stand (at its first station, at its time)
    const came = cameAtStation(stops[at]);
    arr[at] = came != null ? Math.min(came, seen) : Math.min(seen, stops[at].arr);
    if (at === n - 1) return { arr, dep, index: n - 2, frac: 1, next: at };
    dep[at] = Math.max(stops[at].dep, at > 0 ? arr[at] + stand(at) : 0, seen);
    t = dep[at] + run(at);
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
    t = dep[i] + run(i);
  }
  // late, at the station it is at or comes to next: how late it pulls in; standing there, also how much later it leaves
  // than an on-time train would (at its time, or its stand after its time)
  const j = at >= 0 ? at : next;
  const late =
    at >= 0 && at < n - 1
      ? Math.max(arr[at] - stops[at].arr, dep[at] - Math.max(stops[at].dep, at > 0 ? stops[at].arr + stand(at) : 0))
      : arr[j] - stops[j].arr;
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
export function sureLate(late, ahead) {
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
function railShown(est, stops) {
  if (est.shown) return est.shown;
  const n = stops.length,
    out = new Array(n).fill(null),
    j0 = est.at >= 0 ? est.at : est.index + 1;
  for (let i = j0; i < n; i++) {
    const a = est.arr[i];
    if (a == null) break;
    let late = i === j0 && est.at === i ? est.delay : sureLate(a - stops[i].arr, a - est.seen);
    if (i > j0 && est.dep[i - 1] != null) {
      // the station before's shown time plus the run between the two (predicted departure to predicted arrival)
      const carried = stops[i - 1].arr + out[i - 1] + CATCH_UP * (a - est.dep[i - 1]) - stops[i].arr;
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
function cameAt(trail, st, day) {
  if (!trail || !trail.length) return null;
  const inside = (f) => metres(f[1], f[2], st.lat, st.lon) <= AT_STATION;
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
/** @type {{ idx: Map<string, number>, cells: Uint8Array, bands: number, kinds: number } | null} */
let busTimes = null;
/** The learned bus times (the file pipeline/bustimes.py writes, unpacked): a header, the sections' stop codes, the times. */
export function parseBusTimes(buf) {
  const dv = new DataView(buf),
    hl = dv.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const n = head.n,
    a = new Uint32Array(buf, 4 + hl, n),
    b = new Uint32Array(buf, 4 + hl + 4 * n, n);
  const idx = new Map();
  for (let i = 0; i < n; i++) idx.set(`${a[i]}>${b[i]}`, i);
  return {
    idx,
    cells: new Uint8Array(buf, 4 + hl + 8 * n, n * head.kinds * head.bands),
    bands: head.bands,
    kinds: head.kinds,
    built: head.built,
  };
}
export function setBusTimes(m) {
  busTimes = m;
}
export const hasBusTimes = () => !!busTimes;
/** 0 Sunday to Thursday, 1 Friday, 2 Saturday, for a service day YYYYMMDD. */
const kindOf = (day) => {
  const w = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8))).getUTCDay();
  if (w === 5) return 1;
  if (w === 6) return 2;
  return 0;
};
const bandOf = (sec) => {
  const h = Math.floor(sec / 3600);
  return h < 5 ? 0 : Math.min(busTimes.bands - 1, h - 5);
};
const decode = (v) => {
  if (!v) return null;
  return v <= 150 ? 2 * v : 300 + 15 * (v - 150);
};
/** The learned time of section k (stop k to stop k+1) for a bus there at `at`, else null. */
function busRun(stops, k, at, kind) {
  const i =
    busTimes && stops[k].code && stops[k + 1].code
      ? busTimes.idx.get(`${stops[k].code}>${stops[k + 1].code}`)
      : undefined;
  return i === undefined ? null : decode(busTimes.cells[(i * busTimes.kinds + kind) * busTimes.bands + bandOf(at)]);
}
/** How long section k usually takes at `at`: learned, else the timetable's. */
export function usualRun(stops, k, at, day) {
  const r = busTimes ? busRun(stops, k, at, kindOf(day)) : null;
  return r != null ? r : Math.max(0, stops[k + 1].arr - stops[k].dep);
}
/** How fast the section runs at its best in the day's hours (06:00 to 22:00) on that kind of day, else null: free flow
 *  with passengers boarding, the second-fastest hour (the fastest of 16 medians is low by chance). The night, with nobody
 *  at the stops, is faster still: measured against it every road read slow at 10:00 (Tel Aviv, 2026-10-22: the median
 *  section 1.66 times its night time). */
export function freeRun(code1, code2, day) {
  const i = busTimes ? busTimes.idx.get(`${code1}>${code2}`) : undefined;
  if (i === undefined) return null;
  const o = (i * busTimes.kinds + kindOf(day)) * busTimes.bands,
    v = [];
  for (let b = 1; b < Math.min(busTimes.bands - 1, 18); b++) {
    const x = decode(busTimes.cells[o + b]);
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
/** @type {Map<string, { ratio: number, t: number, ride: string }[]>} */
let roadsNow = new Map();
export function setRoadsNow(m) {
  roadsNow = m;
}
const ROADS_MS = 900e3,
  FADE_S = 1800;
/** The middle of the buses' ratios on a section (of two in the middle, their mean); the traffic on the map uses it too. */
export function median(xs) {
  const s = [...xs].sort((a, b) => a - b),
    n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
/** The live factor of a section for a vehicle seen at `seenMs` (its own runs left out). */
function roadFactor(code1, code2, seenMs, ride) {
  const v = roadsNow.get(`${code1}>${code2}`);
  if (!v) return 1;
  const rs = v.filter((x) => x.ride !== ride && x.t <= seenMs + 120e3 && x.t > seenMs - ROADS_MS).map((x) => x.ratio);
  if (!rs.length) return 1;
  const m = median(rs);
  return 1 + ((m - 1) * rs.length) / (rs.length + 2);
}
/** A bus's arrival at each later stop, from where it is and the learned sections; null when none is known ahead. */
function busAhead(stops, pr, seen, day, seenMs, ride) {
  const n = stops.length,
    kind = kindOf(day);
  const run = (j, at) => {
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
  const arr = new Array(n).fill(null);
  let t, i;
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

/**
 * How late a vehicle runs, from its position against its trip's schedule: the scheduled time at the
 * point of the trip it is at, compared with when it was seen there. A vehicle still at the first stop
 * is late only once its start time has passed. A train with learned sections, or a bus with learned sections
 * ahead, gets its time at each later stop instead (`arr`, `dep`), and its delay is the one at the next stop.
 * `late` is the best estimate, seconds; `delay` is what the rider is shown: the same for a bus, and for a train only
 * what we are sure of (sureLate). A train's `trail` ([ms, lat, lon] of its recent fixes) says when it pulled in to
 * the station it stands at.
 */
export function estimateDelay(vehicle, stops, day) {
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
  let call = null;
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
      Math.min(5400, Math.round(ahead.late ?? (standing ? ahead.dep[j] - stops[j].dep : ahead.arr[j] - stops[j].arr))),
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
  let delay;
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
/** The live time at a stop of the trip, given a delay estimate; passed when the vehicle is beyond it. A train's time
 *  is its time at the station, late only by what we are sure of (sureLate; at the station it stands at, est.delay). */
export function liveAt(est, stops, stopIndex) {
  if (!est) return null;
  const passed = est.index > stopIndex || (est.index === stopIndex && est.frac > 0.2);
  if (est.rail) {
    const late = railShown(est, stops)[stopIndex] ?? est.delay;
    return { time: stops[stopIndex].arr + late, delay: late, passed, stale: est.stale };
  }
  let own = null;
  if (est.dep)
    own =
      est.at === stopIndex ? (est.dep[stopIndex] ?? est.arr[stopIndex]) : (est.arr[stopIndex] ?? est.dep[stopIndex]);
  const time = own != null ? Math.round(own) : stops[stopIndex].dep + est.delay;
  return { time, delay: time - stops[stopIndex].dep, passed, stale: est.stale };
}
/** Rounded delay for display: minutes, "on time" within half a minute. */
export function delayMinutes(delay) {
  return Math.round(delay / 60);
}
