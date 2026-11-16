// The deltas between versions of the data files, made by the nightly build after the site is assembled: what a phone
// fetches instead of a whole file when it holds an older version (src/worker/files.ts applies them, src/engine/delta.ts
// is the delta itself, the same code here and there).
//   node pipeline/deltas.ts --site site --live https://akensio.github.io/wayli/data/
//
// What phones hold is what the live site serves, so that is what the deltas are made from:
// - across builds: for every file whose contents changed, from the live version to the new one;
// - between days: for each day's timetable, from the day before it in this build (a phone opens today's file holding
//   yesterday's), and from two or three days before where that is much smaller (Sunday's from Thursday's, not from
//   Saturday's);
// - the deltas the live site already lists stay for `--keep` nights, so a phone some nights behind goes from version
//   to version.
// A delta is listed only when it is well under the file's own size. Each names what its result must be (the SHA-256 of
// the new file, unpacked): the phone checks, and downloads the file whole on any doubt.
//
// A file's version is its content hash, and a delta is made from bytes: so a file whose contents did not change keeps
// the live site's very bytes (its build time, inside it, would differ otherwise, and a delta made from this build's
// copy would not fit the copy a phone holds).
//
// Without the live site (the first build ever, a network failure) the site is left as it was built, with no deltas:
// phones download whole files, as they did before there were deltas.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { makeDelta } from '../src/engine/delta.ts';

type FileEntry = { file: string; hash?: string; bytes?: number; built?: string };
type Delta = { file: string; bytes: number; from: [string, string]; to: [string, string]; sha: string; made: string };
type Manifest = { days: (FileEntry & { date: string })[]; deltas?: Delta[] } & Record<string, unknown>;

const args = process.argv.slice(2);
const option = (name: string, otherwise = ''): string => {
  const i = args.indexOf(name);
  return i < 0 ? otherwise : args[i + 1] || otherwise;
};
const site = option('--site'),
  live = option('--live').replace(/\/?$/, '/'),
  keepNights = Number(option('--keep', '8'));
if (!site || live === '/') {
  console.error('usage: node pipeline/deltas.ts --site site --live https://host/path/data/ [--keep 8]');
  process.exit(2);
}
const WORTH = 0.5, // a delta of more than this much of the file's own size is not listed
  MUCH_SMALLER = 0.5, // a delta from an earlier day is listed beside the day before's when it is this much of it
  DAYS_BACK = 3;
const dataDir = join(site, 'data');
const today = new Date().toISOString().slice(0, 10);

/** Every file of a manifest that has a version: the days, and the files listed one by one. */
const entries = (m: Manifest): FileEntry[] =>
  [...m.days, ...Object.values(m)].filter(
    (e): e is FileEntry => !!e && typeof e === 'object' && !Array.isArray(e) && 'file' in e && !!(e as FileEntry).hash,
  );
async function download(url: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}
const unpacked = (b: Buffer): Buffer => (b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b);
const sha = (raw: Buffer): string => createHash('sha256').update(raw).digest('hex').slice(0, 16);
const mb = (n: number): string => (n / 1e6).toFixed(2) + ' MB';

const fresh = JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf8')) as Manifest;
let before: Manifest;
try {
  before = JSON.parse((await download(live + 'manifest.json?t=' + Date.now())).toString('utf8')) as Manifest;
} catch (e) {
  console.log(`deltas: the live site did not answer (${e instanceof Error ? e.message : e}); none made this time`);
  process.exit(0);
}
const was = new Map(entries(before).map((e) => [e.file, e]));

// a version's unpacked bytes: this build's from the site folder, the live site's by download (a few kept at hand)
const atHand = new Map<string, Buffer>();
async function raw(e: FileEntry, from: 'site' | 'live'): Promise<Buffer> {
  const name = `${from}|${e.file}|${e.hash}`;
  let b = atHand.get(name);
  if (!b) {
    b = unpacked(
      from === 'site'
        ? readFileSync(join(dataDir, e.file))
        : await download(`${live}${e.file}?v=${encodeURIComponent(e.hash || '')}`),
    );
    atHand.set(name, b);
    if (atHand.size > 6) atHand.delete(atHand.keys().next().value!);
  }
  return b;
}

