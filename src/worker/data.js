// What the data worker has loaded, and loading it: the day's timetable (tt), the street graph (st), the address
// book (pl), the courses (sh), and the language names are handed out in. Only this module assigns them; the others
// read them (ES module bindings follow the assignments). A new day or a new language drops what was derived from the
// old one: each index registers its reset with onNewDay / onNewLang (before, each reset was listed by hand in the load,
// and three were missing: the light rail stations and the traffic's courses and tracks kept the old day's numbers).
import { parseTimetable } from '../engine/raptor.js';
import { parseStreets } from '../engine/streets.js';
import { parsePlaces } from '../engine/places.js';
import { readContainer } from '../engine/container.js';
import { setRailTimes, parseBusTimes, setBusTimes } from '../engine/delays.js';

export let tt = null, st = null, pl = null, sh = null;
export let lang = 'he';   // the language names are handed out in (setLang); the timetable carries what the feed translates

const dayResets = [], langResets = [];
/** `f` runs when another day's timetable is loaded: what was derived from the old one (indexed by its numbers) goes. */
export const onNewDay = (f) => { dayResets.push(f); };
/** `f` runs when names are to be handed out in another language: what holds names goes. */
export const onNewLang = (f) => { langResets.push(f); };

/** The compact shapes file: int32 coordinates (1e-5 degrees) per GTFS shape id. */
function parseShapes(ab) {
  const out = readContainer(ab);
  out.index = new Map();
  for (let i = 0; i < out.shapeId.length; i++) out.index.set(out.shapeId[i], i);
  return out;
}
/** A message to the page (an answer, or a download's progress). */
export const post = (m) => self.postMessage(m);
async function fetchContainer(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let u8;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      post({ type: 'progress', label, got, total });
    }
    u8 = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) { u8.set(c, o); o += c.length; }
  } else {
    u8 = new Uint8Array(await res.arrayBuffer());
  }
  post({ type: 'progress', label, got: u8.length, total: u8.length, unpacking: true });
  if (u8[0] === 0x1f && u8[1] === 0x8b) {
    if (typeof DecompressionStream !== 'function') throw new Error('this browser cannot decompress gzip');
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
  }
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

export const dataOps = {
  async loadTimetable({ url }) {
    const buf = await fetchContainer(url, 'timetable');
    tt = parseTimetable(buf);
    for (const f of dayResets) f();
    return { date: tt.header.date, counts: tt.counts, feed: tt.header.feed, streets: !!tt.header.streets };
  },
  async loadStreets({ url }) {
    const buf = await fetchContainer(url, 'streets');
    st = parseStreets(buf);
    return { nodes: st.M };
  },
  /** The learned running times of rail sections (pipeline/railtimes.py), for train delays. */
  setRailTimes({ m }) { setRailTimes(m); return true; },
  /** The learned running times of bus sections (pipeline/bustimes.py). */
  async loadBusTimes({ url }) { const m = parseBusTimes(await fetchContainer(url, 'bustimes')); setBusTimes(m); return { sections: m.idx.size, built: m.built }; },
  async loadShapes({ url }) {
    const buf = await fetchContainer(url, 'shapes');
    sh = parseShapes(buf);
    return sh.header.counts;
  },
  async loadPlaces({ url }) {
    const buf = await fetchContainer(url, 'places');
    pl = parsePlaces(buf);
    return pl.header.counts;
  },
  /** The language every name is handed out in from now on (what the timetable carries; Hebrew otherwise). */
  setLang({ lang: l }) { lang = l || 'he'; for (const f of langResets) f(); return lang; },
};
