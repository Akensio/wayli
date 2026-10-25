// Finding places: the search over stops and the address book on one scale, what is at a point on the map, and stored
// places named again in another language.
import { searchStops, stopName, stationName } from '../engine/raptor.js';
import { searchPlaces, kindLabel, reverseGeocode, placeAt } from '../engine/places.js';
import { haversine } from '../engine/geo.js';
import { lang, pl, tt } from './data.js';
import { codeIndex } from './stops.js';

/** What is at (lat, lon), named in `L`: the nearest address, place or street, else the nearest stop, else the point. */
function reverseIn(lat, lon, L) {
  if (pl) {
    const r = reverseGeocode(pl, lat, lon, L);
    if (r) return { name: r.city && r.kind !== 'city' ? `${r.name}, ${r.city}` : r.name, kind: r.kind, distance: r.distance };
  }
  let best = -1, bd = 600;
  for (let s = 0; s < tt.stops.length; s++) {
    const d = haversine(lat, lon, tt.stopLat[s], tt.stopLon[s]);
    if (d < bd) { bd = d; best = s; }
  }
  if (best >= 0) return { name: stopName(tt, best, L), kind: 'stop', distance: Math.round(bd) };
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
    const picked = (p) => {
      const named = {};
      for (const W of ['he', 'en']) {
        const r = reverseIn(p.lat, p.lon, W);
        named[W] = r.kind === 'point' ? words[W].point : r.distance > 40 ? words[W].near.replace('{name}', r.name) : r.name;
      }
      return named.he === p.name || named.en === p.name ? named[L] : null;
    };
    return places.map((p) => {
      if (p.code != null && p.code !== '') {
        if (!tt) return false;
        const s = codeIndex().get(String(p.code));
        if (s === undefined) return null;
        const par = tt.stopParent[s];
        return (par >= 0 && stationName(tt, par, L)) || stopName(tt, s, L);
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
    const bandBonus = (g) => { if (!near) return 0; const km = haversine(near.lat, near.lon, g.lat, g.lon) / 1000; return km < 3 ? 3 : km < 15 ? 1.5 : 0; };
    const stops = searchStops(tt, q, limit, L).map((g) => ({ kind: 'stop', key: g.key, name: g.name, city: g.city, stops: g.stops, lat: g.lat, lon: g.lon, code: g.code, platforms: g.stops.length, rank: g.score + 1 + bandBonus(g) }));
    const hasDigit = /\d/.test(q);
    let places = [];
    if (pl) {
      places = searchPlaces(pl, q, limit, near, L).map((r) => ({ kind: r.kind, name: r.name, city: r.city, lat: r.lat, lon: r.lon, approx: r.approx ?? null,
        label: r.kind === 'poi' ? kindLabel(r.poiKind, L) : null, score: r.score, rank: r.score + (hasDigit && r.kind === 'address' ? 3 : 0) }));
    }
    const merged = [...stops, ...places].map((r, i) => ({ r, i })).sort((a, b) => b.r.rank - a.r.rank || a.i - b.i).map((x) => x.r);
    return { results: merged.slice(0, limit + 4), placesLoaded: !!pl };
  },
  /** A name for a point on the map: address, place or street from the address book, else the nearest stop. */
  reverse({ lat, lon }) { return reverseIn(lat, lon, lang); },
};
