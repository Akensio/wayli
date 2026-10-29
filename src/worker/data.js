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
/** The body of a response, streamed so the page sees the download move; `base` bytes were had before it. */
async function readBody(res, label, base, total) {
  if (!res.body || !res.body.getReader) { const u8 = new Uint8Array(await res.arrayBuffer()); post({ type: 'progress', label, got: base + u8.length, total }); return u8; }
  const reader = res.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    post({ type: 'progress', label, got: base + got, total });
  }
  const u8 = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { u8.set(c, o); o += c.length; }
  return u8;
}
/** A whole file in one request (small files, and browsers without a cache for pieces). */
async function fetchWhole(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return readBody(res, label, 0, Number(res.headers.get('content-length')) || 0);
}

/**
 * A big file in pieces that survive a short session. The street graph is 11 MB, and a rider who opens the app for
 * half a minute never gets to the end of it: the next open started it over, and the service worker's cache only ever
 * holds a download that finished. So a file whose size the manifest gives is fetched in PIECE-sized ranges, each
 * kept in the browser's cache (a cache of its own, 'wayli-parts-v1', keyed by the file's address with its version and
 * the piece's number) the moment it arrives; the next open fetches only the pieces still missing. Pieces of an
 * older version of the same file go when a newer one's first piece is asked for. A whole copy the service worker
 * cached before this (the same address) is cut into pieces instead of downloaded again.
 * Returns the file's bytes, or null when the server did not answer the range (the whole file is then fetched as
 * one), or the size it answered with is not the manifest's (the file changed under the manifest: the fresh whole
 * file is right, the pieces would not fit together).
 */
const PIECE = 1 << 20, PARTS = 'wayli-parts-v1';
const pieceKey = (url, i) => `${url}${url.includes('?') ? '&' : '?'}part=${i}`;
async function fetchInPieces(url, label, total) {
  const cache = await caches.open(PARTS);
  const path = new URL(url, self.location.href).pathname;
  for (const k of await cache.keys()) { const u = new URL(k.url); if (u.pathname === path && !k.url.startsWith(url)) await cache.delete(k); }
  const n = Math.ceil(total / PIECE), u8 = new Uint8Array(total);
  const keep = (i, bytes) => cache.put(pieceKey(url, i), new Response(bytes, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.byteLength) } }));
  const whole = await caches.match(url);   // the service worker's copy from before pieces, any cache
  if (whole) {
    const w = new Uint8Array(await whole.arrayBuffer());
    if (w.length === total) { for (let i = 0; i < n; i++) await keep(i, w.subarray(i * PIECE, Math.min(total, (i + 1) * PIECE))); }
    for (const k of await caches.keys()) await (await caches.open(k)).delete(url);
    if (w.length === total) { post({ type: 'progress', label, got: total, total }); return w; }
  }
  let got = 0;
  for (let i = 0; i < n; i++) {
    const start = i * PIECE, end = Math.min(total, start + PIECE) - 1;
    const hit = await cache.match(pieceKey(url, i));
    let piece = hit ? new Uint8Array(await hit.arrayBuffer()) : null;
    if (!piece || piece.length !== end - start + 1) {
      const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
      if (res.status !== 206) { if (res.ok) return null; throw new Error(`HTTP ${res.status} for ${url}`); }
      const size = Number((res.headers.get('content-range') || '').split('/')[1]);
      if (size !== total) return null;
      piece = await readBody(res, label, got, total);
      if (piece.length !== end - start + 1) throw new Error(`piece ${i} of ${url}: ${piece.length} bytes`);
      await keep(i, piece);
    }
    u8.set(piece, start); got += piece.length;
    post({ type: 'progress', label, got, total });
  }
  return u8;
}
/** The pieces of a file whose bytes did not make a readable file (a version change in mid-download): fetched anew next time. */
async function dropPieces(url) {
  try { const cache = await caches.open(PARTS); for (const k of await cache.keys()) if (k.url.startsWith(url)) await cache.delete(k); } catch { /* nothing to drop */ }
}
/** A data file's contents, unpacked: in pieces when its size is known and the browser has a cache (see fetchInPieces), whole otherwise. */
async function fetchContainer(url, label, bytes) {
  const pieces = !!bytes && typeof caches !== 'undefined';
  let u8 = pieces ? await fetchInPieces(url, label, bytes) : null;
  if (!u8) u8 = await fetchWhole(url, label);
  post({ type: 'progress', label, got: u8.length, total: u8.length, unpacking: true });
  try {
    if (u8[0] === 0x1f && u8[1] === 0x8b) {
      if (typeof DecompressionStream !== 'function') throw new Error('this browser cannot decompress gzip');
      const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).arrayBuffer();
    }
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  } catch (e) { if (pieces) await dropPieces(url); throw e; }
}

export const dataOps = {
  async loadTimetable({ url, bytes }) {
    const buf = await fetchContainer(url, 'timetable', bytes);
    tt = parseTimetable(buf);
    for (const f of dayResets) f();
    return { date: tt.header.date, counts: tt.counts, feed: tt.header.feed, streets: !!tt.header.streets };
  },
  async loadStreets({ url, bytes }) {
    const buf = await fetchContainer(url, 'streets', bytes);
    st = parseStreets(buf);
    return { nodes: st.M };
  },
  /** The learned running times of rail sections (pipeline/railtimes.py), for train delays. */
  setRailTimes({ m }) { setRailTimes(m); return true; },
  /** The learned running times of bus sections (pipeline/bustimes.py). */
  async loadBusTimes({ url, bytes }) { const m = parseBusTimes(await fetchContainer(url, 'bustimes', bytes)); setBusTimes(m); return { sections: m.idx.size, built: m.built }; },
  async loadShapes({ url, bytes }) {
    const buf = await fetchContainer(url, 'shapes', bytes);
    sh = parseShapes(buf);
    return sh.header.counts;
  },
  async loadPlaces({ url, bytes }) {
    const buf = await fetchContainer(url, 'places', bytes);
    pl = parsePlaces(buf);
    return pl.header.counts;
  },
  /** The language every name is handed out in from now on (what the timetable carries; Hebrew otherwise). */
  setLang({ lang: l }) { lang = l || 'he'; for (const f of langResets) f(); return lang; },
};
