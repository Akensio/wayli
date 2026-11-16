// A tiny timetable for tests, written the way pipeline/compile.py writes a real one (the container of
// src/engine/container.ts) and read back with the app's own parser, so the router under test runs on exactly what it
// runs on in the app. Stops are given with a name and a position, routes with a number and a type, patterns with
// their stops and each trip's departure times at them (arrival = departure), footpaths as [a, b, seconds] both ways.
import {
  parseTimetable,
  type Timetable,
  type TimetableHeader,
  type WalkParams,
  type Route,
  type Stop,
} from '../src/engine/raptor.ts';
import { writeContainer, type SectionIn, type SectionType } from '../src/engine/container.ts';
export { writeContainer, type SectionIn };

export const T = (h: number, m: number, s = 0): number => h * 3600 + m * 60 + s;
/** The id in the feed of the tiny timetable's stop i: not its place in the list, as no real stop's is. */
export const stopId = (i: number): number => 5000 + 7 * i;

/** What a tiny timetable is made of. */
export type TinySpec = {
  date?: string;
  stops: { name: string; lat: number; lon: number; code?: string; city?: string }[];
  routes: { short: string; long?: string; agency?: string; type?: number; id?: string }[];
  /** `only`, per stop: 'board' where riders may only get on, 'alight' where they may only get off (the feed's
   *  drop_off_type and pickup_type); a timetable with none is written without the section, as an older file is. */
  patterns: {
    route: number;
    stops: number[];
    trips: number[][];
    intercity?: boolean;
    only?: readonly ('board' | 'alight' | null)[];
  }[];
  footpaths?: [number, number, number][];
  walk?: Partial<WalkParams>;
  /** 3 for a file as the compiler wrote it before format 4 (the app still reads one). */
  format?: 3 | 4;
};
export const tinyTimetable = (spec: TinySpec): Timetable => parseTimetable(tinyContainer(spec));
/** The same timetable as the file's bytes, for a test that loads it the way the data worker loads a real one. */
export function tinyContainer({
  date = '20261029',
  stops,
  routes,
  patterns,
  footpaths = [],
  walk = {},
  format = 4,
}: TinySpec): ArrayBuffer {
  const S = stops.length;
  const patStopsOff = [0],
    patStops: number[] = [],
    patTripsOff = [0],
    tripTimesOff = [0],
    patRoute: number[] = [],
    patIntercity: number[] = [],
    patStopFlags: number[] = [];
  const tripStart: number[] = [],
    depDelta: number[] = [],
    dwell: number[] = [];
  const stopPats: [number, number][][] = Array.from({ length: S }, () => []);
  patterns.forEach((p, pi) => {
    patRoute.push(p.route);
    patIntercity.push(p.intercity ? 1 : 0);
    p.stops.forEach((s, pos) => {
      patStops.push(s);
      patStopFlags.push({ board: 2, alight: 1, none: 0 }[p.only?.[pos] ?? 'none']); // NO_ALIGHT, NO_BOARD
      stopPats[s].push([pi, pos]);
    });
    patStopsOff.push(patStops.length);
    const trips = [...p.trips].sort((a, b) => a[0] - b[0]); // the router binary-searches a pattern's trips by departure
    for (const times of trips) {
      if (times.length !== p.stops.length) throw new Error('a trip needs a time per stop');
      tripStart.push(times[0]);
      times.forEach((t, i) => {
        depDelta.push(i === 0 ? 0 : t - times[i - 1]);
        dwell.push(0);
      });
    }
    patTripsOff.push(patTripsOff[patTripsOff.length - 1] + trips.length);
    tripTimesOff.push(depDelta.length);
  });
  const stopPatsOff = [0],
    stopPatsFlat: number[] = [];
  for (let s = 0; s < S; s++) {
    for (const [p, pos] of stopPats[s]) stopPatsFlat.push(p, pos);
    stopPatsOff.push(stopPatsFlat.length / 2);
  }
  const tr: [number, number][][] = Array.from({ length: S }, () => []);
  for (const [a, b, sec] of footpaths) {
    tr[a].push([b, sec]);
    tr[b].push([a, sec]);
  }
  const trOff = [0],
    trTo: number[] = [],
    trTime: number[] = [];
  for (let s = 0; s < S; s++) {
    for (const [to, sec] of tr[s]) {
      trTo.push(to);
      trTime.push(sec);
    }
    trOff.push(trTo.length);
  }
  // the walk block carries only what the router reads (the slack and the chain limit); the compiler writes more
  const header: Omit<TimetableHeader, 'sections' | 'walk'> & {
    walk: Pick<WalkParams, 'transfer_slack_s' | 'chain_max_s'> & Partial<WalkParams>;
  } = {
    format,
    date,
    counts: {
      stops: S,
      patterns: patterns.length,
      trips: tripStart.length,
      events: depDelta.length,
      footpaths: trTo.length,
      routes: routes.length,
      stations: 0,
    },
    walk: { transfer_slack_s: 90, chain_max_s: 900, ...walk },
    routes: routes.map((r, i): Route => [
      r.short,
      r.long || `${r.short} line`,
      r.agency || 'Dan',
      r.type ?? 3,
      r.id ?? String(1000 + i),
      null,
      false,
    ]),
    stops: stops.map((s, i): Stop => [String(stopId(i)), s.name, s.code || String(10000 + i), s.city || 'Test']),
    stations: [],
    names: {},
  };
  const lengths = (off: number[]): number[] => off.slice(1).map((v, i) => v - off[i]);
  // format 4 (pipeline/compile.py): lists by their lengths, stops by their ids, nothing the app derives
  const layout: [string, SectionType, number[]][] =
    format === 3
      ? [
          ['patStopsOff', 'int32', patStopsOff],
          ['patStops', 'int32', patStops],
          ['patTripsOff', 'int32', patTripsOff],
          ['tripTimesOff', 'int32', tripTimesOff],
          ['stopPatsOff', 'int32', stopPatsOff],
          ['stopPats', 'int32', stopPatsFlat],
          ['trOff', 'int32', trOff],
          ['trTo', 'int32', trTo],
        ]
      : [
          ['patStopsLen', 'int32', lengths(patStopsOff)],
          ['patStopIds', 'int32', patStops.map(stopId)],
          ['patTripsLen', 'int32', lengths(patTripsOff)],
          ['trLen', 'int32', lengths(trOff)],
          ['trToId', 'int32', trTo.map(stopId)],
        ];
  const sections: SectionIn[] = (
    [
      ...layout,
      ...(patterns.some((p) => p.only) ? [['patStopFlags', 'uint8', patStopFlags]] : []),
      ['patRoute', 'int32', patRoute],
      ['patIntercity', 'uint8', patIntercity],
      ['tripStart', 'int32', tripStart],
      ['depDelta', 'uint16', depDelta],
      ['dwell', 'uint16', dwell],
      ['trTime', 'int32', trTime],
      ['stopLat', 'float32', stops.map((s) => s.lat)],
      ['stopLon', 'float32', stops.map((s) => s.lon)],
      ['stopParent', 'int32', stops.map(() => -1)],
    ] as [string, SectionType, number[]][]
  ).map(([name, dtype, data]) => ({ name, dtype, data }));
  return writeContainer(header, sections);
}
