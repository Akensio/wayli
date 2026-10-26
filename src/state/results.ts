// The results of a plan: what came back, how it is filtered and sorted into cards, which ways are drawn on
// the map and which one is highlighted, and the recent trips shown while there is nothing else. The list is
// derived from the signals, so filters, the language and the alternatives never rebuild it by hand.
import { signal, computed } from '@preact/signals';
import * as clock from '../engine/clock.js';
import { settings } from '../lib/store.js';
import { lang } from '../lib/i18n';
import * as search from './search';
import { now } from './clock';
import type { Journey, PlanResult, Query } from '../journey/types';

type Status = 'idle' | 'planning' | 'locating';
export type Sort = 'depart' | 'arrive' | 'fast' | 'changes';
export type Filters = { fDirect: boolean; fTrain: boolean; resultSort: Sort };
/** One card: the first option of a group, the other departures of the same lines. */
export type Card = { idx: number; j: Journey; q: Query; options: Journey[]; lines: string[][] | null };

export const SORTS: Sort[] = ['arrive', 'depart', 'fast', 'changes'];   // by arrival first: every plan starts so (Gadi)
const sortKey: Record<Sort, (j: Journey) => number> = { depart: (j) => j.depart, arrive: (j) => j.arrive, fast: (j) => j.arrive - j.depart, changes: (j) => j.transfers * 1e6 + j.depart };
// the filters are kept on the phone; the order is the plan's own (each plan starts by arrival)
const readFilters = (sort: Sort = 'arrive'): Filters => { const s = settings.get(); return { fDirect: !!s.fDirect, fTrain: !!s.fTrain, resultSort: sort }; };

export const result = signal<PlanResult | null>(null);
export const query = signal<Query | null>(null);
export const resultsAt = signal<number | null>(null);   // when the results were restored from an earlier session
export const status = signal<Status>('idle');           // the list gives way to "planning…" or "locating…"
export const error = signal('');
export const filters = signal<Filters>(readFilters());
export const altShown = signal<ReadonlySet<number>>(new Set());   // the cards drawn on the map
export const altSel = signal(-1);                                 // the one highlighted
/** Which history the drawer shows at rest: trips, lines or stops. It follows the bar's kind and can be switched on its
 *  own (without opening a search). */
export const recentTab = signal<'trip' | 'line' | 'stop'>('trip');
search.onKind((k) => { recentTab.value = k; });

/** The first ride's departure, or the journey's start. */
export const rideDep = (j: Journey): number => { const fr = j.legs.find((l) => l.type === 'ride'); return fr ? fr.depart! : j.depart; };
/** The way to the first ride, as planned: everything covered on foot (or by bike) before boarding. */
const toFirstRide = (j: Journey): number => { let s = 0; for (const l of j.legs) { if (l.type === 'ride') break; s += l.seconds || 0; } return s; };
const HURRIED = 0.6;   // hurrying (a fast walk or a jog, 2 m/s against the planned 1.2) takes 0.6 of the time; an estimate
/** Where a journey stands now (docs/architecture.md, "When to leave: the result list"). With L its start, B its first
 *  ride and n now: on time while n <= L; "hurry" while the time left before B still covers the way to the ride at a
 *  hurried pace; gone after that (the ride left, or leaves before the rider can reach it). A way with no ride is never
 *  late. */
export type Standing = 'ontime' | 'hurry' | 'gone';
export function standing(j: Journey, n: number): Standing {
  if (n <= j.depart || !j.legs.some((l) => l.type === 'ride')) return 'ontime';
  return rideDep(j) - n >= HURRIED * toFirstRide(j) ? 'hurry' : 'gone';
}

/** The cards in list order (idx is the group's place, so a card keeps its number on the map while its options move
 *  on), the ways still in reach if the rider hurries, and those just gone (a plan from now looks ten minutes back). */
function build(r: PlanResult | null, q: Query | null, at: number | null, f: Filters): { cards: Card[]; hurry: Journey[]; gone: Journey[]; filteredOut: boolean } {
  if (!r || !q || !r.journeys.length) return { cards: [], hurry: [], gone: [], filteredOut: false };
  let groups = r.groups || r.journeys.map((_, i) => ({ options: [i], lines: null }));
  // the option a card shows: the earliest departure from the time asked, or for arrive-by the latest that is in time
  const first = (g: { options: number[] }) => r.journeys[q.arriveBy ? g.options[g.options.length - 1] : g.options[0]];
  if (q.arriveBy) groups = groups.slice().sort((a, b) => first(b).depart - first(a).depart);   // latest departure first, by what each card shows
  if (f.fDirect) groups = groups.filter((g) => first(g).transfers === 0);
  if (f.fTrain) groups = groups.filter((g) => first(g).legs.some((l) => l.type === 'ride' && l.routeType === 2));
  // arrive-by keeps its own order by arrival (the latest that is in time first); every other order sorts (stable)
  if (!(q.arriveBy && f.resultSort === 'arrive')) { const sk = sortKey[f.resultSort]; groups = groups.slice().sort((a, b) => sk(first(a)) - sk(first(b)) || sortKey.depart(first(a)) - sortKey.depart(first(b))); }
  const nowSec = clock.nowOn(q.day);
  const where = (j: Journey): Standing => (q.isNow ? standing(j, nowSec) : 'ontime');   // a plan for a set time is read as asked
  const onStrip = (j: Journey) => rideDep(j) >= nowSec - 600 || (!!at && j.arrive > nowSec);   // left lately, or (restored) still under way
  const add = (to: Journey[], j: Journey) => { if (!to.some((o) => o.depart === j.depart && o.legs.length === j.legs.length)) to.push(j); };
  const cards: Card[] = [], hurry: Journey[] = [], gone: Journey[] = [];
  groups.forEach((g, idx) => {
    let opts = g.options.map((i) => r.journeys[i]);
    if (q.arriveBy) opts = opts.slice().reverse();
    for (const j of opts) { const w = where(j); if (w === 'hurry') add(hurry, j); else if (w === 'gone' && onStrip(j)) add(gone, j); }
    opts = opts.filter((j) => where(j) === 'ontime');
    if (opts.length) cards.push({ idx, j: opts[0], q, options: opts, lines: g.lines });
  });
  hurry.sort((a, b) => rideDep(a) - rideDep(b));
  return { cards, hurry, gone, filteredOut: !groups.length };
}
export const list = computed(() => { void lang.value; void now.value; return build(result.value, query.value, resultsAt.value, filters.value); });
/** Something fills the plan screen: a list, or the wait for one. */
export const showing = computed(() => status.value !== 'idle' || result.value != null);
/** The card highlighted on the map: the peek line's journey. */
export const highlighted = computed<Card | null>(() => list.value.cards.find((c) => c.idx === altSel.value && altShown.value.has(c.idx)) || null);

