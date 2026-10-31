// Stored places (recent searches, saved places and trips, the bar's places) keep the name they were picked with, in
// the language of that moment. Shown in the other language, each is looked up again in the data worker (a stop by its
// code, an address-book place by its exact position) and shown under its name in the current language; until the
// answer comes, and where nothing is found (a point dropped on the map), the stored name shows.
import { signal } from '@preact/signals';
import { lang, t } from '../lib/i18n';
import * as data from './data';
import type { Place } from './search';
import type { Lang } from '../engine/text.ts';
import { unset } from '../lib/unset';

/** Filled in by the app at start: the worker's lookup. A name, null (not found) or false (its data is still loading). */
export const hooks = {
  localize: (_places: Place[], _lang: Lang): Promise<(string | null | false)[]> => unset('names.localize'),
};

const known = signal(new Map<string, string | null>());
const asked = new Map<string, Place>();
let flushing = 0;
const keyOf = (p: Place, L: string) => `${L}|${p.code ?? ''}|${p.lat ?? ''},${p.lon ?? ''}|${p.name}`;

async function flush(L: Lang): Promise<void> {
  const batch = [...asked.entries()];
  asked.clear();
  try {
    const names = await hooks.localize(
      batch.map(([, p]) => p),
      L,
    );
    const m = new Map(known.value);
    // only real answers are kept: a lookup not wired yet, or data still loading, is asked again on the next render
    batch.forEach(([k], i) => {
      const n = names[i];
      if (n === null || typeof n === 'string') m.set(k, n);
    });
    known.value = m;
  } catch {
    /* the stored names stay */
  }
}

/** A stored place's name in the interface's language. */
export function placeName(p: Place | null | undefined): string {
  if (!p) return '';
  if (p.transient) return t('myLoc');
  const L = lang.value;
  void data.plReady.value;
  void data.ttReady.value; // asked again once the address book and the timetable are in
  const k = keyOf(p, L),
    m = known.value;
  if (m.has(k)) return m.get(k) || p.name;
  if (!asked.has(k)) {
    asked.set(k, p);
    clearTimeout(flushing);
    flushing = window.setTimeout(() => flush(L), 0);
  }
  return p.name;
}
/** The place as it should be used now: named in the interface's language. */
export const named = <T extends Place>(p: T): T => ({ ...p, name: placeName(p) });
