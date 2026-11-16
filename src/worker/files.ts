// A data file's bytes, wherever they come from at the least cost: the copy the phone keeps, else an older copy it
// keeps and the deltas the nightly build published from that version to this one (engine/delta.ts; megabytes become
// tens or hundreds of kilobytes), else a download, in pieces that survive a short session. Whatever was fetched is
// kept for next time. A doubt anywhere (no delta from what is held, a delta that does not give the file its
// fingerprint names, a browser without the means) ends in the plain download, as before there were deltas.
//
// What is kept: each file once, gzipped, in the browser's cache 'wayli-files-v1', under its name and its version (the
// content hash the manifest gives). A file's older versions go when the current one is in; the day files of days gone
// by go when today's is in (until then one of them is what today's is made from).
import { applyDelta } from '../engine/delta.ts';
import type { DataFileArgs, DeltaStep, WorkerMessage } from './ops.ts';

/** A message to the page (an answer, or a file's progress). */
export const post = (m: WorkerMessage): void => self.postMessage(m);

// ---------------------------------------------------------------- downloading

/** The body of a response, streamed so the page sees the download move; `base` bytes were had before it. */
/** How long a download may go without a byte before it is given up: a stalled connection then fails and says so (the
 *  pieces already kept stay for the next try) instead of leaving the progress frozen for good. */
const STALL_MS = 30000;
/** `fetch`, given up when no answer starts within STALL_MS; the body's reads are watched by `readBody`. */
async function fetchWatched(url: string, init: RequestInit = {}): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error(`no answer in ${STALL_MS / 1000} s for ${url}`)), STALL_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}
/** One read of a body, given up (and the body cancelled) when nothing came for STALL_MS. */
function readOrStall(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stall = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reader.cancel().catch(() => {});
      reject(new Error(`download stalled for ${STALL_MS / 1000} s`));
    }, STALL_MS);
  });
  return Promise.race([reader.read(), stall]).finally(() => clearTimeout(timer));
}
async function readBody(
  res: Response,
  label: string,
  base: number,
  total: number,
  how?: 'update',
): Promise<Uint8Array<ArrayBuffer>> {
  if (!res.body || !res.body.getReader) {
    const u8 = new Uint8Array(await res.arrayBuffer());
    post({ type: 'progress', label, got: base + u8.length, total, how });
    return u8;
  }
  const reader = res.body.getReader(),
    chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await readOrStall(reader);
    if (done) break;
    chunks.push(value);
    got += value.length;
    post({ type: 'progress', label, got: base + got, total, how });
  }
  const u8 = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    u8.set(c, o);
    o += c.length;
  }
  return u8;
}
/** A whole file in one request (small files, deltas, and browsers without a cache for pieces). A delta's progress
 *  counts within all the deltas being fetched (`base` of `total` bytes had before it). */
async function fetchWhole(
  url: string,
  label: string,
  how?: 'update',
  base = 0,
  total = 0,
): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetchWatched(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return readBody(res, label, base, total || Number(res.headers.get('content-length')) || 0, how);
}

/**
 * A big file in pieces that survive a short session. The street graph is 11 MB, and a rider who opens the app for
 * half a minute never gets to the end of it: the next open started it over, and the service worker's cache only ever
 * holds a download that finished. So a file whose size the manifest gives is fetched in PIECE-sized ranges, each
 * kept in the browser's cache (a cache of its own, 'wayli-parts-v1', keyed by the file's address with its version and
 * the piece's number) the moment it arrives; the next open fetches only the pieces still missing. Pieces of an
 * older version of the same file go when a newer one's first piece is asked for, and a finished file's pieces once
 * it is kept whole (fileBytes). A whole copy the service worker cached before there were pieces (the same address)
 * serves as it is.
 * Returns the file's bytes, or null when the server did not answer the range (the whole file is then fetched as
 * one), or the size it answered with is not the manifest's (the file changed under the manifest: the fresh whole
 * file is right, the pieces would not fit together).
 */
const PIECE = 1 << 20,
  PARTS = 'wayli-parts-v1';
