// The delta between two versions of a file (src/engine/delta.ts): what is made from the old file and the delta is the
// new file, byte for byte, whatever changed; a small change makes a small delta; a delta that is not for this old file
// is refused or gives a file its fingerprint will not match, never a crash.
import { test, expect } from 'vitest';
import { makeDelta, applyDelta } from '../src/engine/delta.ts';

/** Bytes with no pattern to them, the same for the same seed. */
function noise(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}
const join = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const old = noise(200_000, 1);

test('the new file comes back byte for byte, and a small change is a small delta', () => {
  const cases: [string, Uint8Array, number][] = [
    ['nothing changed', old.slice(), 40],
    ['a few bytes added in the middle', join(old.subarray(0, 70_001), noise(37, 2), old.subarray(70_001)), 120],
    ['a stretch removed', join(old.subarray(0, 50_000), old.subarray(53_333)), 60],
    ['its halves the other way round', join(old.subarray(100_000), old.subarray(0, 100_000)), 60],
    [
      'three changes far apart',
      join(
        old.subarray(0, 10),
        noise(5, 3),
        old.subarray(10, 99_000),
        old.subarray(99_500, 180_000),
        noise(900, 4),
        old.subarray(180_000),
      ),
      1100,
    ],
    ['more at the end', join(old, noise(3_000, 5)), 3100],
  ];
  for (const [what, neu, most] of cases) {
    const delta = makeDelta(old, neu);
    expect(Buffer.compare(applyDelta(old, delta), neu), what).toBe(0);
    expect(delta.length, what).toBeLessThan(most);
  }
});
test('files with nothing in common, an empty one, a tiny one', () => {
  for (const [a, b] of [
    [old, noise(5_000, 9)],
    [new Uint8Array(0), noise(1_000, 9)],
    [old, new Uint8Array(0)],
    [noise(7, 1), noise(9, 2)],
  ]) {
    const delta = makeDelta(a, b);
    expect(Buffer.compare(applyDelta(a, delta), b)).toBe(0);
    expect(delta.length).toBeLessThan(b.length + 24); // never much more than the file itself
  }
});
test('a delta for another old file, a cut one, or bytes that are no delta', () => {
  const neu = join(old.subarray(0, 70_000), noise(37, 2), old.subarray(70_000));
  const delta = makeDelta(old, neu);
  expect(() => applyDelta(old.subarray(0, 1_000), delta)).toThrow(/does not fit/);
  expect(() => applyDelta(old, delta.subarray(0, delta.length - 5))).toThrow(/fit|short/);
  expect(() => applyDelta(old, noise(50, 3))).toThrow(/not a delta/);
  // the same length, other bytes: a file comes out, and it is not the new one (the fingerprint check is what tells)
  expect(Buffer.compare(applyDelta(noise(200_000, 8), delta), neu)).not.toBe(0);
});
