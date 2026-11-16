// A new version of a file as what it takes from an older one: runs of bytes copied from the old file, and the bytes
// that are its own. The nightly build makes such a delta between what phones hold and what it publishes
// (pipeline/deltas.ts), and the phone makes the new file from the old one and the delta (worker/files.ts), instead of
// downloading megabytes that are almost all the bytes it has. The same code on both sides.
//
//   "WD1\n" | new length | length of the steps | the steps | the new file's own bytes
//   a step: a number n. Odd: the next (n - 1) / 2 own bytes. Even: n / 2 bytes copied from the old file, starting at
//   the end of the copy before plus the number that follows (zigzag: a run usually starts near where the last ended).
//   Numbers are varints (seven bits a byte, the high bit saying another byte follows).
//
// Nothing here knows what the files hold. A file whose numbers all shift when one thing is added (a list numbered by
// place, running offsets) copies badly; the timetable is laid out so that they do not (docs/architecture.md).

const MAGIC = [0x57, 0x44, 0x31, 0x0a]; // "WD1\n"
const BLOCK = 16, // the old file is known by its blocks of this many bytes
  WORTH = 24; // a run shorter than this is cheaper as own bytes than as a copy

/** Bytes written one after another, growing as needed. */
class Writer {
  bytes = new Uint8Array(1 << 16);
  length = 0;
  private room(n: number): void {
    if (this.length + n <= this.bytes.length) return;
    const more = new Uint8Array(Math.max(this.bytes.length * 2, this.length + n));
    more.set(this.bytes.subarray(0, this.length));
    this.bytes = more;
  }
  varint(v: number): void {
    this.room(8);
    for (; v >= 128; v = Math.floor(v / 128)) this.bytes[this.length++] = (v % 128) | 128;
    this.bytes[this.length++] = v;
  }
  append(from: Uint8Array, start: number, end: number): void {
    this.room(end - start);
    this.bytes.set(from.subarray(start, end), this.length);
    this.length += end - start;
  }
  done(): Uint8Array {
    return this.bytes.subarray(0, this.length);
  }
}
const hashAt = (b: Uint8Array, i: number): number => {
  let h = 2166136261;
  for (let k = 0; k < BLOCK; k++) h = Math.imul(h ^ b[i + k], 16777619);
  return h >>> 0;
};

/** The delta that makes `neu` from `old`. */
export function makeDelta(old: Uint8Array, neu: Uint8Array): Uint8Array {
  // where each block of the old file is, by its hash (the first block of a hash stands; a hit is checked byte by byte)
  let size = 1 << 12;
  while (size < (old.length / BLOCK) * 2) size *= 2;
  const where = new Int32Array(size).fill(-1),
    mask = size - 1;
  for (let i = 0; i + BLOCK <= old.length; i += BLOCK) {
    const slot = hashAt(old, i) & mask;
    if (where[slot] < 0) where[slot] = i;
  }
  const steps = new Writer(),
    own = new Writer();
  let i = 0, // where the new file is read
    ownFrom = 0, // the new file's bytes from here to i are not copied yet
    copyEnd = 0; // where the last copy ended in the old file
  const ownUntil = (to: number): void => {
    if (to === ownFrom) return;
    steps.varint((to - ownFrom) * 2 + 1);
    own.append(neu, ownFrom, to);
  };
  while (i + BLOCK <= neu.length) {
    let j = where[hashAt(neu, i) & mask];
    let same = j >= 0;
    for (let k = 0; same && k < BLOCK; k++) same = old[j + k] === neu[i + k];
    if (!same) {
      i++;
      continue;
    }
    // the run this block is part of: back to where it began (not past what is already written), on to where it ends
    let a = i;
    while (a > ownFrom && j > 0 && old[j - 1] === neu[a - 1]) {
      a--;
      j--;
    }
    let length = i + BLOCK - a;
    while (a + length < neu.length && j + length < old.length && old[j + length] === neu[a + length]) length++;
    if (length < WORTH) {
      i++;
      continue;
    }
    ownUntil(a);
    steps.varint(length * 2);
    const jump = j - copyEnd;
    steps.varint(jump >= 0 ? jump * 2 : -jump * 2 - 1);
    copyEnd = j + length;
    i = ownFrom = a + length;
  }
  ownUntil(neu.length);
  const head = new Writer();
  head.append(Uint8Array.from(MAGIC), 0, 4);
  head.varint(neu.length);
  head.varint(steps.length);
  const out = new Uint8Array(head.length + steps.length + own.length);
  out.set(head.done());
  out.set(steps.done(), head.length);
  out.set(own.done(), head.length + steps.length);
  return out;
}

/** The new file, from the old one and the delta between them. Throws on a delta that is not one, or that does not
 *  fit this old file (whoever applies it also checks the result against the new file's fingerprint: a delta applied
 *  to another old file than the one it was made from gives a file of the right length and the wrong bytes). */
export function applyDelta(old: Uint8Array, delta: Uint8Array): Uint8Array {
  let at = 0;
  const varint = (): number => {
    let v = 0,
      scale = 1;
    for (;;) {
      if (at >= delta.length) throw new Error('delta cut short');
      const b = delta[at++];
      v += (b & 127) * scale;
      if (b < 128) return v;
      scale *= 128;
    }
  };
  for (const m of MAGIC) if (delta[at++] !== m) throw new Error('not a delta');
  const out = new Uint8Array(varint()),
    stepsEnd = varint() + at;
  let own = stepsEnd,
    to = 0,
    copyEnd = 0;
  while (at < stepsEnd) {
    const n = varint();
    if (n % 2) {
      const length = (n - 1) / 2;
      if (own + length > delta.length || to + length > out.length) throw new Error('delta does not fit');
      out.set(delta.subarray(own, own + length), to);
      own += length;
      to += length;
    } else {
      const length = n / 2,
        jump = varint(),
        from = copyEnd + (jump % 2 ? -(jump + 1) / 2 : jump / 2);
      if (from < 0 || from + length > old.length || to + length > out.length) throw new Error('delta does not fit');
      out.set(old.subarray(from, from + length), to);
      copyEnd = from + length;
      to += length;
    }
  }
  if (to !== out.length || own !== delta.length) throw new Error('delta does not fit');
  return out;
}