const pieceKey = (url: string, i: number): string => `${url}${url.includes('?') ? '&' : '?'}part=${i}`;
async function fetchInPieces(url: string, label: string, total: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const cache = await caches.open(PARTS);
  const path = new URL(url, self.location.href).pathname;
  for (const k of await cache.keys()) {
    const u = new URL(k.url);
    if (u.pathname === path && !k.url.startsWith(url)) await cache.delete(k);
  }
  const n = Math.ceil(total / PIECE),
    u8 = new Uint8Array(total);
  // A piece is kept so that a download cut short goes on from it. A phone with no room left refuses (the site's
  // storage is full): the download goes on all the same, kept only in memory; failing it there made a full phone
  // fetch the same megabytes at every open and never finish (2026-11-16).
  let room = true;
  const keepPiece = async (i: number, bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
    if (!room) return;
    try {
      await cache.put(
        pieceKey(url, i),
        new Response(bytes, {
          headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.byteLength) },
        }),
      );
    } catch {
      room = false;
    }
  };
  const whole = await caches.match(url); // a whole copy the service worker cached, from before pieces: it serves
  if (whole) {
    const w = new Uint8Array(await whole.arrayBuffer());
    for (const k of await caches.keys()) await (await caches.open(k)).delete(url);
    if (w.length === total) return w;
  }
  let got = 0;
  for (let i = 0; i < n; i++) {
    const start = i * PIECE,
      end = Math.min(total, start + PIECE) - 1;
    const hit = await cache.match(pieceKey(url, i));
    let piece = hit ? new Uint8Array(await hit.arrayBuffer()) : null;
    if (!piece || piece.length !== end - start + 1) {
      const res = await fetchWatched(url, { headers: { Range: `bytes=${start}-${end}` } });
      if (res.status !== 206) {
        if (res.ok) return null;
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const size = Number((res.headers.get('content-range') || '').split('/')[1]);
      if (size !== total) return null;
      piece = await readBody(res, label, got, total);
      if (piece.length !== end - start + 1) throw new Error(`piece ${i} of ${url}: ${piece.length} bytes`);
      await keepPiece(i, piece);
    }
    u8.set(piece, start);
    got += piece.length;
    post({ type: 'progress', label, got, total });
  }
  return u8;
}
/** The pieces of a file whose bytes did not make a readable file (a version change in mid-download): fetched anew next time. */
async function dropPieces(url: string): Promise<void> {
  try {
    const cache = await caches.open(PARTS);
    for (const k of await cache.keys()) if (k.url.startsWith(url)) await cache.delete(k);
  } catch {
    /* nothing to drop */
  }
}

// ---------------------------------------------------------------- unpacking, packing, fingerprints

const gzipped = (u8: Uint8Array): boolean => u8[0] === 0x1f && u8[1] === 0x8b;
/** Through one of the browser's streams (gzip, gunzip). */
const through = async (u8: Uint8Array<ArrayBuffer>, stream: GenericTransformStream): Promise<ArrayBuffer> =>
  new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer();
