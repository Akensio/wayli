// How the phone gets a data file (src/worker/files.ts), against a server that counts what it sends and a browser cache
// that is a map: its own copy when it has one (nothing fetched), deltas when it has an older version (a little
// fetched), the whole file otherwise; and the whole file again whenever the deltas are not to be trusted.
import { test, expect, beforeAll, beforeEach, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { makeDelta } from '../src/engine/delta.ts';
import type { DeltaStep } from '../src/worker/ops.ts';

/** Bytes with no pattern to them (gzip cannot shrink them: sizes on the wire are the sizes here). */
function noise(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}
const join = (...parts: Uint8Array[]): Uint8Array => Buffer.concat(parts);
const sha = (raw: Uint8Array): string => createHash('sha256').update(raw).digest('hex').slice(0, 16);

// the browser's cache, as a map per name
class FakeCache {
  kept = new Map<string, Uint8Array>();
  private url = (k: string | { url: string }): string =>
    new URL(typeof k === 'string' ? k : k.url, 'http://test/').href;
  async match(k: string): Promise<Response | undefined> {
    const b = this.kept.get(this.url(k));
    return b && new Response(new Uint8Array(b));
  }
  async put(k: string, r: Response): Promise<void> {
    this.kept.set(this.url(k), new Uint8Array(await r.arrayBuffer()));
  }
  async delete(k: string | { url: string }): Promise<boolean> {
    return this.kept.delete(this.url(k));
  }
  async keys(): Promise<{ url: string }[]> {
    return [...this.kept.keys()].map((url) => ({ url }));
  }
}
let stores: Record<string, FakeCache> = {};
const keptFiles = (): string[] =>
  [...(stores['wayli-files-v1']?.kept.keys() || [])]
    .map((u) => `${decodeURIComponent(new URL(u).pathname.split('/').pop()!)}@${new URL(u).searchParams.get('h')}`)
    .sort();

// the server: files by their address, and what each request took
let served: Record<string, Uint8Array> = {};
let fetched: { path: string; bytes: number }[] = [];
const fetchedBytes = (): number => fetched.reduce((n, f) => n + f.bytes, 0);
const BASE = 'http://test/data/';
/** Put a file's version on the server; its arguments for the worker. */
function publish(file: string, hash: string, raw: Uint8Array) {
  const gz = gzipSync(raw);
  served[`${file}?v=${hash}`] = gz;
  return { url: `${BASE}${file}?v=${hash}`, bytes: gz.length, file, hash };
}
/** Put the delta between two versions on the server; its line of the manifest. */
function delta(from: [string, string, Uint8Array], to: [string, string, Uint8Array], wrongSha = false): DeltaStep {
  const gz = gzipSync(makeDelta(from[2], to[2])),
    file = `deltas/${from[1]}-${to[1]}.gz`;
  served[file] = gz;
  return {
    file,
    bytes: gz.length,
    from: [from[0], from[1]],
    to: [to[0], to[1]],
    sha: wrongSha ? 'f'.repeat(16) : sha(to[2]),
  };
}

let files: typeof import('../src/worker/files.ts');
beforeAll(async () => {
  Object.assign(globalThis, {
    self: { postMessage() {}, location: { href: 'http://test/assets/worker.js' } },
    caches: {
      open: async (name: string) => (stores[name] ||= new FakeCache()),
      keys: async () => Object.keys(stores),
      match: async (k: string) => {
        for (const c of Object.values(stores)) {
          const hit = await c.match(k);
          if (hit) return hit;
        }
        return undefined;
      },
    },
  });
  vi.stubGlobal('fetch', async (url: string, init: { headers?: Record<string, string> } = {}) => {
    const path = String(url)
        .slice(BASE.length)
        .replace(/[?&]part=\d+$/, ''),
      body = served[path];
    if (!body) return new Response('', { status: 404 });
    const m = /bytes=(\d+)-(\d+)/.exec(init.headers?.Range || '');
    const part = m ? body.subarray(+m[1], +m[2] + 1) : body;
    fetched.push({ path, bytes: part.length });
    return new Response(new Uint8Array(part), {
      status: m ? 206 : 200,
      headers: m
        ? { 'content-range': `bytes ${m[1]}-${m[2]}/${body.length}` }
        : { 'content-length': String(body.length) },
    });
  });
  files = await import('../src/worker/files.ts');
});
beforeEach(() => {
  stores = {};
  served = {};
  fetched = [];
  files.setDeltas({ base: BASE, deltas: [], files: [], firstDay: '' });
});
const got = async (args: ReturnType<typeof publish>): Promise<Uint8Array> =>
  new Uint8Array(await files.fileBytes(args, 'timetable'));
/** Until what is kept in the background is kept. */
const settled = (want: string[]) => vi.waitFor(() => expect(keptFiles()).toEqual(want));

// a file of 300 kB, and versions of it that differ a little
const A = noise(300_000, 1),
  B = join(A.subarray(0, 100_000), noise(500, 2), A.subarray(100_000)),
  C = join(B.subarray(0, 250_000), noise(800, 3), B.subarray(251_000));

test('the first time the whole file is downloaded; after that it is opened from the phone, and nothing is fetched', async () => {
  const a = publish('streets.bin.gz', 'a', A);
  expect(Buffer.compare(await got(a), A)).toBe(0);
  expect(fetchedBytes()).toBe(a.bytes);
  expect(keptFiles()).toEqual(['streets.bin.gz@a']);
  expect(stores['wayli-parts-v1']?.kept.size || 0).toBe(0); // the pieces it came in are let go
  fetched = [];
  expect(Buffer.compare(await got(a), A)).toBe(0);
  expect(fetched).toEqual([]);
});

test('a newer version is made from the kept one and a delta: a fraction of the file is fetched', async () => {
  await got(publish('streets.bin.gz', 'a', A));
  const b = publish('streets.bin.gz', 'b', B);
  files.setDeltas({
    base: BASE,
    deltas: [delta(['streets.bin.gz', 'a', A], ['streets.bin.gz', 'b', B])],
    files: ['streets.bin.gz'],
    firstDay: '',
  });
  fetched = [];
  expect(Buffer.compare(await got(b), B)).toBe(0);
  expect(fetched.map((f) => f.path)).toEqual(['deltas/a-b.gz']);
  expect(fetchedBytes()).toBeLessThan(b.bytes / 100);
  await settled(['streets.bin.gz@b']); // the new version kept, the old one let go
  fetched = [];
  expect(Buffer.compare(await got(b), B)).toBe(0); // and it opens from the phone next time
  expect(fetched).toEqual([]);
});

test('a phone several nights behind applies the deltas one after another', async () => {
  await got(publish('streets.bin.gz', 'a', A));
  const c = publish('streets.bin.gz', 'c', C);
  files.setDeltas({
    base: BASE,
    deltas: [
      delta(['streets.bin.gz', 'b', B], ['streets.bin.gz', 'c', C]),
      delta(['streets.bin.gz', 'a', A], ['streets.bin.gz', 'b', B]),
    ],
    files: ['streets.bin.gz'],
    firstDay: '',
  });
  fetched = [];
  expect(Buffer.compare(await got(c), C)).toBe(0);
  expect(fetched.map((f) => f.path)).toEqual(['deltas/a-b.gz', 'deltas/b-c.gz']);
  await settled(['streets.bin.gz@c']);
});

test("today's timetable is made from yesterday's, which then goes", async () => {
  const mon = publish('timetable-20261116.bin.gz', 'm1', A);
  files.setDeltas({ base: BASE, deltas: [], files: [mon.file], firstDay: mon.file });
  await got(mon);
  // the next day: Monday's file is no longer listed, Tuesday's is, with a delta from Monday's
  const tue = publish('timetable-20261117.bin.gz', 't1', B);
  files.setDeltas({
    base: BASE,
    deltas: [delta([mon.file, 'm1', A], [tue.file, 't1', B])],
    files: [tue.file],
    firstDay: tue.file,
  });
  fetched = [];
  expect(Buffer.compare(await got(tue), B)).toBe(0);
  expect(fetched.map((f) => f.path)).toEqual(['deltas/m1-t1.gz']);
  await settled(['timetable-20261117.bin.gz@t1']);
});
test('the pieces of days gone by, which older versions of the app left on the phone for good, go with them', async () => {
  const parts = (stores['wayli-parts-v1'] = new FakeCache());
  for (let i = 0; i < 4; i++) parts.kept.set(`${BASE}timetable-20261101.bin.gz?v=old&part=${i}`, noise(1000, i));
  parts.kept.set(`${BASE}bustimes.bin.gz?v=x&part=0`, noise(1000, 9)); // of a file still listed: stays
  const today = publish('timetable-20261116.bin.gz', 'm1', A);
  files.setDeltas({ base: BASE, deltas: [], files: [today.file, 'bustimes.bin.gz'], firstDay: today.file });
  await got(today);
  expect([...parts.kept.keys()]).toEqual([`${BASE}bustimes.bin.gz?v=x&part=0`]);
});
test('a look at tomorrow does not cost today its file', async () => {
  const today = publish('timetable-20261116.bin.gz', 'm1', A),
    tomorrow = publish('timetable-20261117.bin.gz', 't1', B);
  files.setDeltas({
    base: BASE,
    deltas: [delta([today.file, 'm1', A], [tomorrow.file, 't1', B])],
    files: [today.file, tomorrow.file],
    firstDay: today.file,
  });
  await got(today);
  await got(tomorrow);
  await settled(['timetable-20261116.bin.gz@m1', 'timetable-20261117.bin.gz@t1']);
  fetched = [];
  await got(today);
  expect(fetched).toEqual([]);
});

test('deltas that do not give the file, are missing, or cost more than the file: the whole file is downloaded', async () => {
  await got(publish('streets.bin.gz', 'a', A));
  const b = publish('streets.bin.gz', 'b', B);
  // its fingerprint is not the one named
  files.setDeltas({
    base: BASE,
    deltas: [delta(['streets.bin.gz', 'a', A], ['streets.bin.gz', 'b', B], true)],
    files: [],
    firstDay: '',
  });
  fetched = [];
  expect(Buffer.compare(await got(b), B)).toBe(0);
  expect(fetchedBytes()).toBeGreaterThan(b.bytes);
  expect(keptFiles()).toEqual(['streets.bin.gz@b']);
  // the delta's file is not on the server
  const c = publish('streets.bin.gz', 'c', C);
  files.setDeltas({
    base: BASE,
    deltas: [
      { file: 'deltas/gone.gz', bytes: 100, from: ['streets.bin.gz', 'b'], to: ['streets.bin.gz', 'c'], sha: sha(C) },
    ],
    files: [],
    firstDay: '',
  });
  expect(Buffer.compare(await got(c), C)).toBe(0);
  // nothing in common with what is kept: the delta is as big as the file
  const other = noise(300_000, 9),
    d = publish('streets.bin.gz', 'd', other);
  files.setDeltas({
    base: BASE,
    deltas: [delta(['streets.bin.gz', 'c', C], ['streets.bin.gz', 'd', other])],
    files: [],
    firstDay: '',
  });
  fetched = [];
  expect(Buffer.compare(await got(d), other)).toBe(0);
  expect(fetched.every((f) => f.path.startsWith('streets.bin.gz'))).toBe(true);
});

test('a download cut short goes on from the pieces it has', async () => {
  const big = noise(2_500_000, 4),
    a = publish('streets.bin.gz', 'a', big);
  const whole = served['streets.bin.gz?v=a'];
  // the server answers the first piece and then is gone
  delete served['streets.bin.gz?v=a'];
  served['streets.bin.gz?v=a'] = whole;
  const real = globalThis.fetch;
  let calls = 0;
  vi.stubGlobal('fetch', async (...args: Parameters<typeof fetch>) => {
    if (++calls > 1) throw new Error('offline');
    return real(...args);
  });
  await expect(got(a)).rejects.toThrow(/offline/);
  vi.stubGlobal('fetch', real);
  fetched = [];
  expect(Buffer.compare(await got(a), big)).toBe(0);
  expect(fetchedBytes()).toBe(a.bytes - (1 << 20)); // the first megabyte was kept
});
