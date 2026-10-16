// Node benchmark for the RAPTOR router over a compiled timetable.
//   node app/bench.mjs data/timetable.bin.gz "מרכזית המפרץ" "באר שבע" 08:00 [runs]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseTimetable, searchStops, plan, describe } from './raptor.js';

const [file, fromQ, toQ, timeStr = '08:00', runsStr = '20'] = process.argv.slice(2);
let t = performance.now();
const gz = readFileSync(file);
const raw = gunzipSync(gz);
const tGunzip = performance.now() - t;
t = performance.now();
const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const tt = parseTimetable(ab);
const tParse = performance.now() - t;
console.log(`timetable ${tt.header.date}: ${JSON.stringify(tt.counts)}`);
console.log(`gzip ${(gz.length / 1e6).toFixed(1)} MB -> raw ${(raw.length / 1e6).toFixed(1)} MB; gunzip ${tGunzip.toFixed(0)} ms, parse+expand ${tParse.toFixed(0)} ms`);

const pick = (q) => {
  const hits = searchStops(tt, q, 10);
  if (!hits.length) throw new Error(`no stop matches "${q}"`);
  console.log(`"${q}" ->`, hits.map((i) => `${i}:${tt.stops[i][1]} (${tt.stops[i][0]})`).join(' | '));
  return hits[0];
};
const from = /^\d+$/.test(fromQ) ? Number(fromQ) : pick(fromQ);
const to = /^\d+$/.test(toQ) ? Number(toQ) : pick(toQ);
const [hh, mm] = timeStr.split(':').map(Number);
const depTime = hh * 3600 + mm * 60;

const first = plan(tt, from, to, depTime, 3);
console.log(`\n${tt.stops[from][1]} -> ${tt.stops[to][1]} at ${timeStr}: ${first.rounds} rounds, ${first.ms.toFixed(1)} ms (cold)`);
for (const j of first.journeys) console.log(describe(tt, j));

const runs = Number(runsStr);
const times = [];
for (let i = 0; i < runs; i++) times.push(plan(tt, from, to, depTime, 3).ms);
times.sort((a, b) => a - b);
console.log(`\n${runs} warm runs: median ${times[runs >> 1].toFixed(1)} ms, min ${times[0].toFixed(1)} ms, max ${times[runs - 1].toFixed(1)} ms`);
