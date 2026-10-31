// Finding places: the search over stops and the address book on one scale, what is at a point on the map, and stored
// places named again in another language.
import { searchStops, stopName, stopOrStationName } from '../engine/raptor.ts';
import { searchPlaces, kindLabel, reverseGeocode, placeAt, type Lang } from '../engine/places.ts';
import { haversine } from '../engine/geo.ts';
import { lang, pl, tt } from './data.ts';
import { codeIndex } from './stops.ts';
import type { OpsPart, ReverseHit, SearchPlaceHit, SearchStopHit } from './ops.ts';
import type { PlanPlace } from './ops.ts';

/** What is at (lat, lon), named in `L`: the nearest address, place or street, else the nearest stop, else the point. */
function reverseIn(lat: number, lon: number, L: Lang): ReverseHit {
  if (pl) {
    const r = reverseGeocode(pl, lat, lon, L);
    if (r)
      return {
        name: r.city && (r.kind as string) !== 'city' ? `${r.name}, ${r.city}` : r.name, // never 'city' (NearestPlace): kept as it was
        kind: r.kind,
        distance: r.distance,
      };
  }
  let best = -1,
    bd = 600;
  for (let s = 0; s < tt!.stops.length; s++) {
    const d = haversine(lat, lon, tt!.stopLat[s], tt!.stopLon[s]);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  if (best >= 0) return { name: stopName(tt!, best, L), kind: 'stop', distance: Math.round(bd) };
  return { name: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, kind: 'point', distance: 0 };
}

export const searchOps = {
  /**
   * Stored places named again in `lang`: a stop by its code (its station's name where it is part of one), an
   * address-book place by its exact position. A name, null where neither finds it, or false while the data it needs
   * is still loading (ask again later).
   */
  localize({ places, lang: L, words }) {
    // a point picked on the map was named by reverseIn at that point ("near X" from 40 m): name it again the same way
    const picked = (p: PlanPlace): string | null => {
      const named: Record<Lang, string> = { he: '', en: '' };
      for (const W of ['he', 'en'] as const) {
        const r = reverseIn(p.lat!, p.lon!, W);
        if (r.kind === 'point') named[W] = words[W].point;
        else if (r.distance > 40) named[W] = words[W].near.replace('{name}', r.name);
        else named[W] = r.name;
      }
      return named.he === p.name || named.en === p.name ? named[L] : null;
    };
    return places.map((p) => {
      if (p.code != null && p.code !== '') {
        if (!tt) return false;
        const s = codeIndex().get(String(p.code));
        if (s === undefined) return null;
        return stopOrStationName(tt, s, L);
      }
      if (p.lat == null || p.lon == null) return null;
      if (!pl || !tt) return false;
      return placeAt(pl, p.lat, p.lon, L, p.name) || picked(p);
    });
  },
  /** Stops and stations first, then addresses, streets, places and cities from the address book. */
  search({ q, limit = 10, lang: L = lang, near = null }) {
    // stops and places on one scale: match strength (whole words over prefixes), nearness, and a point
    // ahead of a street at equal strength (a stop is what the planner boards; an address when a number was typed)
    const bandBonus = (g: { lat: number; lon: number }): number => {
      if (!near) return 0;
      const km = haversine(near.lat, near.lon, g.lat, g.lon) / 1000;
      if (km < 3) return 3;
      return km < 15 ? 1.5 : 0;
    };
    const stops = searchStops(tt!, q, limit, L).map((g): SearchStopHit => ({
      kind: 'stop',
      key: g.key,
      name: g.name,
      city: g.city,
      stops: g.stops,
      lat: g.lat,
      lon: g.lon,
      code: g.code,
      platforms: g.stops.length,
      rank: g.score + 1 + bandBonus(g),
    }));
    const hasDigit = /\d/.test(q);
    let places: SearchPlaceHit[] = [];
    if (pl) {
      places = searchPlaces(pl, q, limit, near, L).map((r): SearchPlaceHit => ({
        kind: r.kind,
        name: r.name,
        city: r.city,
        lat: r.lat,
        lon: r.lon,
        approx: r.approx ?? null,
        label: r.kind === 'poi' ? kindLabel(r.poiKind!, L) : null,
        score: r.score,
        rank: r.score + (hasDigit && r.kind === 'address' ? 3 : 0),
      }));
    }
    const merged = [...stops, ...places]
      .map((r, i) => ({ r, i }))
      .sort((a, b) => b.r.rank - a.r.rank || a.i - b.i)
      .map((x) => x.r);
    return { results: merged.slice(0, limit + 4), placesLoaded: !!pl };
  },
  /** A name for a point on the map: address, place or street from the address book, else the nearest stop. */
  reverse({ lat, lon }) {
    return reverseIn(lat, lon, lang);
  },
} satisfies OpsPart<'localize' | 'search' | 'reverse'>;
