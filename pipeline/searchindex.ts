// The search catalogue, built once a night: everything the search box can find (the address book's cities, streets
// and places, every compiled day's stops and stations) with the index of their words (src/engine/catalogue.ts says
// what is in it, src/engine/find.ts searches it). The app's own code builds it, here under Node, so the words of the
// names and the words a rider types are made by the same function; the phone only reads the result.
//   node pipeline/searchindex.ts data/places.bin.gz data/timetable-*.bin.gz --out data/search.bin.gz
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parsePlaces } from '../src/engine/places.ts';
import { parseTimetable } from '../src/engine/raptor.ts';
import { buildCatalogue, catalogueFile, readCatalogue } from '../src/engine/catalogue.ts';
import { writeContainer, readContainer, type SectionIn } from '../src/engine/container.ts';

const args = process.argv.slice(2),
  o = args.indexOf('--out');
const out = o >= 0 ? args[o + 1] : '',
  [book, ...days] = o >= 0 ? args.filter((_, i) => i !== o && i !== o + 1) : [];
if (!out || !book || !days.length) {
  console.error('usage: node pipeline/searchindex.ts places.bin.gz timetable.bin.gz... --out search.bin.gz');
  process.exit(2);
}
const read = (file: string): ArrayBuffer => {
  const b = gunzipSync(readFileSync(file));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const t0 = performance.now();
const pl = parsePlaces(read(book));
const c = buildCatalogue(
  pl,
  days.map((d) => parseTimetable(read(d))),
);
const { header, file } = catalogueFile(c, pl);
// read back before it is published: a catalogue the app could not read would leave every phone without a search
const back = readCatalogue(file, pl);
if (back.n !== c.n || back.ix.keys.length !== c.ix.keys.length || back.ix.entries.length !== c.ix.entries.length)
  throw new Error('the catalogue does not read back as it was built');
// what the file says, as the other data files carry it (pipeline/container.py): the app keeps a file under its hash,
// so a catalogue built again from the same book and stops is not downloaded again
const hash = createHash('sha256').update(new Uint8Array(file)).digest('hex').slice(0, 16);
const f = readContainer<string>(file);
const sections: SectionIn[] = f.header.sections.map((s) => ({ name: s.name, dtype: s.dtype, data: f[s.name] }));
const stamped = writeContainer({ ...header, built: new Date().toISOString().slice(0, 19) + 'Z', hash }, sections);
const gz = gzipSync(new Uint8Array(stamped), { level: 9 });
writeFileSync(out, gz);
console.log(
  `search catalogue: ${c.n} entries (${header.counts.stops} stops of ${days.length} days), ${c.ix.keys.length} words, ` +
    `${c.cityKeys.length} cities; ${(stamped.byteLength / 1e6).toFixed(1)} MB, ${(gz.length / 1e6).toFixed(2)} MB gzipped, ` +
    `in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
);
