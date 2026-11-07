// How steady and how right the app's bus times are, in hindsight: a morning's raw SIRI minute files are replayed through
// the app's own code (the data worker's snapVehicles, the road model's noteRoads, delays.ts estimateDelay and liveAt),
// minute by minute as the app would have seen them, and every time shown for a bus at a stop ahead is kept. Then:
// how much that time moved from one minute to the next (what a rider watching the stop sees), how far the times were
// from when the bus really passed the stop, by how far ahead they looked, and what the big jumps were made of.
// Measuring, not testing (2026-11-07, the maintainer: "our time estimates of buses tend to change completely and
// quickly, users can't really trust us").
//
//   node --max-old-space-size=6144 --experimental-strip-types measure/busbacktest.ts 20261106 08:00 08:40 [--no-roads] [--no-bustimes] [--examples] [--site URL]
//
// An hour's window fits in 6 GB (every bus, stop and minute is kept); a past day's timetable is no longer on the site,
// so serve a local data/ with its own manifest.json and pass it as --site. 2026-11-07, Friday 2026-11-06 08:00-08:40,
// all of Israel: the time shown moved under 30 s in 62% of minutes, 2 min or more in 6%; a stop watched for 20 minutes
// saw it wander 2.5 min (median), going back and forth in 22% of cases; jumps of 3 min or more came 46% from the bus's
// place on its trip jumping, 39% from the switch from waiting to start (the timetable's times) to under way (the
// model's, 6 min later); 0-5 min ahead 80% within 2 min of the truth, 20-40 min ahead 37% and 2.3 min early.
//
// The minute files come from Hasadna (https://open-bus-siri-requester.hasadna.org.il/, YYYY/MM/DD/HH/MM.br, UTC) and
// are kept in data/siri/; the day's timetable and shapes are read from the site, the learned bus times from
// data/bustimes.bin.gz (the site's). --no-roads leaves out the live road factor, --no-bustimes the learned sections
// (the bus's delay now carried to every stop ahead, as the app does without them).
export {}; // a module, so the top level may await
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const pos = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').match(/^--(site)$/));
const [day, from = '07:30', to = '10:30'] = pos;
if (!/^\d{8}$/.test(day || '')) {
  console.error(
    'usage: node --experimental-strip-types measure/busbacktest.ts YYYYMMDD [HH:MM] [HH:MM] [--no-roads] [--no-bustimes]',
  );
  process.exit(2);
}
const SITE = opt('site', 'https://akensio.github.io/wayli/');
(globalThis as any).self = { postMessage() {}, location: { href: SITE } };
const { dataOps } = await import('../src/worker/data.ts');
const { snapVehicles, estimateFor } = await import('../src/worker/vehicles.ts');
const { noteRoads } = await import('../src/worker/traffic.ts');
const { tripFor, tripStopList } = await import('../src/worker/trips.ts');
const delays = await import('../src/engine/delays.ts');
const clock = await import('../src/engine/clock.ts');
const { projectOnStops, metres } = await import('../src/engine/geo.ts');

// the data, as the app has it
const manifest = await (await fetch(SITE + 'data/manifest.json', { cache: 'no-store' })).json();
const entry = manifest.days.find((d: any) => d.date === day);
if (!entry) {
  console.error(`the site has no timetable for ${day} (it serves ${manifest.days.map((d: any) => d.date).join(' ')})`);
  process.exit(2);
}
const file = (f: { file: string; hash?: string; built?: string }) =>
  `${SITE}data/${f.file}?v=${f.hash || f.built || ''}`;
