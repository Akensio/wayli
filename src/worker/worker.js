// @ts-check
// Wayli's data worker: it holds the day's timetable, the street graph, the address book and the courses, and answers
// every question of the app off the main thread, so the screen never waits. The page asks by name (worker/client.ts:
// call(op, args)); each part of the worker answers its own:
//   data.js      loading what the worker holds, and the language names are handed out in
//   search.js    places: the search over stops and the address book, what is at a point, names in another language
//   plan.js      journeys between two places
//   stops.js     stops and stations: the stop search, a stop's page, where a station's trains go, departures
//   lines.js     lines: the line search, a line's page and its times at a stop
//   trips.js     trips: a trip's stops, the direct trips between two places
//   courses.js   where rides and walks run on the map
//   vehicles.js  live vehicles, from the newest snapshot through the relay
//   traffic.js   how the roads run now, from the buses
// (names.js holds the names in the rider's language that they all hand out.)
import { tt, post, dataOps } from './data.js';
import { searchOps } from './search.js';
import { planOps } from './plan.js';
import { stopsOps } from './stops.js';
import { linesOps } from './lines.js';
import { tripsOps } from './trips.js';
import { coursesOps } from './courses.js';
import { vehiclesOps } from './vehicles.js';
import { trafficOps } from './traffic.js';

/** @type {import('./ops').OpsImpl} */
const ops = {
  ...dataOps,
  ...searchOps,
  ...planOps,
  ...stopsOps,
  ...linesOps,
  ...tripsOps,
  ...coursesOps,
  ...vehiclesOps,
  ...trafficOps,
};

// live vehicles and place names do not wait for the timetable (the map asks for vehicles before it is in, and a
// refusal sent it to Hasadna's database, 15 minutes behind at rush hour)
const NO_TIMETABLE = new Set(['loadTimetable', 'setLang', 'liveQuery', 'localize']);
self.onmessage = async (ev) => {
  const { id, op, args } = ev.data;
  try {
    const run = ops[/** @type {keyof typeof ops} */ (op)];
    if (!run) throw new Error('unknown op ' + op);
    if (!tt && !NO_TIMETABLE.has(op)) throw new Error('timetable not loaded');
    post({ id, result: await run(args || {}) });
  } catch (e) {
    post({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
