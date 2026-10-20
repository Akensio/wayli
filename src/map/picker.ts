// Picking a place on the map: a tap drops a pin with a bubble (the place's name, a Choose button); another
// tap moves it; a tap on a stop picks the stop; Cancel in the bar leaves.
import type { Map as MLMap } from 'maplibre-gl';
import { esc } from '../ui/html';
import { t } from '../i18n';
import { call } from '../worker/client';
import * as nav from '../state/nav';
import * as search from '../state/search';
import { lastPos } from '../state/position';
import type { Place } from '../state/search';
import { mapReady, pick } from './shared';
import { openPopup, closePopup, setPopupTitle } from './popups';

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
export async function pickAt(m: MLMap, lngLat: [number, number], stopHit: { stop: number; name: string } | null): Promise<void> {
  const my = ++pick.seq;
  if (pick.marker) pick.marker.remove();
  const el = document.createElement('div'); el.className = 'wayli-pick';
  pick.marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(lngLat).addTo(m);
  let picked: Place = stopHit ? { name: stopHit.name, stops: [stopHit.stop], lat: lngLat[1], lon: lngLat[0] } : { name: '…', lat: lngLat[1], lon: lngLat[0] };
  openPopup(m, lngLat, `<div class="pop"><b>${esc(picked.name)}</b>${stopHit ? `<div class="muted">${t('kindStop')}</div>` : ''}<div class="row"><button type="button" class="primary slim" data-act="choose">${t('choose')}</button></div></div>`,
    (el2) => el2.querySelector('[data-act="choose"]')?.addEventListener('click', () => { closePopup(); closePicker(picked); }));
  if (stopHit) return;
  try {
    const r: any = await call('reverse', { lat: lngLat[1], lon: lngLat[0] });
    picked = { ...picked, name: r.kind === 'point' ? t('pointName') : r.distance > 40 ? t('nearName', { name: r.name }) : r.name };
  } catch { picked = { ...picked, name: t('pointName') }; }
  if (my === pick.seq && nav.isOpen('picker')) setPopupTitle(picked.name);   // the name fills in; reopening the bubble would flicker
}
/** Done, with a place or none; the panel closes (unless the history already did it). */
export function closePicker(p: Place | null, closing = true): void {
  const r = resolver; resolver = null;
  if (pick.marker) { pick.marker.remove(); pick.marker = null; }
  closePopup();
  if (closing) nav.close('picker');
  if (r) r(p);
}