try {
  // ---- a file whose contents did not change keeps the live site's bytes
  const pinned: { e: FileEntry; bytes: Buffer; built?: string }[] = [];
  for (const e of entries(fresh)) {
    const old = was.get(e.file);
    if (old && old.hash === e.hash && old.built !== e.built)
      pinned.push({
        e,
        bytes: await download(`${live}${e.file}?v=${encodeURIComponent(e.hash || '')}`),
        built: old.built,
      });
  }
  // ---- the deltas
  const made: (Delta & { body: Buffer })[] = [];
  /** The delta between two versions, or null when it is not worth listing against `full` bytes. */
  const between = async (
    a: FileEntry,
    aFrom: 'site' | 'live',
    b: FileEntry,
    most = Infinity,
  ): Promise<(Delta & { body: Buffer }) | null> => {
    const to = await raw(b, 'site'),
      body = gzipSync(makeDelta(await raw(a, aFrom), to), { level: 9 });
    if (body.length > Math.min(most, (b.bytes || Infinity) * WORTH)) return null;
    return {
      file: `deltas/${a.hash}-${b.hash}.gz`,
      bytes: body.length,
      from: [a.file, a.hash!],
      to: [b.file, b.hash!],
      sha: sha(to),
      made: today,
      body,
    };
  };
  for (const e of entries(fresh)) {
    const old = was.get(e.file);
    if (!old || old.hash === e.hash) continue;
    const d = await between(old, 'live', e);
    console.log(`  ${e.file}: ${mb(e.bytes || 0)} -> ${d ? mb(d.bytes) : 'no delta worth it'} from the live version`);
    if (d) made.push(d);
  }
  for (let i = 1; i < fresh.days.length; i++) {
    const day = fresh.days[i];
    let least = Infinity;
    for (let k = 1; k <= DAYS_BACK && i - k >= 0; k++) {
      const d = await between(fresh.days[i - k], 'site', day, k === 1 ? Infinity : least * MUCH_SMALLER);
      if (!d) continue;
      console.log(`  ${day.file}: ${mb(day.bytes || 0)} -> ${mb(d.bytes)} from ${fresh.days[i - k].date}`);
      made.push(d);
      least = Math.min(least, d.bytes);
    }
  }
  // ---- the live site's deltas, for the phones some nights behind
  const oldest = new Date(Date.now() - keepNights * 86400e3).toISOString().slice(0, 10);
  const have = new Set(made.map((d) => d.file));
  let carried = 0;
  for (const d of before.deltas || []) {
    if (d.made < oldest || have.has(d.file)) continue;
    try {
      made.push({ ...d, body: await download(live + d.file) });
      have.add(d.file);
      carried++;
    } catch {
      /* gone from the live site: phones that far behind download the file */
    }
  }
  // ---- written only now, all at once: a failure above leaves the site as it was built
  for (const p of pinned) {
    writeFileSync(join(dataDir, p.e.file), p.bytes);
    p.e.bytes = p.bytes.length;
    p.e.built = p.built;
  }
  mkdirSync(join(dataDir, 'deltas'), { recursive: true });
  for (const d of made) writeFileSync(join(dataDir, d.file), d.body);
  fresh.deltas = made.map(({ body: _, ...d }) => d);
  writeFileSync(join(dataDir, 'manifest.json'), JSON.stringify(fresh, null, 1));
  console.log(
    `deltas: ${made.length - carried} made and ${carried} kept from the live site, ${mb(made.reduce((n, d) => n + d.bytes, 0))} in all; ` +
      `${pinned.length} unchanged files keep the live site's bytes`,
  );
} catch (e) {
  console.log(`deltas: none this time (${e instanceof Error ? e.message : e}); the site is as it was built`);
}
