// What a search box's list holds, for the kind of search and the text typed (views/topbar/SearchField asks, its
// SuggestionList draws the answer):
//
//   trip box, empty           → the quick entries (my location, pick on the map, saved and recent places)
//   trip box, typed           → places matching, and (the To box) line numbers matching; nothing for one letter
//   line box, empty or typed  → lines near the rider (with those opened lately) or matching the number
//   stop box, empty or typed  → stops near the rider, every station for trains (with those opened lately), or matching
//
// Each box's answers come in the order it asked: an answer that arrives after the box asked again is dropped, so a
// slower search for an older text never replaces a newer list. A failed worker call lists nothing. The pause for the
// typing is the box's own (it is about the keys, not the list): `searchesText` tells it which answers are worth one.
import * as data from '../state/data';
import { recentViews } from '../state/store.ts';
import type { Kind, LineFilter, StopFilter, Side, LineGroup, StopGroup } from '../state/search';
import type { View } from '../journey/types';
import type { SearchHit } from '../worker/ops.ts';
import { findPlaces, findLineGroups, findStopGroups } from './planner';

/** What the list shows. One kind at a time, so the rows cannot contradict each other. */
export type Rows =
  /** An empty trip box: my location, pick on the map, saved and recent places (read by the list as it draws). */
  | { kind: 'quick' }
  /** What a trip box matched: places (stops among them), and line numbers in the To box; `placesLoaded` false while
   *  the address book is still coming (only stops can match yet). */
  | { kind: 'places'; results: SearchHit[]; lines: LineGroup[]; placesLoaded: boolean }
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
  lines?: boolean; // a trip box where line numbers match too (the To box)
  lineFilter?: LineFilter; // the line search's chips
  stopMode?: StopFilter; // the stops listed: the stop search's chips, or the kind of train of the timetable's side
  side?: Side; // a side of the train timetable (stations only; the To side lists no recents)
  fromStops?: number[]; // the To side: only the stations reachable from these (the From station's platforms)
};

/** Whether the text can be searched as places: two letters, or one digit in a box where line numbers match. */
const placeSearchable = (q: string, ctx: SuggestCtx): boolean =>
  (q.length >= 2 || (!!ctx.lines && /^\d+$/.test(q))) && data.ttReady.value;

/** Whether the answer searches for what is typed, so the box should let the typing pause before it asks. An empty box
 *  (its quick entries or what is near) and a text too short for places are answered at once. */
export function searchesText(kind: Kind, q: string, ctx: SuggestCtx): boolean {
  if (!q) return false;
  return kind !== 'trip' || placeSearchable(q, ctx);
}

/** What was opened lately, of the kind the chips choose, at most four (the To side of the timetable lists none). */
function recentFor(kind: 'line' | 'stop', ctx: SuggestCtx): View[] {
  const vs = recentViews.list();
  if (kind === 'line') {
    const f = ctx.lineFilter ?? 'all';
    return vs.filter((v) => v.type === 'line' && (f === 'all' || (v.mode || 'bus') === f)).slice(0, 4);
  }
  if (ctx.side === 'to') return [];
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
    return latest({ kind: 'stops', groups, near: !q, recent: q ? [] : recentFor('stop', ctx) });
  }
  if (!q) return latest({ kind: 'quick' });
  if (!placeSearchable(q, ctx)) return latest({ kind: 'none' });
  const [found, lines] = await Promise.all([
    orNothing(findPlaces(q), { results: [], placesLoaded: data.plReady.peek() }),
    ctx.lines && q.length <= 5 ? orNothing(findLineGroups(q, 'all', 3), []) : Promise.resolve([]),
  ]);
  return latest({ kind: 'places', results: found.results, lines, placesLoaded: found.placesLoaded });
}
