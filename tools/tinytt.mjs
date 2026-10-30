// A tiny timetable for tests, written the way pipeline/compile.py writes a real one (the container of
// src/engine/container.js) and read back with the app's own parser, so the router under test runs on exactly what it
// runs on in the app. Stops are given with a name and a position, routes with a number and a type, patterns with
// their stops and each trip's departure times at them (arrival = departure), footpaths as [a, b, seconds] both ways.
import { parseTimetable } from '../src/engine/raptor.js';

const DTYPES = { int32: Int32Array, uint16: Uint16Array, uint8: Uint8Array, float32: Float32Array };
/** The container as container.py writes it: a uint32 header length, the header JSON padded to 4 bytes, the sections
 *  each at a 4-byte offset. `sections`: [{ name, dtype, data }]. */
export function writeContainer(header, sections) {
  const list = [],
    parts = [];
  let off = 0;
  for (const s of sections) {
    while (off % 4) {
      parts.push(new Uint8Array(1));
      off += 1;
    }
    const arr = new DTYPES[s.dtype](s.data),
      bytes = new Uint8Array(arr.buffer);
    list.push({ name: s.name, dtype: s.dtype, offset: off, length: arr.length });
    parts.push(bytes);
    off += bytes.length;
  }
  let hjson = new TextEncoder().encode(JSON.stringify({ ...header, sections: list }));
  const pad = (4 - ((4 + hjson.length) % 4)) % 4;
  if (pad) hjson = new Uint8Array([...hjson, ...new Array(pad).fill(32)]);
  const out = new Uint8Array(4 + hjson.length + off);
  new DataView(out.buffer).setUint32(0, hjson.length, true);
  out.set(hjson, 4);
  let o = 4 + hjson.length;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}

export const T = (h, m, s = 0) => h * 3600 + m * 60 + s;

/**
 * @param {{ date?: string, stops: { name: string, lat: number, lon: number, code?: string, city?: string }[],
 *   routes: { short: string, long?: string, agency?: string, type?: number, id?: string }[],
 *   patterns: { route: number, stops: number[], trips: number[][], intercity?: boolean }[],
 *   footpaths?: [number, number, number][], walk?: object }} spec
 */
export function tinyTimetable({ date = '20261029', stops, routes, patterns, footpaths = [], walk = {} }) {
  const S = stops.length;
  const patStopsOff = [0],
    patStops = [],
    patTripsOff = [0],
    tripTimesOff = [0],
    patRoute = [],
    patIntercity = [];
  const tripStart = [],
    depDelta = [],
    dwell = [];
  const stopPats = Array.from({ length: S }, () => []);
  patterns.forEach((p, pi) => {
    patRoute.push(p.route);
    patIntercity.push(p.intercity ? 1 : 0);
    p.stops.forEach((s, pos) => {
      patStops.push(s);
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
    stopPatsFlat = [];
  for (let s = 0; s < S; s++) {
    for (const [p, pos] of stopPats[s]) stopPatsFlat.push(p, pos);
    stopPatsOff.push(stopPatsFlat.length / 2);
  }
  const tr = Array.from({ length: S }, () => []);
  for (const [a, b, sec] of footpaths) {
    tr[a].push([b, sec]);
    tr[b].push([a, sec]);
  }
  const trOff = [0],
    trTo = [],
    trTime = [];
  for (let s = 0; s < S; s++) {
    for (const [to, sec] of tr[s]) {
      trTo.push(to);
      trTime.push(sec);
    }
    trOff.push(trTo.length);
  }
  const header = {
    format: 3,
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
    routes: routes.map((r, i) => [
      r.short,
      r.long || `${r.short} line`,
      r.agency || 'Dan',
      r.type ?? 3,
      r.id ?? String(1000 + i),
      null,
      false,
    ]),
    stops: stops.map((s, i) => [String(i), s.name, s.code || String(10000 + i), s.city || 'Test']),
    stations: [],
    names: {},
  };
  const sections = [
    ['patStopsOff', 'int32', patStopsOff],
    ['patStops', 'int32', patStops],
    ['patTripsOff', 'int32', patTripsOff],
    ['tripTimesOff', 'int32', tripTimesOff],
    ['patRoute', 'int32', patRoute],
    ['patIntercity', 'uint8', patIntercity],
    ['tripStart', 'int32', tripStart],
    ['depDelta', 'uint16', depDelta],
    ['dwell', 'uint16', dwell],
    ['stopPatsOff', 'int32', stopPatsOff],
    ['stopPats', 'int32', stopPatsFlat],
    ['trOff', 'int32', trOff],
    ['trTo', 'int32', trTo],
    ['trTime', 'int32', trTime],
    ['stopLat', 'float32', stops.map((s) => s.lat)],
    ['stopLon', 'float32', stops.map((s) => s.lon)],
    ['stopParent', 'int32', stops.map(() => -1)],
  ].map(([name, dtype, data]) => ({ name, dtype, data }));
  return parseTimetable(writeContainer(header, sections));
}
