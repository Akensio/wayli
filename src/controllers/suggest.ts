// What a search box's list holds, for the kind of search and the text typed (views/topbar/SearchField asks, its
// SuggestionList draws the answer):
//
//   trip box, empty           → the quick entries (my location, pick on the map, saved and recent places)
//   trip box, typed           → places and stops matching (lines are the line search's); nothing for one letter
//   line box, empty or typed  → lines near the rider (with those opened lately) or matching the number
//   stop box, empty or typed  → stops near the rider, every station for trains (with those opened lately), or matching
//
// Each box's answers come in the order it asked: an answer that arrives after the box asked again is dropped, so a
// slower search for an older text never replaces a newer list. A failed worker call lists nothing. The pause for the
// typing is the box's own (it is about the keys, not the list): `searchesText` tells it which answers are worth one.
import * as data from '../state/data';
import { recentViews } from '../state/store.ts';
import type { Kind, LineFilter, StopFilter, Side, LineGroup, StopGroup } from '../state/search';
import type { View } from '../state/store.ts';
import type { SearchHit } from '../worker/ops.ts';
import { findPlaces, findLineGroups, findStopGroups } from './planner';

/** What the list shows. One kind at a time, so the rows cannot contradict each other. */
export type Rows =
  /** An empty trip box: my location, pick on the map, saved and recent places (read by the list as it draws). */
  | { kind: 'quick' }
  /** What a trip box matched: places, stops among them; `placesLoaded` false while
   *  the address book is still coming (only stops can match yet). */
  | { kind: 'places'; results: SearchHit[]; placesLoaded: boolean }
  /** The line search: lines near the rider and those opened lately while empty (`near`), else those matching. */
  | { kind: 'lines'; groups: LineGroup[]; near: boolean; recent: View[] }
  /** The stop search, or a side of the train timetable: stops near (every station for trains) and those opened lately
   *  while empty (`near`), else those matching. */
  | { kind: 'stops'; groups: StopGroup[]; near: boolean; recent: View[] }
  /** Nothing to list: too little typed for a place search, or no timetable yet. The box closes its list. */
  | { kind: 'none' };

/** What a box asks with, besides its kind and text. */
export type SuggestCtx = {
  box: string; // the box asking (its id): each box's answers are ordered on their own
  lineFilter?: LineFilter; // the line search's chips
  stopMode?: StopFilter; // the stops listed: the stop search's chips, or the kind of train of the timetable's side
  side?: Side; // a side of the train timetable (stations only)
  fromStops?: number[]; // the To side: only the stations reachable from these (the From station's platforms)
  fromName?: string; // the To side: the From station's name (its recent destinations first; never itself)
};

/** Whether the text can be searched as places: two letters at least, once the timetable is in. */
const placeSearchable = (q: string): boolean => q.length >= 2 && data.ttReady.value;

/** Whether the answer searches for what is typed, so the box should let the typing pause before it asks. An empty box
 *  (its quick entries or what is near) and a text too short for places are answered at once. */
export function searchesText(kind: Kind, q: string): boolean {
  if (!q) return false;
  return kind !== 'trip' || placeSearchable(q);
}

/** What was opened lately, of the kind the chips choose, at most four (the To side of the timetable lists none). */
/** The To side of the train timetable: the stations used lately on either side (a station opened, both ends of a pair
 *  looked up), reachable from the From station without a change (`reach`: the names the To list holds), those looked up
 *  from this very station first; at most four, as stations to choose. */
function recentDestinations(ctx: SuggestCtx, reach: Set<string>): View[] {
  const mode = ctx.stopMode ?? 'all';
  const fits = (m: string | undefined) => mode === 'all' || mode === (m || 'rail');
  const fromHere: View[] = [],
    others: View[] = [];
  const seen = new Set<string>([ctx.fromName || '']);
  const add = (list: View[], s: { name: string; lat: number; lon: number }, m: 'rail' | 'lrt' | undefined) => {
    if (seen.has(s.name) || !reach.has(s.name) || !fits(m)) return;
    seen.add(s.name);
    list.push({ type: 'station', name: s.name, lat: s.lat, lon: s.lon, mode: m });
  };
  for (const v of recentViews.list()) {
    if (v.type === 'trains') {
      if (v.from.name === ctx.fromName) add(fromHere, v.to, v.mode);
      else {
        add(others, v.to, v.mode);
        add(others, v.from, v.mode);
      }
    } else if (v.type === 'station') add(others, v, v.mode);
  }
  return [...fromHere, ...others].slice(0, 4);
}

function recentFor(kind: 'line' | 'stop', ctx: SuggestCtx, groups: StopGroup[] = []): View[] {
  const vs = recentViews.list();
  if (kind === 'line') {
    const f = ctx.lineFilter ?? 'all';
    return vs.filter((v) => v.type === 'line' && (f === 'all' || (v.mode || 'bus') === f)).slice(0, 4);
  }
  if (ctx.side === 'to') return recentDestinations(ctx, new Set(groups.map((g) => g.name)));
  const f = ctx.stopMode ?? 'all';
  return vs
    .filter((v) => {
      if (v.type === 'stop') return f === 'all' || f === 'bus';
      if (v.type === 'station' || v.type === 'trains') return f === 'all' || f === (v.mode || 'rail');
      return false;
    })
    .slice(0, 4);
}

/** The one place a failed worker call becomes an empty answer. */
const orNothing = <T>(p: Promise<T>, nothing: T): Promise<T> => p.catch(() => nothing);

/** The last question each box asked, by its id. */
const asked = new Map<string, number>();

/** The list for `kind` and the text `q` (trimmed). Resolves to null when the same box asked again before this answer
 *  came: the box drops it. The signals it reads (the timetable being loaded) are read before the first wait, so an
 *  effect that asks follows them. */
export async function suggest(kind: Kind, q: string, ctx: SuggestCtx): Promise<Rows | null> {
  const my = (asked.get(ctx.box) ?? 0) + 1;
  asked.set(ctx.box, my);
  const latest = <T extends Rows>(r: T): T | null => (asked.get(ctx.box) === my ? r : null);

  if (kind === 'line') {
    const groups = data.ttReady.value ? await orNothing(findLineGroups(q, ctx.lineFilter ?? 'all'), []) : [];
    return latest({ kind: 'lines', groups, near: !q, recent: q ? [] : recentFor('line', ctx) });
  }
  if (kind === 'stop') {
    const from = ctx.side === 'to' ? ctx.fromStops : undefined;
    const groups = data.ttReady.value ? await orNothing(findStopGroups(q, ctx.stopMode ?? 'all', from), []) : [];
    return latest({ kind: 'stops', groups, near: !q, recent: q ? [] : recentFor('stop', ctx, groups) });
  }
  if (!q) return latest({ kind: 'quick' });
  if (!placeSearchable(q)) return latest({ kind: 'none' });
  const found = await orNothing(findPlaces(q), { results: [], placesLoaded: data.plReady.peek() });
  return latest({ kind: 'places', results: found.results, placesLoaded: found.placesLoaded });
}
