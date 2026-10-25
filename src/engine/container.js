// The container every data file comes in, as the pipeline writes it (pipeline/compile.py describes it): a
// little-endian uint32, the length of the header; the header, JSON, listing the sections; then the sections, each a
// typed array at its offset in the body. The timetable, the street graph, the address book and the courses are read
// with it, each adding what it derives.
const TYPES = { int32: Int32Array, uint16: Uint16Array, uint8: Uint8Array, float32: Float32Array };

/** The header and each section by name, as typed arrays over the buffer itself (nothing is copied). */
export function readContainer(ab) {
  const headerLen = new DataView(ab).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, headerLen)));
  const base = 4 + headerLen, out = { header };
  for (const s of header.sections) out[s.name] = new TYPES[s.dtype](ab, base + s.offset, s.length);
  return out;
}
