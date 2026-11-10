// Backtest the app's train predictions on a morning's raw SIRI minute files: the files are fed minute by minute through
// the app's own code (the data worker's remember and snapVehicles, delays.ts estimateDelay and liveAt), and each
// prediction of a later station is scored against when that train's GPS first came within 300 m of it.
//
//   node --experimental-strip-types measure/trainbacktest.mjs 20261025 07:30 10:30 [--site URL] [--railtimes data/railtimes.json]
//
// The minute files come from Hasadna (https://open-bus-siri-requester.hasadna.org.il/, YYYY/MM/DD/HH/MM.br, UTC), the
// same files the relay passes to the app, and are kept in data/siri/; the day's timetable is read from the site (a past
// day's is no longer there: serve a local data/ with its own manifest.json and pass it as --site). Errors are in
// minutes, + when the prediction was later than the train. The last line is what the rider is shown (delays.ts
// sureLate), against the timetable alone.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

const [day, from = '07:30', to = '10:30'] = process.argv
  .slice(2)
  .filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));
const opt = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
if (!/^\d{8}$/.test(day || '')) {
  console.error('usage: node measure/trainbacktest.mjs YYYYMMDD [HH:MM] [HH:MM] [--site URL] [--railtimes file]');
  process.exit(2);
}
const SITE = opt('site', 'https://akensio.github.io/wayli/');
globalThis.self = { postMessage() {}, location: { href: SITE } };
const { dataOps } = await import('../src/worker/data.ts');
const { snapVehicles, estimateFor, remember } = await import('../src/worker/vehicles.ts');
const { tripFor, tripStopList } = await import('../src/worker/trips.ts');
const delays = await import('../src/engine/delays.ts');
const clock = await import('../src/engine/clock.ts');
const { metres } = await import('../src/engine/geo.ts');
const manifest = await (await fetch(SITE + 'data/manifest.json', { cache: 'no-store' })).json();
const entry = manifest.days.find((d) => d.date === day);
if (!entry) {
  console.error(`the site has no timetable for ${day} (it serves ${manifest.days.map((d) => d.date).join(' ')})`);
  process.exit(2);
}
await dataOps.loadTimetable({
  url: `${SITE}data/${entry.file}?v=${entry.hash || entry.built || ''}`,
  bytes: entry.bytes,
});
delays.setRailTimes(JSON.parse(readFileSync(opt('railtimes', 'data/railtimes.json'), 'utf8')));

// Israel time to UTC for the window (Intl knows the day's offset), with 2 hours after it for the trains' real times
const iso = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
const offset = (ms) => {
  const p = clock.ilParts(new Date(ms));
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
};
const utc = (hm) => {
  const naive = Date.parse(`${iso}T${hm}:00Z`);
  return naive - offset(naive);
};
const T0 = utc(from),
  T1 = utc(to);