await dataOps.loadTimetable({ url: file(entry), bytes: entry.bytes });
await dataOps.loadShapes({ url: file(manifest.shapes), bytes: manifest.shapes.bytes });
if (!flag('no-bustimes')) {
  const b = gunzipSync(readFileSync('data/bustimes.bin.gz')); // set directly: the worker's hook would read the live relay
  delays.setBusTimes(delays.parseBusTimes(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
}
const ROADS = !flag('no-roads') && !flag('no-bustimes');

// the window, Israel time to UTC
const iso = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
const offset = (ms: number) => {
  const p = clock.ilParts(new Date(ms));
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
};
const utc = (hm: string) => {
  const naive = Date.parse(`${iso}T${hm}:00Z`);
  return naive - offset(naive);
};
const T0 = utc(from),
  T1 = utc(to);

// the minute files, fetched where missing
const p2 = (n: number) => String(n).padStart(2, '0');
const minutes: { t: number; f: string }[] = []; // read twice, for the truth and the replay: all of them parsed at once is too much
const read = (f: string): any => {
  try {
    return JSON.parse(brotliDecompressSync(readFileSync(f)).toString());
  } catch {
    return null; // a broken minute
  }
};
for (let t = T0 - 30 * 60e3; t <= T1 + 90 * 60e3; t += 60e3) {
  const d = new Date(t),
    path = `${d.getUTCFullYear()}/${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}/${p2(d.getUTCHours())}/${p2(d.getUTCMinutes())}`;
  const f = `data/siri/${path}.br`;
  if (!existsSync(f)) {
    const r = await fetch(`https://open-bus-siri-requester.hasadna.org.il/${path}.br`).catch(() => null);
    if (!r || !r.ok) continue;
    mkdirSync(f.slice(0, f.lastIndexOf('/')), { recursive: true });
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  minutes.push({ t, f });
}
console.log(
  `${day} ${from}-${to}: ${minutes.length} minute files${ROADS ? ', with the road factor' : ', no road factor'}${flag('no-bustimes') ? ', no learned sections' : ''}`,
);

type Stops = ReturnType<typeof tripStopList>['stops'];
const tripCache = new Map<string, Stops | null>();
function stopsOf(lineRef: string, start: Date): Stops | null {
  const key = `${lineRef}/${start.getTime()}`;
  if (tripCache.has(key)) return tripCache.get(key)!;
  const t = tripFor(lineRef, clock.secondsOn(start, day));
  const s = t < 0 ? null : tripStopList(t).stops;
  tripCache.set(key, s);
  return s;
}

// what happened: when each bus really passed each stop of its trip. Every fix of the ride, in time order (a repeated
// position dropped), placed on the trip; the stop is passed from the first fix beyond it (liveAt's own rule), and only
// counted when the fix before was not beyond it yet (so a bus first seen far along does not "pass" everything at once)
// and the fix after is beyond it too (a single fix read on a later stretch of a looping trip passes nothing).
type Fix = { ms: number; lat: number; lon: number };
const fixes = new Map<string, Fix[]>();
for (const { f } of minutes)
  for (const d of read(f)?.Siri?.ServiceDelivery?.StopMonitoringDelivery || [])
    for (const x of d.MonitoredStopVisit || []) {
      const m = x.MonitoredVehicleJourney;
      if (!m || String(m.OperatorRef) === '2' || !m.VehicleLocation) continue;
      const ride = `${m.LineRef}/${m.OriginAimedDepartureTime}`;
      const fx = {
        ms: Date.parse(x.RecordedAtTime),
        lat: +m.VehicleLocation.Latitude,
        lon: +m.VehicleLocation.Longitude,
      };
      if (!(fx.ms > 0) || !fx.lat || !fx.lon) continue;
      if (!fixes.has(ride)) fixes.set(ride, []);
      fixes.get(ride)!.push(fx);
    }
const passedAt = (pr: { index: number; frac: number }, i: number) => pr.index > i || (pr.index === i && pr.frac > 0.2);
const truth = new Map<string, (number | null)[]>(); // ride -> per stop, when the bus passed it (s on the day)
for (const [ride, fs] of fixes) {
  const i = ride.indexOf('/');
  const stops = stopsOf(ride.slice(0, i), new Date(ride.slice(i + 1)));
  if (!stops) continue;
  fs.sort((a, b) => a.ms - b.ms);
  const arr: (number | null)[] = new Array(stops.length).fill(null);
  let prev: ReturnType<typeof projectOnStops> | null = null;
  for (let k = 0; k < fs.length; k++) {
    const f = fs[k];
    if (k && f.lat === fs[k - 1].lat && f.lon === fs[k - 1].lon) continue; // a repeated fix
    const pr = projectOnStops(f.lat, f.lon, stops);
    if (pr.metres > 600) {
      prev = null;
      continue;
    }
    // passed from this fix when the next fix on the path is beyond the stop too (one fix read on a later stretch of a
    // looping trip, then back, passes nothing); the last fix stands alone
    let next: ReturnType<typeof projectOnStops> | null = null;
    for (let m = k + 1; m < fs.length && !next; m++) {
      const q = projectOnStops(fs[m].lat, fs[m].lon, stops);
      if (q.metres <= 600) next = q;
    }
    if (prev)
      for (let s = 0; s < stops.length; s++)
        if (arr[s] == null && passedAt(pr, s) && !passedAt(prev, s) && (!next || passedAt(next, s)))
          arr[s] = clock.secondsOn(new Date(f.ms), day);
    prev = pr;
  }
  truth.set(ride, arr);
}

// minute by minute, as the app would have seen it: the clock set to a minute after the snapshot (the relay's age)
type Sample = {
  ride: string;
  i: number;
  t: number;
  now: number;
  p: number;
  truth: number;
  sched: number;
  index: number;
  frac: number;
  late: number;
  waiting: boolean;
  stale: boolean;
  seen: number;
  dep0: number;
  n: number;
  lat: number;
  lon: number;
  age: number;
};
const samples: Sample[] = [];
const dup = { minutes: 0, apart: 0 };
const realNow = Date.now;
for (const { t, f } of minutes) {
  const j = read(f);
  if (!j) continue;
  Date.now = () => t + 60e3;
  const vehicles = snapVehicles(j, t);
  if (ROADS) noteRoads(vehicles);
  if (t < T0 || t > T1) continue;
  const now = clock.secondsOn(new Date(t + 60e3), day);
  // the same ride reported more than once in a minute (two vehicles, or one twice): the app takes whichever it meets
  const seenRide = new Map<string, { lat: number; lon: number }>();
  for (const v of vehicles) {
    if (v.operator === 2) continue;
    const o = seenRide.get(v.rideId);
    if (!o) seenRide.set(v.rideId, v);
    else {
      dup.minutes++;
      if (metres(o.lat, o.lon, v.lat, v.lon) > 200) dup.apart++;
    }
  }
  for (const v of vehicles) {
    if (v.operator === 2 || v.atStop) continue;
    const stops = stopsOf(v.lineRef, v.scheduledStart),
      tru = truth.get(v.rideId);
    if (!stops || !tru) continue;
    const est = estimateFor(v, stops, day);
    if (!est) continue;
    for (let i = 0; i < stops.length; i++) {
      if (tru[i] == null) continue;
      const at = delays.liveAt(est, stops, i);
      if (!at || at.passed) continue;
      samples.push({
        ride: v.rideId,
        i,
        t,
        now,
        p: at.time,
        truth: tru[i]!,
        sched: stops[i].arr,
        index: est.index,
        frac: est.frac,
        late: est.late,
        waiting: !!est.waiting,
        stale: est.stale,
        seen: est.seen,
        dep0: stops[0].dep,
        n: stops.length,
        lat: v.lat,
        lon: v.lon,
        age: est.ageSec,
      });
    }
  }
}
Date.now = realNow;

// ---- the numbers
const q = (xs: number[], p: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(0) + '%' : '-');
const min = (s: number) => (s / 60).toFixed(1);
const ahead = samples.filter((s) => s.truth > s.now); // the bus had not passed the stop yet
const ghosts = samples.length - ahead.length;
console.log(
  `rides reported twice in one minute: ${dup.minutes} ride-minutes, ${dup.apart} with the two reports over 200 m apart`,
);
console.log(
  `${samples.length} times shown (bus, stop, minute); ${pct(ghosts, samples.length)} for a stop the bus had already passed (shown as still coming)`,
);

// 1. how the time shown moved from one minute to the next, for the same bus and stop
const bySeries = new Map<string, Sample[]>();
for (const s of ahead) {
  const k = `${s.ride}|${s.i}`;
  if (!bySeries.has(k)) bySeries.set(k, []);
  bySeries.get(k)!.push(s);
}
type Move = { d: number; h: number; a: Sample; b: Sample };
const moves: Move[] = [];
for (const ss of bySeries.values()) {
  ss.sort((a, b) => a.t - b.t);
  for (let k = 1; k < ss.length; k++)
    if (ss[k].t - ss[k - 1].t === 60e3)
      moves.push({ d: ss[k].p - ss[k - 1].p, h: ss[k - 1].truth - ss[k - 1].now, a: ss[k - 1], b: ss[k] });
}
const ad = moves.map((m) => Math.abs(m.d));
console.log(`\nMinute to minute, the same bus at the same stop (${moves.length} pairs): the time shown moved`);
console.log(
  `  under 30 s ${pct(ad.filter((x) => x < 30).length, ad.length)}, 30 s to 2 min ${pct(ad.filter((x) => x >= 30 && x < 120).length, ad.length)}, 2 to 5 min ${pct(ad.filter((x) => x >= 120 && x < 300).length, ad.length)}, 5 min or more ${pct(ad.filter((x) => x >= 300).length, ad.length)}; median ${min(q(ad, 0.5))} min, 90th percentile ${min(q(ad, 0.9))} min`,
);
console.log(
  `  later ${pct(moves.filter((m) => m.d >= 30).length, moves.length)}, earlier ${pct(moves.filter((m) => m.d <= -30).length, moves.length)}`,
);
// as a countdown: "in N min" should fall by one a minute
const cd = moves.map((m) => Math.round((m.b.p - m.b.now) / 60) - Math.round((m.a.p - m.a.now) / 60));
console.log(
  `  as "in N min": N fell by one ${pct(cd.filter((x) => x === -1).length, cd.length)}, stood or fell by two ${pct(cd.filter((x) => x === 0 || x === -2).length, cd.length)}, rose ${pct(cd.filter((x) => x > 0).length, cd.length)}, jumped by 3 or more either way ${pct(cd.filter((x) => Math.abs(x + 1) >= 3).length, cd.length)}`,
);
const hb: [string, number, number][] = [
  ['0-5 min ahead', 0, 300],
  ['5-10', 300, 600],
  ['10-20', 600, 1200],
  ['20-40', 1200, 2400],
];
for (const [name, lo, hi] of hb) {
  const ms = moves.filter((m) => m.h >= lo && m.h < hi).map((m) => Math.abs(m.d));
  if (ms.length)
    console.log(
      `  ${name}: ${ms.length} pairs, moved 2 min or more ${pct(ms.filter((x) => x >= 120).length, ms.length)}, 5 or more ${pct(ms.filter((x) => x >= 300).length, ms.length)}`,
    );
}
// what the big jumps were made of
const big = moves.filter((m) => Math.abs(m.d) >= 180);
const why = { projection: 0, waiting: 0, stale: 0, model: 0 };
for (const m of big) {
  if (m.a.waiting !== m.b.waiting) why.waiting++;
  else if (Math.abs(m.b.index - m.a.index) >= 2 || m.b.index < m.a.index) why.projection++;
  else if (m.a.stale !== m.b.stale) why.stale++;
  else why.model++;
}
if (flag('examples')) {
  // a few of each kind, one per ride, to see the mechanism
  const hm = (sec: number) => clock.hhmm(sec);
  const show = (m: Move, kind: string) => {
    const a = m.a,
      b = m.b;
    console.log(
      `    ${kind}: ride ${a.ride} stop ${a.i}/${a.n} at ${hm(a.now)}: shown ${hm(a.p)} -> ${hm(b.p)} (came ${hm(a.truth)}, listed ${hm(a.sched)}); place ${a.index}+${a.frac.toFixed(2)} -> ${b.index}+${b.frac.toFixed(2)}, late ${min(a.late)} -> ${min(b.late)} min, waiting ${a.waiting} -> ${b.waiting}, report ${hm(a.seen)} -> ${hm(b.seen)}, first stop listed ${hm(a.dep0)}`,
    );
  };
  const seenRides = new Set<string>();
  const counts = { projection: 0, waiting: 0, model: 0 };
  const kindOf = (m: Move): string => {
    if (m.a.waiting !== m.b.waiting) return 'waiting';
    if (Math.abs(m.b.index - m.a.index) >= 2 || m.b.index < m.a.index) return 'projection';
    return m.a.stale !== m.b.stale ? 'stale' : 'model';
  };
  for (const m of big) {
    const kind = kindOf(m);
    if (kind === 'stale' || counts[kind as keyof typeof counts] >= 8 || seenRides.has(m.a.ride)) continue;
    seenRides.add(m.a.ride);
    counts[kind as keyof typeof counts]++;
    show(m, kind);
  }
  // the waiting flips by direction and where the bus was
  const wf = big.filter((m) => m.a.waiting !== m.b.waiting);
  const toRun = wf.filter((m) => m.a.waiting && !m.b.waiting);
  console.log(
    `  waiting flips: to under way ${toRun.length} (bus then placed at stretch 0: ${toRun.filter((m) => m.b.index === 0).length}, beyond: ${toRun.filter((m) => m.b.index > 0).length}), back to waiting ${wf.length - toRun.length}`,
  );
  const pj = big.filter(
    (m) => m.a.waiting === m.b.waiting && (Math.abs(m.b.index - m.a.index) >= 2 || m.b.index < m.a.index),
  );
  console.log(
    `  place jumps: backwards ${pj.filter((m) => m.b.index < m.a.index).length}, forwards by 2+ stretches ${pj.filter((m) => m.b.index >= m.a.index + 2).length}; of all of them, the report itself is the same minute's ${pj.filter((m) => Math.abs(m.b.seen - m.a.seen) <= 90).length}`,
  );
}
// the start of a trip: from the timetable's times while it waits to the model's once it moves
const starts = big.filter((m) => m.a.waiting && !m.b.waiting && m.b.index === 0).map((m) => m.d);
console.log(
  `  of the switches from waiting to under way at the first stop (${starts.length}): the time shown moved later ${pct(starts.filter((d) => d > 0).length, starts.length)}, median move ${min(q(starts.map(Math.abs), 0.5))} min`,
);
// place jumps: did the bus itself move that far between the two reports, or did the same spot read as another stretch?
const pjAll = big.filter(
  (m) => m.a.waiting === m.b.waiting && (Math.abs(m.b.index - m.a.index) >= 2 || m.b.index < m.a.index),
);
const still = pjAll.filter((m) => metres(m.a.lat, m.a.lon, m.b.lat, m.b.lon) < 250);
console.log(
  `  of the place jumps (${pjAll.length}): the bus's reported position moved under 250 m ${pct(still.length, pjAll.length)} (the same spot read as another stretch of the trip), of those backwards ${pct(still.filter((m) => m.b.index < m.a.index).length, still.length)}`,
);
const ghostAll = samples.filter((s) => s.truth <= s.now);
console.log(
  `  of the times shown for a stop already passed: the bus read as waiting to start ${pct(ghostAll.filter((s) => s.waiting).length, ghostAll.length)}, placed behind the stop on its trip ${pct(ghostAll.filter((s) => !s.waiting && s.index < s.i).length, ghostAll.length)}, at it ${pct(ghostAll.filter((s) => !s.waiting && s.index === s.i).length, ghostAll.length)}`,
);
const ghostAge = ghostAll.map((s) => s.age);
console.log(
  `  of the times shown for a stop already passed: report under 90 s old ${pct(ghostAge.filter((a) => a < 90).length, ghostAge.length)}, 90 s to 4 min ${pct(ghostAge.filter((a) => a >= 90 && a < 240).length, ghostAge.length)}, older (shown as stale) ${pct(ghostAge.filter((a) => a >= 240).length, ghostAge.length)}`,
);
const atStop = big.filter((m) => m.b.index === m.b.i || m.a.index === m.a.i);
console.log(
  `  jumps of 3 min or more with the bus at that very stop (its time there then falls back to the listed time plus its lateness at the next): ${pct(atStop.length, big.length)}`,
);
console.log(
  `  jumps of 3 min or more: ${big.length} (${pct(big.length, moves.length)}); of them the bus's place on its trip jumped ${pct(why.projection, big.length)}, it switched between waiting to start and under way ${pct(why.waiting, big.length)}, its report went stale or fresh ${pct(why.stale, big.length)}, the rest (the sections' times, the road factor, the position moving within a stretch) ${pct(why.model, big.length)}`,
);

// 2. a stop watched for its last 20 minutes: how far the time shown wandered
const swings: number[] = [],
  flips: number[] = [];
for (const ss of bySeries.values()) {
  const w = ss.filter((s) => s.truth - s.now <= 1200 && s.truth - s.now > 0);
  if (w.length < 5) continue;
  const ps = w.map((s) => s.p);
  swings.push(Math.max(...ps) - Math.min(...ps));
  let f = 0;
  for (let k = 2; k < ps.length; k++)
    if (
      (ps[k] - ps[k - 1]) * (ps[k - 1] - ps[k - 2]) < 0 &&
      Math.abs(ps[k] - ps[k - 1]) >= 60 &&
      Math.abs(ps[k - 1] - ps[k - 2]) >= 60
    )
      f++;
  flips.push(f);
}
console.log(
  `\nA stop watched over the bus's last 20 minutes (${swings.length} bus-stop pairs with 5+ minutes seen): the time shown wandered`,
);
console.log(
  `  median ${min(q(swings, 0.5))} min between its lowest and highest, 90th percentile ${min(q(swings, 0.9))} min; pairs where it went back and forth by a minute or more at least once ${pct(flips.filter((f) => f > 0).length, flips.length)}, three times or more ${pct(flips.filter((f) => f >= 3).length, flips.length)}`,
);

// 3. right or wrong, in hindsight, by how far ahead the time looked
console.log(
  `\nAgainst when the bus really passed the stop (+ = shown later than it came), by how far ahead it looked:`,
);
console.log(
  `  ${'ahead'.padEnd(14)} ${'n'.padStart(7)}  ${'median |err|'.padStart(12)}  ${'90th'.padStart(6)}  ${'bias'.padStart(6)}  ${'within 1'.padStart(8)}  ${'within 2'.padStart(8)}  | timetable alone: median |err| within 2`,
);
for (const [name, lo, hi] of hb) {
  const ss = ahead.filter((s) => s.truth - s.now >= lo && s.truth - s.now < hi);
  if (!ss.length) continue;
  const e = ss.map((s) => s.p - s.truth),
    ae = e.map(Math.abs),
    te = ss.map((s) => Math.abs(s.sched - s.truth));
  console.log(
    `  ${name.padEnd(14)} ${String(ss.length).padStart(7)}  ${min(q(ae, 0.5)).padStart(12)}  ${min(q(ae, 0.9)).padStart(6)}  ${(e.reduce((a, b) => a + b, 0) / e.length / 60).toFixed(1).padStart(6)}  ${pct(ae.filter((x) => x <= 60).length, ae.length).padStart(8)}  ${pct(ae.filter((x) => x <= 120).length, ae.length).padStart(8)}  | ${min(q(te, 0.5))} ${pct(te.filter((x) => x <= 120).length, te.length)}`,
  );
}
