// Node benchmark for the router over a compiled timetable.
//   node tools/bench.mjs data/timetable.bin.gz "מרכזית המפרץ" "מרכזית באר שבע" 08:00 [window-minutes] [runs]
// A place can also be "lat,lon" or "lat,lon:bike" (needs STREETS=data/streets.bin.gz in the environment).
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseTimetable, searchStops, plan, profile, describe } from '../src/engine/raptor.js';
import { parseStreets, accessStops, route } from '../src/engine/streets.js';

const [file, fromQ, toQ, timeStr = '08:00', windowStr = '60', runsStr = '10'] = process.argv.slice(2);
let t = performance.now();
const gz = readFileSync(file);
const raw = gunzipSync(gz);
const tGunzip = performance.now() - t;
t = performance.now();
const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const tt = parseTimetable(ab);
const tParse = performance.now() - t;
console.log(`timetable ${tt.header.date} format ${tt.header.format}: ${JSON.stringify(tt.counts)}`);
console.log(`gzip ${(gz.length / 1e6).toFixed(1)} MB -> raw ${(raw.length / 1e6).toFixed(1)} MB; gunzip ${tGunzip.toFixed(0)} ms, parse+expand+index ${tParse.toFixed(0)} ms`);

let st = null;
const stFile = process.env.STREETS || 'data/streets.bin.gz';
if (existsSync(stFile)) {
  t = performance.now();
  const sraw = gunzipSync(readFileSync(stFile));
  st = parseStreets(sraw.buffer.slice(sraw.byteOffset, sraw.byteOffset + sraw.byteLength));
  console.log(`streets: ${st.M} nodes, loaded in ${(performance.now() - t).toFixed(0)} ms`);
}
const points = [];
const pick = (q) => {
  const m = q.match(/^(-?\d+\.\d+),(-?\d+\.\d+)(?::(walk|bike))?$/);
  if (m) {
    if (!st || !tt.stopNode) throw new Error('points need the street graph and a timetable with stopNode');
    const mode = m[3] || 'walk', lat = Number(m[1]), lon = Number(m[2]);
    t = performance.now();
    const places = accessStops(st, tt.stopNode, lat, lon, mode, mode === 'bike' ? 1200 : 900);
    console.log(`"${q}" -> ${places.length} stops within ${mode === 'bike' ? 20 : 15} min by ${mode}, ${(performance.now() - t).toFixed(1)} ms`);
    points.push([lat, lon]);
    return { name: `${lat},${lon} (${mode})`, places };
  }
  if (/^\d+$/.test(q)) return { name: tt.stops[Number(q)][1], stops: [Number(q)] };
  const hits = searchStops(tt, q, 5);
  if (!hits.length) throw new Error(`no stop matches "${q}"`);
  console.log(`"${q}" ->`, hits.map((g) => `${g.name} [${g.city}] x${g.stops.length}`).join(' | '));
  return hits[0];
};
const from = pick(fromQ), to = pick(toQ);
const fromP = from.places || from, toP = to.places || to;
if (st && points.length === 2) {
  t = performance.now();
  const r = route(st, points[0][0], points[0][1], points[1][0], points[1][1], 'bike', 3 * 3600);
  console.log(`bike all the way: ${r ? `${Math.round(r.seconds / 60)} min, ${(r.metres / 1000).toFixed(1)} km` : 'no route'}, ${(performance.now() - t).toFixed(1)} ms`);
}
const [hh, mm] = timeStr.split(':').map(Number);
const depTime = hh * 3600 + mm * 60;
const windowS = Number(windowStr) * 60;

const single = plan(tt, fromP, toP, depTime, 3);
console.log(`\n${from.name} -> ${to.name} at ${timeStr}: ${single.ms.toFixed(1)} ms (cold, single departure)`);
for (const j of single.journeys) console.log(describe(tt, j));

const prof = profile(tt, fromP, toP, depTime, depTime + windowS, { maxTransfers: 3 });
console.log(`\nprofile ${timeStr} +${windowStr} min: ${prof.candidates} candidate departures, ${prof.runs} runs, ${prof.journeys.length} journeys, ${prof.ms.toFixed(1)} ms`);
for (const j of prof.journeys) console.log(describe(tt, j));

const runs = Number(runsStr);
const ts = [], tp = [];
for (let i = 0; i < runs; i++) { ts.push(plan(tt, fromP, toP, depTime, 3).ms); tp.push(profile(tt, fromP, toP, depTime, depTime + windowS).ms); }
ts.sort((a, b) => a - b); tp.sort((a, b) => a - b);
console.log(`\n${runs} warm runs: single median ${ts[runs >> 1].toFixed(1)} ms (min ${ts[0].toFixed(1)}), profile median ${tp[runs >> 1].toFixed(1)} ms (min ${tp[0].toFixed(1)}, max ${tp[runs - 1].toFixed(1)})`);