/** What the results need from the rest of the app. Filled in by the app at start. */
/** Something opened, as the history keeps it (store.js recentViews). */
type At = { name: string; lat: number; lon: number };
export type View = { at?: number } & (
  | { type: 'line'; ref: string; line: string; routeType: number; agency: string; headsign: string; mode?: string }
  | { type: 'stop'; code: string; name: string; city?: string; lat: number; lon: number }
  | ({ type: 'station'; mode?: 'rail' | 'lrt' } & At)
  | { type: 'trains'; from: At; to: At; mode?: 'rail' | 'lrt' }
  | { type: 'trip'; q: Query; j: Journey; built?: string });
export const hooks = {
  openDetail: (_j: Journey, _q: Query, _bikeOnly?: boolean) => {},
  startTrip: (_j: Journey, _q: Query) => {},
  plan: (_opts?: { maxWalk?: number }) => {},
  replan: (_q: Query) => {},       // a recent trip tapped: the bar filled from it, planned from now
  openView: (_v: View) => {},      // something opened before, opened again (store.js recentViews)
  afterResults: () => {},          // the sheet opens, the map draws
  redraw: () => {},                // the map draws the ways switched on
  peekChanged: () => {},           // the collapsed sheet follows the peek line's height
  peekTap: () => {},               // the peek line opens the sheet
  revealCard: (_idx: number, _open: boolean) => {},   // a way's card scrolled into view (the sheet opened first if asked)
};

/** The first three ways are drawn on the map, the first of them highlighted. */
function resetAlts(): void {
  const cards = list.value.cards;
  altShown.value = new Set(cards.slice(0, 3).map((c) => c.idx));
  altSel.value = cards.length ? cards[0].idx : -1;
}
export function setResults(r: PlanResult, q: Query, at: number | null = null): void {
  // the boxes stay open: picking a destination plans at once, and the time or the bike may still change (a change
  // plans again). They fold when the rider moves on: a tap on the map, a result opened, the sheet dragged, X or back.
  result.value = r; query.value = q; resultsAt.value = at; status.value = 'idle'; error.value = '';
  if (filters.value.resultSort !== 'arrive') filters.value = { ...filters.value, resultSort: 'arrive' };
  resetAlts();
  hooks.afterResults();
}
export function clear(): void {
  result.value = null; query.value = null; resultsAt.value = null; status.value = 'idle';
  altShown.value = new Set(); altSel.value = -1;
}
function selectAlt(idx: number): void { altSel.value = idx; altShown.value = new Set([...altShown.value, idx]); hooks.redraw(); }
/** A way tapped on the map (its route or its minutes): highlighted, and its card brought into view in the sheet; the
 *  highlighted one tapped again opens a collapsed sheet on its card. */
export function pickAlt(idx: number): void {
  const again = altSel.value === idx;
  if (!again) selectAlt(idx);
  hooks.revealCard(idx, again);
}
/** The card's map button: show the way (highlighted), highlight a shown one, hide the highlighted one. */
/** A card's map button: on the map or off it, nothing else. The highlighted way stays as it was (it is chosen on the
 *  map, by its time label), unless it is the one taken off or none is highlighted yet (2026-10-22, Gadi). */
export function toggleAlt(idx: number): void {
  const shown = new Set(altShown.value);
  if (shown.has(idx)) { shown.delete(idx); if (altSel.value === idx) altSel.value = shown.size ? [...shown][0] : -1; }
  else { shown.add(idx); if (!shown.has(altSel.value)) altSel.value = idx; }
  altShown.value = shown;
  hooks.redraw();
}
/** Filters and the sort order are remembered across plans; a change starts the map over from the new first three. */
export function setFilter(patch: Partial<Filters>): void {
  const { resultSort, ...kept } = patch;
  if (Object.keys(kept).length) settings.set(kept);
  filters.value = readFilters(resultSort || filters.value.resultSort); resetAlts(); hooks.afterResults();
}
