// The container every data file comes in, as the pipeline writes it (pipeline/compile.py describes it): a
// little-endian uint32, the length of the header; the header, JSON, listing the sections; then the sections, each a
// typed array at its offset in the body. The timetable, the street graph, the address book and the courses are read
// with it, each adding what it derives.
const TYPES = { int32: Int32Array, uint16: Uint16Array, uint8: Uint8Array, float32: Float32Array } as const;

export type SectionType = keyof typeof TYPES;
/** One section as the header lists it: its name, element type, byte offset in the body and element count. */
export type Section = { name: string; dtype: SectionType; offset: number; length: number };
/** What every header has; each file's own header type adds its fields (the date, the counts, the format). */
export type ContainerHeader = { sections: Section[] };
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
