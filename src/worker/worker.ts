// Wayli's data worker: it holds the day's timetable, the street graph, the address book and the courses, and answers
// every question of the app off the main thread, so the screen never waits. The page asks by name (worker/client.ts:
// call(op, args)); each part of the worker answers its own:
//   data.ts      loading what the worker holds, and the language names are handed out in
//   search.ts    places: the search over stops and the address book, what is at a point, names in another language
//   plan.ts      journeys between two places
//   stops.ts     stops and stations: the stop search, a stop's page, where a station's trains go, departures
//   lines.ts     lines: the line search, a line's page and its times at a stop
//   trips.ts     trips: a trip's stops, the direct trips between two places
//   courses.ts   where rides and walks run on the map
//   vehicles.ts  live vehicles, from the newest snapshot through the relay
//   traffic.ts   how the roads run now, from the buses
// (names.ts holds the names in the rider's language that they all hand out; ops.ts is the table of operations both
// sides are typed against.)
import { tt, post, dataOps } from './data.ts';
import { searchOps } from './search.ts';
import { planOps } from './plan.ts';
import { stopsOps } from './stops.ts';
import { linesOps } from './lines.ts';
import { tripsOps } from './trips.ts';
import { coursesOps } from './courses.ts';
import { vehiclesOps } from './vehicles.ts';
import { trafficOps } from './traffic.ts';
import type { OpName, OpsPart, Request } from './ops.ts';

const ops: OpsPart<OpName> = {
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
const NO_TIMETABLE = new Set<OpName>(['loadTimetable', 'setLang', 'liveQuery', 'localize']);
self.onmessage = async (ev: MessageEvent<unknown>) => {
  // what came over postMessage is the page's request (client.ts call, typed against ops.ts there): the operation is
  // looked up by its name below, and its arguments are handed on as they came
  const { id, op, args } = ev.data as Request;
  try {
    const run = ops[op] as ((args: unknown) => unknown) | undefined; // none for a name the table has not
    if (!run) throw new Error('unknown op ' + op);
    if (!tt && !NO_TIMETABLE.has(op)) throw new Error('timetable not loaded');
    post({ id, result: await run(args || {}) });
  } catch (e) {
    post({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