// the minute files, fetched where missing; of each, the trains only, in the shape the worker reads
const p2 = (n) => String(n).padStart(2, '0');
const minutes = []; // [file ms, the snapshot with its trains only]
for (let t = T0 - 30 * 60e3; t <= T1 + 120 * 60e3; t += 60e3) {
  const d = new Date(t),
    path = `${d.getUTCFullYear()}/${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}/${p2(d.getUTCHours())}/${p2(d.getUTCMinutes())}`;
  const file = `data/siri/${path}.br`;
  if (!existsSync(file)) {
    const r = await fetch(`https://open-bus-siri-requester.hasadna.org.il/${path}.br`).catch(() => null);
    if (!r || !r.ok) continue; // a missing minute (there are a few a day)
    mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  let j;
  try {
    j = JSON.parse(brotliDecompressSync(readFileSync(file)));
  } catch {
    continue;
  }
  const trains = [];
  for (const del of j.Siri.ServiceDelivery.StopMonitoringDelivery)
    for (const x of del.MonitoredStopVisit || [])
      if (x.MonitoredVehicleJourney && String(x.MonitoredVehicleJourney.OperatorRef) === '2') trains.push(x);
  minutes.push([t, { Siri: { ServiceDelivery: { StopMonitoringDelivery: [{ MonitoredStopVisit: trains }] } } }]);
}
const visits = (j) => j.Siri.ServiceDelivery.StopMonitoringDelivery[0].MonitoredStopVisit;
const rideOf = (m) => `${m.LineRef}/${m.OriginAimedDepartureTime}`;
const stopsOf = (lineRef, start) => {
  const t = tripFor(lineRef, clock.secondsOn(new Date(start), day));
  return t < 0 ? null : tripStopList(t).stops;
};

// what happened: each ride's first GPS fix within 300 m of each of its stations
const truth = new Map();
let reports = 0,
  noGps = 0;
for (const [, j] of minutes)
  for (const x of visits(j)) {
    const m = x.MonitoredVehicleJourney,
      l = m.VehicleLocation;
    reports++;
    if (!l) {
      noGps++;
      continue;
    }
    const stops = stopsOf(m.LineRef, m.OriginAimedDepartureTime);
    if (!stops) continue;
    let arr = truth.get(rideOf(m));
    if (!arr) truth.set(rideOf(m), (arr = new Array(stops.length).fill(null)));
    const at = clock.secondsOn(new Date(x.RecordedAtTime), day);
    stops.forEach((s, i) => {
      if (metres(+l.Latitude, +l.Longitude, s.lat, s.lon) <= 300 && (arr[i] == null || at < arr[i])) arr[i] = at;
    });
  }

// minute by minute, as the app sees the trains
const res = [];
for (const [t, j] of minutes) {
  Date.now = () => t + 60e3;
  remember(j, t);
  if (t < T0 || t > T1) continue;
  const now = clock.secondsOn(new Date(t), day);
  for (const v of snapVehicles(j, t)) {
    const stops = stopsOf(v.lineRef, v.scheduledStart),
      tru = truth.get(v.rideId);
    if (!stops || !tru) continue;
    const est = estimateFor(v, stops, day);
    if (!est) continue;
    for (let k = est.index + 1; k < stops.length; k++) {
      if (tru[k] == null || tru[k] <= now + 30) continue;
      const pred = est.arr ? est.arr[k] : stops[k].arr + est.delay;
      if (pred != null)
        res.push({
          err: pred - tru[k],
          tt: stops[k].arr - tru[k],
          ahead: tru[k] - now,
          shown: delays.liveAt(est, stops, k).delay,
          real: tru[k] - stops[k].arr,
        });
    }
  }
}
const q = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(p * (s.length - 1))];
};
// 85% at most: the 85th percentile of the signed error, the margin a shown lateness must leave to be late by at most
// what is shown 85% of the time (delays.ts SURE_MARGIN is read off this column, per distance ahead)
const line = (xs) =>
  xs.length
    ? `n=${String(xs.length).padStart(6)}  typical ${(q(xs.map(Math.abs), 0.5) / 60).toFixed(1)}  90% within ${(q(xs.map(Math.abs), 0.9) / 60).toFixed(1)}  median ${(q(xs, 0.5) / 60).toFixed(1)}  85% at most ${(q(xs, 0.85) / 60).toFixed(1)}  within a minute ${Math.round((100 * xs.filter((e) => Math.abs(e) <= 60).length) / xs.length)}%`
    : 'n=0';
console.log(
  `${day} ${from}-${to}: ${truth.size} train rides, ${reports} reports (${noGps} without GPS); minutes, + = predicted later than the train came`,
);
console.log(`  timetable alone   ${line(res.map((x) => x.tt))}`);
console.log(`  the app           ${line(res.map((x) => x.err))}`);
for (const [a, b] of [
  [0, 5],
  [5, 10],
  [10, 20],
  [20, 30],
  [30, 60],
])
  console.log(
    `    ${p2(a)}-${p2(b)} min ahead ${line(res.filter((x) => x.ahead >= a * 60 && x.ahead < b * 60).map((x) => x.err))}`,
  );
// what the rider is shown (delays.ts liveAt: a train late only by what we are sure of), against the timetable alone
const pct = (f, xs = res) => `${((100 * xs.filter(f).length) / Math.max(1, xs.length)).toFixed(1)}%`,
  big = res.filter((x) => x.real >= 180);
console.log(
  `  shown: a delay ${pct((x) => Math.round(x.shown / 60) !== 0)}, late when it came on time ${pct((x) => Math.round(x.shown / 60) >= 1 && x.real < 60)}, 2+ min after it came ${pct((x) => x.shown - x.real > 120)} (timetable alone ${pct((x) => -x.real > 120)}), real delays of 3+ min shown ${pct((x) => x.shown >= 90, big)}`,
);
