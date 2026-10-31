// Choosing a place for home, work or the saved list: a search box, my location, or a point on the map.
import { signal } from '@preact/signals';
import { focusBox, type Place } from './search';

export const title = signal('');
export const text = signal('');
export const place = signal<Place | null>(null);
let resolver: ((p: Place | null) => void) | null = null;

/** What the chooser's own flow needs from the controllers (state cannot import them): its history entry. */
export const hooks = {
  show: () => {}, // the panel opens (a history entry)
  close: () => {}, // and closes
};

export function open(t: string): Promise<Place | null> {
  return new Promise((resolve) => {
    resolver = resolve;
    title.value = t;
    text.value = '';
    place.value = null;
    hooks.show();
    focusBox('chQ', 50);
  });
}
/** Done, with a place or none; the panel closes (unless it is already closing, when the history did it). */
export function finish(p: Place | null, closing = true): void {
  const r = resolver;
  resolver = null;
  if (closing) hooks.close();
  if (r) r(p);
}
