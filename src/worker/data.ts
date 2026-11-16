// What the data worker has loaded, and loading it: the day's timetable (tt), the street graph (st), the address
// book (pl), the search catalogues (sx, sxStops), the courses (sh), and the language names are handed out in. Only this module assigns them; the others
// read them (ES module bindings follow the assignments). A new day or a new language drops what was derived from the
// old one: each index registers its reset with onNewDay / onNewLang (before, each reset was listed by hand in the load,
// and three were missing: the light rail stations and the traffic's courses and tracks kept the old day's numbers).
import { parseTimetable, type Timetable } from '../engine/raptor.ts';
import { parseStreets, type Streets } from '../engine/streets.ts';
import { parsePlaces, houseOn, type Places, type Lang } from '../engine/places.ts';
import { readCatalogue, type Catalogue } from '../engine/catalogue.ts';
import { readContainer, type ContainerHeader } from '../engine/container.ts';
import { setRailTimes, parseBusTimes, setBusTimes } from '../engine/delays.ts';
import { fileBytes, setDeltas } from './files.ts';
import type { OpsPart } from './ops.ts';

/** The courses file's header (pipeline/shapes.py): how many shapes and points it holds. */
export type ShapesHeader = ContainerHeader & { counts: { shapes: number; points: number } };
/** The courses: every GTFS shape of the feed as a simplified polyline. Shape i (its id `shapeId[i]`, the timetable's
 *  patShape) runs through the points `shapeOff[i]` up to `shapeOff[i + 1]`, in 1e-5 degrees; `index` finds i by id. */
export type Shapes = {
  header: ShapesHeader;
  shapeId: Int32Array;
  shapeOff: Int32Array;
  ptLat: Int32Array;
  ptLon: Int32Array;
  index: Map<number, number>;
};

export let tt: Timetable | null = null,
  st: Streets | null = null,
  pl: Places | null = null,
  sx: Catalogue | null = null, // the search catalogue of the address book (rebuilt when the book is, weekly)
  sxStops: Catalogue | null = null, // the search catalogue of every day's stops (rebuilt nightly)
  sh: Shapes | null = null;
export let lang: Lang = 'he'; // the language names are handed out in (setLang); the timetable carries what the feed translates

const dayResets: (() => void)[] = [],
  langResets: (() => void)[] = [],
  busTimesHooks: (() => Promise<void> | void)[] = [];
/** `f` runs when another day's timetable is loaded: what was derived from the old one (indexed by its numbers) goes. */
export const onNewDay = (f: () => void): void => {
  dayResets.push(f);
};
/** `f` runs when names are to be handed out in another language: what holds names goes. */
export const onNewLang = (f: () => void): void => {
  langResets.push(f);
};
/** `f` runs once the learned bus times are in, before their load answers: what waited for them catches up (the road
 *  model, which dropped every snapshot until then). */
export const onBusTimes = (f: () => Promise<void> | void): void => {
  busTimesHooks.push(f);
};

/** The compact shapes file: int32 coordinates (1e-5 degrees) per GTFS shape id. */
function parseShapes(ab: ArrayBuffer): Shapes {
  const out = readContainer<'shapeId' | 'shapeOff' | 'ptLat' | 'ptLon', ShapesHeader>(ab) as Shapes; // the index is added below
  out.index = new Map();
  for (let i = 0; i < out.shapeId.length; i++) out.index.set(out.shapeId[i], i);
  return out;
}
export const dataOps = {
  /** What the manifest says about getting the files: the deltas between versions, and which files it lists. */
  setDeltas(args) {
    setDeltas(args);
    return true;
  },
  async loadTimetable(args) {
    const buf = await fileBytes(args, 'timetable');
    tt = parseTimetable(buf);
    for (const f of dayResets) f();
    return { date: tt.header.date, counts: tt.counts, feed: tt.header.feed, streets: !!tt.header.streets };
  },
  async loadStreets(args) {
    const buf = await fileBytes(args, 'streets');
    st = parseStreets(buf);
    return { nodes: st.M };
  },
  /** The learned running times of rail sections (pipeline/railtimes.py), for train delays. */
  setRailTimes({ m }) {
    setRailTimes(m);
    return true;
  },
  /** The learned running times of bus sections (pipeline/bustimes.py). */
  async loadBusTimes(args) {
    const m = parseBusTimes(await fileBytes(args, 'bustimes'));
    setBusTimes(m);
    for (const f of busTimesHooks) await f();
    return { sections: m.idx.size, built: m.built };
  },
  async loadShapes(args) {
    const buf = await fileBytes(args, 'shapes');
    sh = parseShapes(buf);
    return sh.header.counts;
  },
  async loadPlaces(args) {
    const buf = await fileBytes(args, 'places');
    pl = parsePlaces(buf);
    sx = null; // a catalogue belongs to one address book
    return pl.header.counts;
  },
  /** The stops' search catalogue (pipeline/searchindex.ts): every compiled day's stops, by their ids in the feed. */
  async loadStopSearch(args) {
    sxStops = readCatalogue(await fileBytes(args, 'stopsearch'), null);
    return { entries: sxStops.n, words: sxStops.ix.keys.length };
  },
  /** The address book's search catalogue (pipeline/searchindex.ts), read against the book it was built from: asked
   *  for once the book is in. */
  async loadSearch(args) {
    const buf = await fileBytes(args, 'search');
    const book = pl!;
    sx = readCatalogue(buf, book);
    sx.numberOn = (street, number, suffix) => {
      const h = houseOn(book, street, number, suffix);
      if (!h) return null;
      return h.exact ? 'exact' : 'near';
    };
    return { entries: sx.n, words: sx.ix.keys.length };
  },
  /** The language every name is handed out in from now on (what the timetable carries; Hebrew otherwise). */
  setLang({ lang: l }) {
    lang = l || 'he';
    for (const f of langResets) f();
    return lang;
  },
} satisfies OpsPart<
  | 'setDeltas'
  | 'loadTimetable'
  | 'loadStreets'
  | 'setRailTimes'
  | 'loadBusTimes'
  | 'loadShapes'
  | 'loadPlaces'
  | 'loadSearch'
  | 'loadStopSearch'
  | 'setLang'
>;
