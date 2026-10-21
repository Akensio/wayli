// The results of a plan: what came back, how it is filtered and sorted into cards, which ways are drawn on
// the map and which one is highlighted, and the recent trips shown while there is nothing else. The list is
// derived from the signals, so filters, the language and the alternatives never rebuild it by hand.
import { signal, computed } from '@preact/signals';
import * as live from '../live.js';
import { settings } from '../store.js';
import { lang } from '../i18n';
import type { Journey, PlanResult, Query } from '../journey/types';

export type Status = 'idle' | 'planning' | 'locating';
export type Sort = 'depart' | 'arrive' | 'fast' | 'changes';
export type Filters = { fDirect: boolean; fTrain: boolean; resultSort: Sort };
/** One card: the first option of a group, the other departures of the same lines, and when to leave for it. */
export type Card = { idx: number; j: Journey; q: Query; options: Journey[]; lines: string[][] | null; dep: number };

export const SORTS: Sort[] = ['depart', 'arrive', 'fast', 'changes'];
const sortKey: Record<Sort, (j: Journey) => number> = { depart: (j) => j.depart, arrive: (j) => j.arrive, fast: (j) => j.arrive - j.depart, changes: (j) => j.transfers * 1e6 + j.depart };
const readFilters = (): Filters => { const s = settings.get(); return { fDirect: !!s.fDirect, fTrain: !!s.fTrain, resultSort: SORTS.includes(s.resultSort) ? s.resultSort : 'depart' }; };

export const result = signal<PlanResult | null>(null);
export const query = signal<Query | null>(null);
export const resultsAt = signal<number | null>(null);   // when the results were restored from an earlier session
export const status = signal<Status>('idle');           // the list gives way to "planning…" or "locating…"
export const error = signal('');
export const filters = signal<Filters>(readFilters());
export const altShown = signal<ReadonlySet<number>>(new Set());   // the cards drawn on the map
export const altSel = signal(-1);                                 // the one highlighted
export const recentTick = signal(0);                              // bumped when the recent trips change

/** The first ride's departure, or the journey's start. */
export const rideDep = (j: Journey): number => { const fr = j.legs.find((l) => l.type === 'ride'); return fr ? fr.depart! : j.depart; };
/** When to leave: a journey that started before now but whose ride is still to come counts from now. */
const depAt = (j: Journey, nowS: number): number => { const r = j.legs.filter((l) => l.type === 'ride'); return r.length && j.depart < nowS && r[0].depart! >= nowS - 60 ? Math.min(nowS, r[0].depart!) : j.depart; };

/** The cards in list order, and the rides that just left (a plan from now looks ten minutes back). */
function build(r: PlanResult | null, q: Query | null, at: number | null, f: Filters): { cards: Card[]; gone: Journey[]; filteredOut: boolean } {
  if (!r || !q || !r.journeys.length) return { cards: [], gone: [], filteredOut: false };
  let groups = r.groups || r.journeys.map((_, i) => ({ options: [i], lines: null }));
  // the option a card shows: the earliest departure from the time asked, or for arrive-by the latest that is in time
  const first = (g: { options: number[] }) => r.journeys[q.arriveBy ? g.options[g.options.length - 1] : g.options[0]];
  if (q.arriveBy) groups = groups.slice().sort((a, b) => first(b).depart - first(a).depart);   // latest departure first, by what each card shows
  if (f.fDirect) groups = groups.filter((g) => first(g).transfers === 0);
  if (f.fTrain) groups = groups.filter((g) => first(g).legs.some((l) => l.type === 'ride' && l.routeType === 2));
  if (f.resultSort !== 'depart') { const sk = sortKey[f.resultSort]; groups = groups.slice().sort((a, b) => sk(first(a)) - sk(first(b))); }
  const nowSec = live.nowOn(q.day);
  const isGone = (j: Journey) => !!q.isNow && rideDep(j) < nowSec - 60;              // the first ride has left
  const onStrip = (j: Journey) => rideDep(j) >= nowSec - 600 || (!!at && j.arrive > nowSec);   // left lately, or (restored) still under way
  const cards: Card[] = [], gone: Journey[] = [];
  for (const g of groups) {
    let opts = g.options.map((i) => r.journeys[i]);
    if (q.arriveBy) opts = opts.slice().reverse();
    for (const j of opts) if (isGone(j) && onStrip(j) && !gone.some((o) => o.depart === j.depart && o.legs.length === j.legs.length)) gone.push(j);
    opts = opts.filter((j) => !isGone(j));
    if (opts.length) cards.push({ idx: cards.length, j: opts[0], q, options: opts, lines: g.lines, dep: depAt(opts[0], nowSec) });
  }
  return { cards, gone, filteredOut: !groups.length };
}
export const list = computed(() => { void lang.value; return build(result.value, query.value, resultsAt.value, filters.value); });
/** Something fills the plan screen: a list, or the wait for one. */
export const showing = computed(() => status.value !== 'idle' || result.value != null);
/** The card highlighted on the map: the peek line's journey. */
export const highlighted = computed<Card | null>(() => list.value.cards.find((c) => c.idx === altSel.value && altShown.value.has(c.idx)) || null);

/** What the results need from the rest of the app. Filled in by the app at start. */
export const hooks = {
  openDetail: (_j: Journey, _q: Query, _bikeOnly?: boolean) => {},
  startTrip: (_j: Journey, _q: Query) => {},
  plan: (_opts?: { maxWalk?: number }) => {},
  replan: (_q: Query) => {},       // a recent trip tapped: the bar filled from it, planned from now
  afterResults: () => {},          // the sheet opens, the map draws
  redraw: () => {},                // the map draws the ways switched on
  peekChanged: () => {},           // the collapsed sheet follows the peek line's height
  peekTap: () => {},               // the peek line opens the sheet
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
  resetAlts();
  hooks.afterResults();
}
export function clear(): void {
  result.value = null; query.value = null; resultsAt.value = null; status.value = 'idle';
  altShown.value = new Set(); altSel.value = -1;
}
export function selectAlt(idx: number): void { altSel.value = idx; altShown.value = new Set([...altShown.value, idx]); hooks.redraw(); }
/** The card's map button: show the way (highlighted), highlight a shown one, hide the highlighted one. */
export function toggleAlt(idx: number): void {
  const shown = new Set(altShown.value);
  if (shown.has(idx) && altSel.value === idx) { shown.delete(idx); altSel.value = shown.size ? [...shown][0] : -1; }
  else { shown.add(idx); altSel.value = idx; }
  altShown.value = shown;
  hooks.redraw();
}
/** Filters and the sort order are remembered across plans; a change starts the map over from the new first three. */
export function setFilter(patch: Partial<Filters>): void { settings.set(patch); filters.value = readFilters(); resetAlts(); hooks.afterResults(); }
export const refreshRecent = (): void => { recentTick.value++; };
