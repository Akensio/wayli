// The search catalogues, built once a night: everything the search box can find, with the index of its words
// (src/engine/catalogue.ts says what is in one, src/engine/find.ts searches them). Two files, by how often their
// contents change: the address book's cities, streets and places (the book is rebuilt weekly, and this file's contents
// with it), and every compiled day's stops and stations (a few change most days; a tenth of the size). The app's own
// code builds them, here under Node, so the words of the names and the words a rider types are made by the same
// function; the phone only reads the result.
//   node pipeline/searchindex.ts data/places.bin.gz data/timetable-*.bin.gz --out data/search.bin.gz \
//     --stops data/searchstops.bin.gz
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parsePlaces, type Places } from '../src/engine/places.ts';
import { parseTimetable } from '../src/engine/raptor.ts';
import { buildCatalogue, catalogueFile, readCatalogue, type Catalogue } from '../src/engine/catalogue.ts';
import { writeContainer, readContainer, type SectionIn } from '../src/engine/container.ts';

const args = process.argv.slice(2);
/** The value of an option, taken out of the arguments. */
const option = (name: string): string => {
  const i = args.indexOf(name);
  return i < 0 ? '' : args.splice(i, 2)[1] || '';
};
const out = option('--out'),
  outStops = option('--stops'),
  [book, ...days] = args;
if (!out || !outStops || !book || !days.length) {
  console.error(
    'usage: node pipeline/searchindex.ts places.bin.gz timetable.bin.gz... --out search.bin.gz --stops searchstops.bin.gz',
  );
  process.exit(2);
}
const read = (file: string): ArrayBuffer => {
  const b = gunzipSync(readFileSync(file));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
/** Writes a catalogue's file, read back first (a catalogue the app could not read would leave every phone without a
 *  search), with its content hash as the other data files carry it (pipeline/container.py): the app keeps a file
 *  under its hash, so a catalogue built again from the same names is not downloaded again. */
function write(path: string, c: Catalogue, pl: Places | null, what: string): void {
  const { header, file } = catalogueFile(c, pl);
  const back = readCatalogue(file, pl);
  if (back.n !== c.n || back.ix.keys.length !== c.ix.keys.length || back.ix.entries.length !== c.ix.entries.length)
    throw new Error(`the catalogue of ${what} does not read back as it was built`);
  const hash = createHash('sha256').update(new Uint8Array(file)).digest('hex').slice(0, 16);
  const f = readContainer<string>(file);
  const sections: SectionIn[] = f.header.sections.map((s) => ({ name: s.name, dtype: s.dtype, data: f[s.name] }));
  const stamped = writeContainer({ ...header, built: new Date().toISOString().slice(0, 19) + 'Z', hash }, sections);
  const gz = gzipSync(new Uint8Array(stamped), { level: 9 });
  writeFileSync(path, gz);
  console.log(
    `search catalogue of ${what}: ${c.n} entries, ${c.ix.keys.length} words, ${c.cityKeys.length} cities; ` +
      `${(stamped.byteLength / 1e6).toFixed(1)} MB, ${(gz.length / 1e6).toFixed(2)} MB gzipped`,
  );
}
const t0 = performance.now();
const pl = parsePlaces(read(book));
write(out, buildCatalogue(pl, []), pl, 'the address book');
write(
  outStops,
  buildCatalogue(
    null,
    days.map((d) => parseTimetable(read(d))),
  ),
  null,
  `the stops of ${days.length} days`,
);
console.log(`in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
