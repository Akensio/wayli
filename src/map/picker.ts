// Picking a place on the map: a tap drops a pin with a bubble (the place's name, a Choose button); another
// tap moves it; a tap on a stop picks the stop; Cancel in the bar leaves.
import type { Map as MLMap } from 'maplibre-gl';
import { h } from 'preact';
import { signal } from '@preact/signals';
import { t } from '../lib/i18n';
import { call } from '../worker/client';
import * as nav from '../state/nav';
import * as search from '../state/search';
import { lastPos } from '../state/position';
import type { Place } from '../journey/types';
import { mapReady, pick } from './shared';
import { openPopup, closePopup } from './popups';
import { PickBubble } from './bubbles';
import { reverseName } from '../journey/format';

let resolver: ((p: Place | null) => void) | null = null;

export function pickOnMap(startAt: Place | null): Promise<Place | null> {
  return new Promise((resolve) => {
    resolver = resolve;
    nav.showOverlay('picker');
    (async () => {
      const m = await mapReady();
      if (!m || !resolver) return;
      const start = startAt && startAt.lat != null ? startAt : lastPos || search.from.value || search.to.value;
      if (start && start.lat != null) m.jumpTo({ center: [start.lon!, start.lat], zoom: Math.max(m.getZoom(), 15.5) });
    })();
  });
}
/** The pin and its bubble at a tapped point (or on a tapped stop). */
export async function pickAt(
  m: MLMap,
  lngLat: [number, number],
  stopHit: { stop: number; name: string } | null,
): Promise<void> {
  const my = ++pick.seq;
  if (pick.marker) pick.marker.remove();
  const el = document.createElement('div');
  el.className = 'wayli-pick';
  pick.marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(lngLat).addTo(m);
  const name = signal(stopHit ? stopHit.name : '…'); // filled in by the reverse geocoding, the bubble left open
  const picked = (): Place =>
    stopHit
      ? { name: name.value, stops: [stopHit.stop], lat: lngLat[1], lon: lngLat[0] }
      : { name: name.value, lat: lngLat[1], lon: lngLat[0] };
  openPopup(
    m,
    lngLat,
    h(PickBubble, {
      name,
      stop: !!stopHit,
      choose: () => {
        closePopup();
        closePicker(picked());
      },
    }),
  );
  if (stopHit) return;
  try {
    const r = await call('reverse', { lat: lngLat[1], lon: lngLat[0] });
    if (my === pick.seq) name.value = reverseName(r);
  } catch {
    if (my === pick.seq) name.value = t('pointName');
  }
}
/** Done, with a place or none; the panel closes (unless the history already did it). */
export function closePicker(p: Place | null, closing = true): void {
  const r = resolver;
  resolver = null;
  if (pick.marker) {
    pick.marker.remove();
    pick.marker = null;
  }
  closePopup();
  if (closing) nav.close('picker');
  if (r) r(p);
}