/** A file's contents from its bytes as fetched or kept (gzipped, or plain as a server may hand them). */
async function unpack(u8: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  if (!gzipped(u8)) return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  if (typeof DecompressionStream !== 'function') throw new Error('this browser cannot decompress gzip');
  return through(u8, new DecompressionStream('gzip'));
}
/** What a file's contents are, as the manifest names them beside a delta: the first 16 hex digits of their SHA-256. */
async function fingerprint(raw: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
  return Array.from(d.subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- what the phone keeps

const FILES = 'wayli-files-v1';
/** The cache's key for a file's version (a cache keeps things under addresses: this one is nowhere but there). */
const keyOf = (file: string, hash: string): string =>
  new URL(`kept/${encodeURIComponent(file)}?h=${encodeURIComponent(hash)}`, self.location.href).href;
/** A version of a file the phone holds: kept whole under `key`, or (`pieces`) as the pieces it was downloaded in by
 *  the app as it was before files were kept whole, under `key` and the piece's number. */
type Kept = { file: string; hash: string; key: string; pieces?: number };
/**
 * The files an earlier version of the app left as pieces (until 2026-11-16 a downloaded file stayed in the pieces it
 * came in). They are as good to make a newer version from as a file kept whole, so the first open after the change
 * fetches deltas too, and not every file anew. A set of pieces is taken for a whole file when they run from the first
 * on, each a full piece but the last; pieces of a download cut short pass for one too, and the fingerprint of what the
 * deltas make of them tells (the file is then downloaded).
 */
async function keptAsPieces(): Promise<Kept[]> {
  const sizes = new Map<string, number[]>(),
    parts = await caches.open(PARTS);
  for (const k of await parts.keys()) {
    const m = /^(.*)[?&]part=(\d+)$/.exec(k.url),
      r = m && (await parts.match(k));
    if (!m || !r) continue;
    const list = sizes.get(m[1]) || [];
    list[Number(m[2])] = Number(r.headers.get('content-length')) || (await r.clone().arrayBuffer()).byteLength;
    sizes.set(m[1], list);
  }
  const out: Kept[] = [];
  for (const [url, list] of sizes) {
    const u = new URL(url),
      file = u.pathname.split('/').pop() || '',
      hash = u.searchParams.get('v'),
      whole = Array.from(list).every((size, i) => size !== undefined && (size === PIECE || i === list.length - 1));
    if (file && hash && whole) out.push({ file, hash, key: url, pieces: list.length });
  }
  return out;
}
/** The gzipped bytes of a version the phone holds; null when they are no longer there. */
async function bytesOf(cache: Cache, k: Kept): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!k.pieces) {
    const r = await cache.match(k.key);
    return r ? new Uint8Array(await r.arrayBuffer()) : null;
  }
  const parts = await caches.open(PARTS),
    got: Uint8Array[] = [];
  for (let i = 0; i < k.pieces; i++) {
    const r = await parts.match(pieceKey(k.key, i));
    if (!r) return null;
    got.push(new Uint8Array(await r.arrayBuffer()));
  }
  const out = new Uint8Array(got.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of got) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
async function keptIn(cache: Cache): Promise<Kept[]> {
  const out: Kept[] = [];
  for (const k of await cache.keys()) {
    const u = new URL(k.url),
      file = decodeURIComponent(u.pathname.split('/').pop() || ''),
      hash = u.searchParams.get('h');
    if (file && hash) out.push({ file, hash, key: k.url });
  }
  return out;
}
/** Keep a file's version (its gzipped bytes), then let go of what it replaces: the file's other versions, and once
 *  the first day's file is in, every file the manifest no longer lists (the days gone by). Never fails the load: a
 *  phone out of room fetches again next time. */
async function keep(cache: Cache, file: string, hash: string, gz: Uint8Array<ArrayBuffer>): Promise<void> {
  try {
    await cache.put(
      keyOf(file, hash),
      new Response(gz, { headers: { 'content-type': 'application/gzip', 'content-length': String(gz.byteLength) } }),
    );
    const sweep = file === plan.firstDay && plan.files.length > 0; // today's file is in: the days gone by can go
    for (const k of await keptIn(cache))
      if ((k.file === file && k.hash !== hash) || (sweep && !plan.files.includes(k.file))) await cache.delete(k.key);
    // and any pieces of this file, of whatever version: it is kept whole now
    const parts = await caches.open(PARTS);
    for (const k of await parts.keys()) if (new URL(k.url).pathname.split('/').pop() === file) await parts.delete(k);
  } catch {
    /* not kept this time */
  }
}

// ---------------------------------------------------------------- deltas

/** What the manifest says about getting the files (controllers/loading.ts hands it over as soon as it is read): where
 *  the data is, the deltas published, every file listed and which is the first day's. */
let plan: { base: string; deltas: DeltaStep[]; files: string[]; firstDay: string } = {
  base: '',
  deltas: [],
  files: [],
  firstDay: '',
};
export function setDeltas(p: typeof plan): void {
  plan = p;
  swept = sweepPieces();
}
/** The pieces of files the manifest does not list go, before anything is fetched: they are what fills a phone (until
 *  2026-11-16 a day's pieces stayed for good once its day had passed, 4 MB more each day the app was opened), and a
 *  full phone can keep nothing new. Pieces are never what a newer file is made from, so nothing is lost with them. */
let swept: Promise<void> = Promise.resolve();
async function sweepPieces(): Promise<void> {
  if (!plan.files.length || typeof caches === 'undefined') return;
  try {
    const parts = await caches.open(PARTS);
    for (const k of await parts.keys())
      if (!plan.files.includes(new URL(k.url).pathname.split('/').pop() || '')) await parts.delete(k);
  } catch {
    /* nothing to sweep */
  }
}
const MOST_STEPS = 8, // deltas applied one after another, at most
  WORTH = 0.6; // deltas of more than this much of the file's own size: the file itself is fetched instead

type Way = { from: Kept; steps: DeltaStep[]; bytes: number };
/** The cheapest way to a file's version from one the phone keeps, along the published deltas (a few dozen: every
 *  way is tried); null when there is none. */
function cheapest(file: string, hash: string, kept: Kept[], seen: string[] = []): Way | null {
  const here = kept.find((k) => k.file === file && k.hash === hash);
  if (here) return { from: here, steps: [], bytes: 0 };
  const name = `${file}|${hash}`;
  if (seen.length >= MOST_STEPS || seen.includes(name)) return null;
  let best: Way | null = null;
  for (const d of plan.deltas) {
    if (d.to[0] !== file || d.to[1] !== hash) continue;
    const w = cheapest(d.from[0], d.from[1], kept, [...seen, name]);
    if (w && (!best || w.bytes + d.bytes < best.bytes))
      best = { from: w.from, steps: [...w.steps, d], bytes: w.bytes + d.bytes };
  }
  return best;
}
/** A file's contents made from a version the phone keeps and the deltas from it; null when there is no such way, or
 *  it would cost more than `WORTH` of the download. Throws when the deltas do not give the file the manifest names. */
async function byDeltas(
  cache: Cache,
  file: string,
  hash: string,
  bytes: number | undefined,
  label: string,
): Promise<ArrayBuffer | null> {
  if (!plan.deltas.length || typeof crypto === 'undefined' || !crypto.subtle) return null;
  const way = cheapest(file, hash, [...(await keptIn(cache)), ...(await keptAsPieces())]);
  if (!way || !way.steps.length || (bytes && way.bytes > bytes * WORTH)) return null;
  const held = await bytesOf(cache, way.from);
  if (!held) return null;
  post({ type: 'progress', label, got: 0, total: way.bytes, how: 'update' });
  let raw = new Uint8Array(await unpack(held));
  let got = 0;
  for (const step of way.steps) {
    const gz = await fetchWhole(plan.base + step.file, label, 'update', got, way.bytes);
    raw = applyDelta(raw, new Uint8Array(await unpack(gz)));
    got += step.bytes;
  }
  const made = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  if ((await fingerprint(made)) !== way.steps[way.steps.length - 1].sha)
    throw new Error(`the deltas to ${file} do not give the file`);
  return made;
}

// ---------------------------------------------------------------- a file's bytes

/**
 * A data file's contents (the container, unpacked), and progress on the way under `label`: opened from what the
 * phone keeps, updated from an older version by deltas, or downloaded. A file the manifest gives no version of, or a
 * browser without a cache, is fetched each time.
 */
export async function fileBytes({ url, bytes, file, hash }: DataFileArgs, label: string): Promise<ArrayBuffer> {
  await swept;
  const cache = file && hash && typeof caches !== 'undefined' ? await caches.open(FILES) : null;
  if (cache && file && hash) {
    const hit = await cache.match(keyOf(file, hash));
    if (hit) {
      const gz = new Uint8Array(await hit.arrayBuffer());
      post({ type: 'progress', label, got: gz.length, total: gz.length, how: 'open' });
      try {
        return await unpack(gz);
      } catch {
        await cache.delete(keyOf(file, hash)); // a copy that does not open is no copy
      }
    }
    try {
      const made = await byDeltas(cache, file, hash, bytes, label);
      if (made) {
        // kept in the background (packing 30 MB takes a phone a second or two, and the rider is waiting for the file)
        if (typeof CompressionStream === 'function')
          void through(new Uint8Array(made.slice(0)), new CompressionStream('gzip'))
            .then((gz) => keep(cache, file, hash, new Uint8Array(gz)))
            .catch(() => {});
        return made;
      }
    } catch (e) {
      console.warn('update by deltas failed, downloading the file', e);
    }
  }
  const pieces = !!bytes && typeof caches !== 'undefined';
  let u8 = pieces ? await fetchInPieces(url, label, bytes) : null;
  if (!u8) u8 = await fetchWhole(url, label);
  post({ type: 'progress', label, got: u8.length, total: u8.length, unpacking: true });
  try {
    const raw = await unpack(u8);
    if (cache && file && hash) {
      await keep(cache, file, hash, u8); // whole, and its pieces let go
    }
    return raw;
  } catch (e) {
    if (pieces) await dropPieces(url);
    throw e;
  }
}
