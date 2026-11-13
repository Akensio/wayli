// Finding places: the search over stops and the address book on one scale, what is at a point on the map, and stored
// places named again in another language.
import { stopName, stopOrStationName, cityName, centreOf } from '../engine/raptor.ts';
import {
  reverseGeocode,
  placeAt,
  addressAt,
  houseOn,
  streetName,
  poiName,
  cityOf,
  kindLabel,
  type Lang,
} from '../engine/places.ts';
import { find, type Hit } from '../engine/find.ts';
import { haversine } from '../engine/geo.ts';
import { lang, pl, sx, tt } from './data.ts';
import { codeIndex, catalogues, sameNamed, stopOfId } from './stops.ts';
import type { OpsPart, ReverseHit, SearchHit, SearchPlaceHit, SearchStopHit } from './ops.ts';
import type { PlanPlace } from './ops.ts';

/** What is at (lat, lon), named in `L`: the nearest address, place or street, else the nearest stop, else the point. */
function reverseIn(lat: number, lon: number, L: Lang): ReverseHit {
  if (pl) {
    const r = reverseGeocode(pl, lat, lon, L);
    if (r)
      return {
        name: r.city ? `${r.name}, ${r.city}` : r.name,
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

/** A stop or station found, as the list shows it: with every stop that is the same place to a rider (stops.ts
 *  sameNamed). Null when the day's timetable has no such stop. */
function stopRow(h: Hit, L: Lang): SearchStopHit | null {
  const s = stopOfId(h.ref);
  if (s === undefined) return null;
  const g = sameNamed(s),
    at = centreOf(tt!, g.stops);
  return {
    kind: 'stop',
    key: g.key,
    name: stopOrStationName(tt!, s, L),
    city: cityName(tt!, tt!.stops[s][3], L),
    stops: g.stops,
    lat: at.lat,
    lon: at.lon,
    code: g.stops.length === 1 && h.kind === 'stop' ? tt!.stops[s][2] : '',
    platforms: h.kind === 'station' ? g.stops.length : 1,
    rank: h.score,
  };
}
/** An entry of the address book found, as the list shows it: a city, a street, an address on it when a house number
 *  was typed (the nearest number the book has, said as such, when not that very one), or a place with its kind and
 *  the address it is at. */
function placeRow(h: Hit, L: Lang): SearchPlaceHit | null {
  const book = pl!,
    row = { approx: null, label: null, address: null, score: h.score, rank: h.score };
  if (h.kind === 'city') {
    const c = book.cities[h.ref];
    return { ...row, kind: 'city', name: cityOf(book, c[0], L), city: '', lat: c[1], lon: c[2] };
  }
  if (h.kind === 'street') {
    const st = book.streets[h.ref],
      name = streetName(book, h.ref, L),
      city = cityOf(book, st[1], L),
      house = h.number && houseOn(book, h.ref, h.number.number, h.number.suffix);
    if (!h.number || !house) return { ...row, kind: 'street', name, city, lat: st[2], lon: st[3] };
    return {
      ...row,
      kind: 'address',
      name: `${name} ${h.number.number}${h.number.suffix}`,
      city,
      lat: book.addrLat[house.index],
      lon: book.addrLon[house.index],
      approx: house.exact ? null : book.addrNumber[house.index],
    };
  }
  const p = book.pois[h.ref];
  // a place's row says where it is: the nearest address within 120 m (customers, 2026-11-08)
  const at = addressAt(book, p[3], p[4], L);
  return {
    ...row,
    kind: 'poi',
    name: poiName(book, h.ref, L),
    city: cityOf(book, p[2], L),
    lat: p[3],
    lon: p[4],
    label: kindLabel(p[1], L),
    address: at ? at.name : null,
  };
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
  /**
   * The place search: what was typed, to stops, stations, addresses, streets, places and cities, best first
   * (engine/find.ts, over the catalogue). Each row is named in `lang`; entries that would read the same on screen are
   * one row. `placesLoaded` false while only stops can be found (the address book's catalogue is not in yet).
   */
  search({ q, limit = 10, lang: L = lang, near = null }) {
    const c = catalogues();
    const results: SearchHit[] = [],
      shown = new Map<string, SearchHit>();
    // more than are shown: several entries may be one row (a station's platforms, the pieces of a long park)
    for (const h of find(c, q, { near, limit: limit * 4 })) {
      const row = h.kind === 'stop' || h.kind === 'station' ? stopRow(h, L) : placeRow(h, L);
      if (!row) continue;
      // what reads the same is one row: the first found stands; stops of one name close by are one place, all of them
      const reads =
        row.kind === 'stop'
          ? `stop|${row.name}|${row.city}`
          : `${row.kind}|${row.name}|${row.city}|${row.label || ''}|${row.address || ''}`;
      const first = shown.get(reads);
      // two stops of one name far apart in one city are two places, and each can be chosen: both are listed
      const apart =
        first &&
        first.kind === 'stop' &&
        row.kind === 'stop' &&
        haversine(first.lat, first.lon, row.lat, row.lon) >= 600;
      if (first && !apart) {
        if (first.kind === 'stop' && row.kind === 'stop') {
          first.stops = [...new Set([...first.stops, ...row.stops])];
          Object.assign(first, centreOf(tt!, first.stops), { code: '' });
        }
        continue;
      }
      if (results.length >= limit) continue; // the list is full; the rest may still add stops to a row on it
      if (!first) shown.set(reads, row);
      results.push(row);
    }
    return { results, placesLoaded: !!sx };
  },
  /** A name for a point on the map: address, place or street from the address book, else the nearest stop. */
  reverse({ lat, lon }) {
    return reverseIn(lat, lon, lang);
  },
} satisfies OpsPart<'localize' | 'search' | 'reverse'>;
