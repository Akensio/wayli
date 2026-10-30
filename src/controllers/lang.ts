// The language: the page's lang and direction, then everything that carries names asks again (the worker's
// stop names and headsigns, the basemap's labels, the plan shown).
import { lang, storeLang } from '../lib/i18n';
import { call } from '../worker/client';
import * as search from '../state/search';
import * as results from '../state/results';
import * as map from '../map/index';
import type { Place } from '../state/search';
import { plan } from './planner';

export function applyLang(): void {
  document.documentElement.lang = lang.value;
  document.documentElement.dir = lang.value === 'he' ? 'rtl' : 'ltr';
}
export function setLang(l: 'he' | 'en'): void {
  storeLang(l);
  applyLang();
  if (map.mapState.main) map.setBasemapLang(map.mapState.main);
  // stop names, headsigns and map labels come from the worker: ask again in the new language
  call('setLang', { lang: l })
    .then(() => {
      map.resetLive();
      map.loadStopsGeo();
      const located = (p: Place | null) => !!p && !(p.transient && p.lat == null); // never a location prompt for a language switch
      if (results.result.value && located(search.from.value) && located(search.to.value)) plan();
    })
    .catch(() => {});
}
