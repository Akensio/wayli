// Backtest the app's train predictions on a morning's raw SIRI minute files: the app's own code (src/engine/delays.js
// estimateDelay, with the worker's frozen-fix filter and its reading of a train without GPS) is run every minute, and
// each prediction of a later station is scored against when that train's GPS first came within 300 m of it.
//
//   node tools/trainbacktest.mjs 20261025 07:30 10:30 [--timetable data/timetable-20261025.bin.gz] [--railtimes data/railtimes.json]
//
// The minute files come from Hasadna (https://open-bus-siri-requester.hasadna.org.il/, YYYY/MM/DD/HH/MM.br, UTC), the
// same files the relay passes to the app, and are kept in data/siri/. Errors are in minutes, + when the prediction was
// later than the train. 2026-10-25: 2.1 minutes typical (median |error|) against the timetable's 3.1. The last line is
// what the rider is shown (delays.js sureLate), against the timetable alone.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { parseTimetable } from '../src/engine/raptor.js';
import * as clock from '../src/engine/clock.js';
import * as delays from '../src/engine/delays.js';
import { metres } from '../src/engine/geo.js';

const [day, from = '07:30', to = '10:30'] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));
const opt = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
if (!/^\d{8}$/.test(day || '')) { console.error('usage: node tools/trainbacktest.mjs YYYYMMDD [HH:MM] [HH:MM] [--timetable file] [--railtimes file]'); process.exit(2); }
const load = (f) => { const b = gunzipSync(readFileSync(f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const tt = parseTimetable(load(opt('timetable', `data/timetable-${day}.bin.gz`)));
delays.setRailTimes(JSON.parse(readFileSync(opt('railtimes', 'data/railtimes.json'), 'utf8')));

// Israel time to UTC for the window (Intl knows the day's offset), with 2 hours after it for the trains' real times
const iso = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
const offset = (ms) => { const p = clock.ilParts(new Date(ms)); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };
const utc = (hm) => { const naive = Date.parse(`${iso}T${hm}:00Z`); return naive - offset(naive); };
const T0 = utc(from), T1 = utc(to);

// the minute files, fetched where missing; the trains of each, slimmed
const p2 = (n) => String(n).padStart(2, '0');
const rows = [];   // [file ms, ride, recorded ms, lat|null, lon|null, velocity, call code, call distance]
for (let t = T0 - 30 * 60e3; t <= T1 + 120 * 60e3; t += 60e3) {
  const d = new Date(t), path = `${d.getUTCFullYear()}/${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}/${p2(d.getUTCHours())}/${p2(d.getUTCMinutes())}`;
  const file = `data/siri/${path}.br`;
  if (!existsSync(file)) {
    const r = await fetch(`https://open-bus-siri-requester.hasadna.org.il/${path}.br`).catch(() => null);
    if (!r || !r.ok) continue;   // a missing minute (there are a few a day)
    mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  let j; try { j = JSON.parse(brotliDecompressSync(readFileSync(file))); } catch { continue; }
  for (const del of j.Siri.ServiceDelivery.StopMonitoringDelivery) for (const x of del.MonitoredStopVisit || []) {
    const m = x.MonitoredVehicleJourney; if (!m || String(m.OperatorRef) !== '2') continue;
    const l = m.VehicleLocation, c = m.MonitoredCall || {};
    rows.push([t, `${m.LineRef}/${m.OriginAimedDepartureTime}`, Date.parse(x.RecordedAtTime), l ? +l.Latitude : null, l ? +l.Longitude : null, +m.Velocity || 0, c.StopPointRef ?? null, c.DistanceFromStop != null ? +c.DistanceFromStop : null]);
  }
}

// each ride's trip and stops (the worker's tripFor and tripStopList)
const byId = new Map(); tt.routes.forEach((r, i) => { if (r[4] != null) byId.set(String(r[4]), i); });
const pats = new Map(); for (let p = 0; p < tt.patRoute.length; p++) { const r = tt.patRoute[p]; if (!pats.has(r)) pats.set(r, []); pats.get(r).push(p); }
const byCode = new Map(); tt.stops.forEach((s, i) => { if (s[2]) byCode.set(String(s[2]), i); });
const trips = new Map();
function tripOf(ride) {
  if (trips.has(ride)) return trips.get(ride);
  const ri = byId.get(ride.slice(0, ride.indexOf('/'))), start = clock.secondsOn(new Date(ride.slice(ride.indexOf('/') + 1)), day);
  let res = null;
  for (const p of ri == null ? [] : pats.get(ri) || []) {
    const ns = tt.patStopsOff[p + 1] - tt.patStopsOff[p];
    for (let t = tt.patTripsOff[p]; t < tt.patTripsOff[p + 1] && !res; t++) {
      const base = tt.tripTimesOff[p] + (t - tt.patTripsOff[p]) * ns;
      if (Math.abs(tt.dep[base] - start) > 90) continue;
      res = [];
      for (let i = 0; i < ns; i++) { const s = tt.patStops[tt.patStopsOff[p] + i]; res.push({ lat: tt.stopLat[s], lon: tt.stopLon[s], code: tt.stops[s][2], arr: tt.arr[base + i], dep: tt.dep[base + i] }); }
    }
  }
  trips.set(ride, res); return res;
}
// what happened: each ride's first GPS fix within 300 m of each of its stations
const truth = new Map(), byRide = new Map();
for (const r of rows) { if (!byRide.has(r[1])) byRide.set(r[1], []); byRide.get(r[1]).push(r); }
for (const [ride, rs] of byRide) {
  const stops = tripOf(ride); if (!stops) continue;
  const arr = new Array(stops.length).fill(null);
  for (const r of rs.sort((a, b) => a[2] - b[2])) if (r[3] != null) stops.forEach((s, i) => { if (arr[i] == null && metres(r[3], r[4], s.lat, s.lon) <= 300) arr[i] = clock.secondsOn(new Date(r[2]), day); });
  truth.set(ride, arr);
}

// minute by minute, as the app sees the trains (src/worker/vehicles.js remember and snapVehicles)
const posSince = new Map(), callSince = new Map(), trails = new Map(), res = [];
for (const t of [...new Set(rows.map((r) => r[0]))].sort((a, b) => a - b)) {
  const cur = rows.filter((r) => r[0] === t);
  for (const r of cur) {
    if (r[3] != null) { const loc = `${r[3]},${r[4]}`, o = posSince.get(r[1]); if (o && o.loc === loc) o.seen = t; else posSince.set(r[1], { loc, since: t, seen: t }); }
    if (r[3] != null) {   // the worker's trail: the ride's fixes of the last half hour, oldest first
      const tr = trails.get(r[1]) || []; if (!tr.length || tr[tr.length - 1][0] < r[2]) tr.push([r[2], r[3], r[4]]);
      while (tr.length && tr[0][0] < t - 1800e3) tr.shift();
      trails.set(r[1], tr);
    }
    const c = callSince.get(r[1]); if (r[6] != null && (!c || c.code !== String(r[6]))) callSince.set(r[1], { code: String(r[6]), since: r[2], change: !!c });
  }
  if (t < T0 || t > T1) continue;
  const now = clock.secondsOn(new Date(t), day);
  for (const r of cur) {
    if (r[2] > t + 120e3 || r[2] < t - 1800e3) continue;
    const stops = tripOf(r[1]), tru = truth.get(r[1]); if (!stops || !tru) continue;
    if (r[3] != null && r[5] > 5) { const o = posSince.get(r[1]); if (o && t - o.since >= 120e3) continue; }   // a frozen fix
    const v = { lat: r[3], lon: r[4], recordedAt: new Date(r[2]), trail: process.env.NO_TRAIL ? null : trails.get(r[1]) }, gps = r[3] != null;
    if (!gps) {   // put at the station its call names, with when the call first named it
      const s = byCode.get(String(r[6])); if (s === undefined || r[7] > 0) continue;
      v.lat = tt.stopLat[s]; v.lon = tt.stopLon[s];
      const c = callSince.get(r[1]); if (c && c.code === String(r[6])) { v.callSince = c.since; v.callSeenChange = c.change; }
    }
    const est = delays.estimateDelay(v, stops, day); if (!est) continue;
    for (let j = est.index + 1; j < stops.length; j++) {
      if (tru[j] == null || tru[j] <= now + 30) continue;
      const pred = est.arr ? est.arr[j] : stops[j].arr + est.delay;
      if (pred != null) res.push({ gps, err: pred - tru[j], tt: stops[j].arr - tru[j], ahead: tru[j] - now, shown: delays.liveAt(est, stops, j).delay, real: tru[j] - stops[j].arr });
    }
  }
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const line = (xs) => (xs.length ? `n=${String(xs.length).padStart(6)}  typical ${(q(xs.map(Math.abs), 0.5) / 60).toFixed(1)}  90% within ${(q(xs.map(Math.abs), 0.9) / 60).toFixed(1)}  median ${(q(xs, 0.5) / 60).toFixed(1)}  within a minute ${Math.round(100 * xs.filter((e) => Math.abs(e) <= 60).length / xs.length)}%` : 'n=0');
console.log(`${day} ${from}-${to}: ${byRide.size} train rides, ${rows.length} reports (${rows.filter((r) => r[3] == null).length} without GPS); minutes, + = predicted later than the train came`);
console.log(`  timetable alone   ${line(res.map((x) => x.tt))}`);
console.log(`  the app           ${line(res.map((x) => x.err))}`);
for (const [a, b] of [[0, 10], [10, 20], [20, 30], [30, 60]]) console.log(`    ${p2(a)}-${p2(b)} min ahead ${line(res.filter((x) => x.ahead >= a * 60 && x.ahead < b * 60).map((x) => x.err))}`);
console.log(`    without GPS     ${line(res.filter((x) => !x.gps).map((x) => x.err))}`);
// what the rider is shown (delays.js liveAt: a train late only by what we are sure of), against the timetable alone
const pct = (f, xs = res) => `${(100 * xs.filter(f).length / Math.max(1, xs.length)).toFixed(1)}%`, big = res.filter((x) => x.real >= 180);
console.log(`  shown: a delay ${pct((x) => Math.round(x.shown / 60) !== 0)}, late when it came on time ${pct((x) => Math.round(x.shown / 60) >= 1 && x.real < 60)}, 2+ min after it came ${pct((x) => x.shown - x.real > 120)} (timetable alone ${pct((x) => -x.real > 120)}), real delays of 3+ min shown ${pct((x) => x.shown >= 90, big)}`);
