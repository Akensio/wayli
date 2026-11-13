// The container every data file comes in, as the pipeline writes it (pipeline/compile.py describes it): a
// little-endian uint32, the length of the header; the header, JSON, listing the sections; then the sections, each a
// typed array at its offset in the body. The timetable, the street graph, the address book, the courses and the search
// catalogue are read with it, each adding what it derives; the catalogue (and the tests' tiny files) are written with it.
const TYPES = { int32: Int32Array, uint16: Uint16Array, uint8: Uint8Array, float32: Float32Array } as const;

export type SectionType = keyof typeof TYPES;
/** One section as the header lists it: its name, element type, byte offset in the body and element count. */
export type Section = { name: string; dtype: SectionType; offset: number; length: number };
/** What every header has; each file's own header type adds its fields (the date, the counts, the format). */
export type ContainerHeader = {
  sections: Section[];
  /** What the file says, as the pipeline's 16 hex digits (pipeline/container.py): the same for the same contents. */
  hash?: string;
};
export type TypedSection = Int32Array | Uint16Array | Uint8Array | Float32Array;
/** The header and the sections by name. A reader names the sections it expects (`S`), so a misspelt one is a type
 *  error rather than an undefined at run time. */
export type Container<S extends string, H extends ContainerHeader = ContainerHeader> = { header: H } & Record<
  S,
  TypedSection
>;

/** The header and each section by name, as typed arrays over the buffer itself (nothing is copied). */
export function readContainer<S extends string, H extends ContainerHeader = ContainerHeader>(
  ab: ArrayBuffer,
): Container<S, H> {
  const headerLen = new DataView(ab).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, headerLen))) as H;
  const base = 4 + headerLen,
    out: Record<string, unknown> = { header };
  for (const s of header.sections) out[s.name] = new TYPES[s.dtype](ab, base + s.offset, s.length);
  return out as Container<S, H>;
}

/** A section to write: its name, element type and values. */
export type SectionIn = { name: string; dtype: SectionType; data: ArrayLike<number> };
/** The container's bytes: a uint32 header length, the header JSON padded to 4 bytes, the sections each at a 4-byte
 *  offset (as pipeline/container.py writes one). The header is given without `sections`; the writer adds them. */
export function writeContainer(header: Record<string, unknown>, sections: SectionIn[]): ArrayBuffer {
  const list: Section[] = [],
    parts: Uint8Array[] = [];
  let off = 0;
  for (const s of sections) {
    while (off % 4) {
      parts.push(new Uint8Array(1));
      off += 1;
    }
    const arr = new TYPES[s.dtype](s.data),
      bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    list.push({ name: s.name, dtype: s.dtype, offset: off, length: arr.length });
    parts.push(bytes);
    off += bytes.length;
  }
  let hjson: Uint8Array = new TextEncoder().encode(JSON.stringify({ ...header, sections: list }));
  const pad = (4 - ((4 + hjson.length) % 4)) % 4;
  if (pad) {
    const padded = new Uint8Array(hjson.length + pad).fill(32);
    padded.set(hjson);
    hjson = padded;
  }
  const out = new Uint8Array(4 + hjson.length + off);
  new DataView(out.buffer).setUint32(0, hjson.length, true);
  out.set(hjson, 4);
  let o = 4 + hjson.length;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out.buffer;
}
