// The results of a plan: what came back, how it is filtered and sorted into cards, which ways are drawn on
// the map and which one is highlighted, and the recent trips shown while there is nothing else. The list is
// derived from the signals, so filters, the language and the alternatives never rebuild it by hand.
// The trips of a search stay, their times follow (maintainer, 2026-11-11): which ways are listed, in what order, and
// which departure each card shows are decided once, as the plan was answered (`frame`), and change only when the rider
// asks again (Refresh, controllers/planner.ts refresh) or filters and sorts. The times on them are each trip's as it
// stands now, from the live store and the clock (`list`).
import { signal, computed } from '@preact/signals';
import * as clock from '../engine/clock.ts';
import { settings } from './store.ts';
import { lang } from '../common/i18n';
import * as search from './search';
import type { Journey, PlanResult, RideLeg } from '../trip/journey';
import { firstRide, timeAt, tripNow, type At } from '../trip/now';
import { now } from './clock';
import * as live from './live';
import type { Query } from '../trip/query';
import { unset } from '../common/unset';
export type { View } from './store.ts';

type Status = 'idle' | 'planning' | 'locating';
export type Sort = 'depart' | 'arrive' | 'fast' | 'changes';
export type Filters = { fDirect: boolean; fTrain: boolean; resultSort: Sort };
/** One card: the first option of a group, the other departures of the same lines. */
export type Card = {
  idx: number;
  j: Journey;
  q: Query;
  options: Journey[];
  lines: string[][] | null;
  deps: Dep[]; // when its first ride leaves its stop, and the rides after it
  left: boolean; // its ride has gone since the search: the card keeps its place
};

export const SORTS: Sort[] = ['arrive', 'depart', 'fast', 'changes']; // by arrival first: every plan starts so (maintainer)
const sortKey: Record<Sort, (j: Journey) => number> = {
  depart: (j) => j.depart,
  arrive: (j) => j.arrive,
  fast: (j) => j.arrive - j.depart,
  changes: (j) => j.transfers * 1e6 + j.depart,
};
// the filters are kept on the phone; the order is the plan's own (each plan starts by arrival)
const readFilters = (sort: Sort = 'arrive'): Filters => {
  const s = settings.get();
  return { fDirect: !!s.fDirect, fTrain: !!s.fTrain, resultSort: sort };
};

export const result = signal<PlanResult | null>(null);
export const query = signal<Query | null>(null);
/** When the plan on screen was answered (ms): the moment its trips were chosen at. */
export const asked = signal(0);
export const status = signal<Status>('idle'); // the list gives way to "planning…" or "locating…"
export const error = signal('');
export const filters = signal<Filters>(readFilters());
export const altShown = signal<ReadonlySet<number>>(new Set()); // the cards drawn on the map
export const altSel = signal(-1); // the one highlighted
/** Which history the drawer shows at rest: trips, lines or stops. It follows the bar's kind and can be switched on its
 *  own (without opening a search). */
export const recentTab = signal<'trip' | 'line' | 'stop'>('trip');
search.onKind((k) => {
  recentTab.value = k;
});

/** One departure on the card's line: the card's own first ride, another option's (opened on a tap), or a later ride
 *  of the same route the plan listed (RideLeg.next), with the stop it leaves and what is known of it live. */
export type Dep = {
  depart: number;
  trip: number;
  live: RideLeg['live'];
  estimated?: boolean;
  stop?: string;
  o?: Journey;
};
/** The departures a card lists: its options' first rides and the own ride's followers, one per trip, in time order,
 *  the own one and up to three after it (an earlier option that arrives later, the train at the platform, stays). The
 *  journeys are as they stood at `now` (tripNow); the followers' times are asked the same way. */
export function departures(j: Journey, options: Journey[], at: At, now: number): Dep[] {
  const by = new Map<number, Dep>();
  for (const o of options) {
    const r = firstRide(o);
    if (r)
      by.set(r.trip, { depart: r.depart, trip: r.trip, live: r.live, estimated: r.estimated, stop: r.from?.name, o });
  }
  const own = firstRide(j);
  for (const n of own?.next || []) {
    if (by.has(n.trip)) continue;
    const x = timeAt(at, n.trip, n.pos, n.sched, now);
    by.set(n.trip, {
      depart: x.time,
      trip: n.trip,
      live: x.live && { sure: x.live.sure, passed: x.live.passed },
      estimated: own!.estimated,
      stop: own!.from?.name,
    });
  }
  const all = [...by.values()].sort((a, b) => a.depart - b.depart);
  const i = all.findIndex((d) => d.o === j);
  return all.filter((d, k) => k <= i + 3 && (k >= i || d.o?.slower));
}
/** The first ride's departure, or the journey's start. */
export const rideDep = (j: Journey): number => firstRide(j)?.depart ?? j.depart;
/** The way to the first ride, as planned: everything covered on foot (or by bike) before boarding. */
const toFirstRide = (j: Journey): number => {
  let s = 0;
  for (const l of j.legs) {
    if (l.type === 'ride') break;
    s += l.seconds || 0;
  }
  return s;
};
const HURRIED = 0.6; // hurrying (a fast walk or a jog, 2 m/s against the planned 1.2) takes 0.6 of the time; an estimate
/** Where a journey stands (docs/architecture.md, "When to leave: the result list"), given as it stood at n (tripNow)
 *  with L its start and B its first ride: on time while n <= L; "hurry" while the time left before B still
 *  covers the way to the ride at a hurried pace; gone after that, or once the ride's vehicle is past the stop, or a
 *  change in it is missed. A ride whose vehicle has not reached the stop never leaves before now (tripNow), so the
 *  rider standing there keeps its card. A way with no ride is never late. */
export type Standing = 'ontime' | 'hurry' | 'gone';
export function standing(j: Journey, n: number): Standing {
  const r = firstRide(j);
  if (!r) return 'ontime';
  if (j.missed || r.live?.passed) return 'gone';
  if (n <= j.depart) return 'ontime';
  return r.depart - n >= HURRIED * toFirstRide(j) ? 'hurry' : 'gone';
}

/** What a search lists, decided once, as the plan was answered: which ways are cards and in what order, which
 *  departures each card offers (the first is the one it shows), which ways are in reach with a hurry and which just
 *  left. Journeys are named by their place in the plan. */
type Frame = {
  cards: { idx: number; options: number[]; lines: string[][] | null }[];
  hurry: number[];
  gone: number[];
  filteredOut: boolean;
};
/** The frame of a plan (idx is the group's place, which is the card's number on the map), by the journeys as they
 *  stood when the plan was answered (`askedMs`) on the live times it was routed on (a plan from now looks ten minutes
 *  back, hence the ways just gone). */
function frame(r: PlanResult | null, q: Query | null, f: Filters, askedMs: number): Frame {
  if (!r || !q || !r.journeys.length) return { cards: [], hurry: [], gone: [], filteredOut: false };
  const nowSec = clock.secondsOn(askedMs, q.day),
    at = live.atIn(r.live?.trips ?? {}),
    then = r.journeys.map((j) => tripNow(j, at, nowSec));
  let groups = r.groups || r.journeys.map((_, i) => ({ options: [i], lines: null }));
  // the option a card shows: the earliest departure from the time asked, or for arrive-by the latest that is in time
  const first = (g: { options: number[] }) => r.journeys[q.arriveBy ? g.options[g.options.length - 1] : g.options[0]];
  if (q.arriveBy) groups = groups.slice().sort((a, b) => first(b).depart - first(a).depart); // latest departure first, by what each card shows
  if (f.fDirect) groups = groups.filter((g) => first(g).transfers === 0);
  if (f.fTrain) groups = groups.filter((g) => first(g).legs.some((l) => l.type === 'ride' && l.routeType === 2));
  // arrive-by keeps its own order by arrival (the latest that is in time first); every other order sorts (stable).
  // The groups are sorted by their first option, which fixes each card's number (idx) for the map; the cards are
  // sorted again below by the option each one shows, since the first may have gone by
  const sorted = !(q.arriveBy && f.resultSort === 'arrive'),
    sk = sortKey[f.resultSort];
  const byKey = (a: Journey, b: Journey) => sk(a) - sk(b) || sortKey.depart(a) - sortKey.depart(b);
  if (sorted) groups = groups.slice().sort((a, b) => byKey(first(a), first(b)));
  const where = (i: number): Standing => (q.isNow ? standing(then[i], nowSec) : 'ontime'); // a plan for a set time is read as asked
  const onStrip = (i: number) => rideDep(then[i]) >= nowSec - 600; // left lately
  const add = (to: number[], i: number) => {
    const same = (k: number) => then[k].depart === then[i].depart && then[k].legs.length === then[i].legs.length;
    if (!to.some(same)) to.push(i);
  };
  const cards: Frame['cards'] = [],
    hurry: number[] = [],
    gone: number[] = [];
  groups.forEach((g, idx) => {
    const opts = q.arriveBy ? g.options.slice().reverse() : g.options;
    for (const i of opts) {
      const w = where(i);
      if (w === 'hurry') add(hurry, i);
      else if (w === 'gone' && onStrip(i)) add(gone, i);
    }
    const options = opts.filter((i) => where(i) === 'ontime');
    if (options.length) cards.push({ idx, options, lines: g.lines });
  });
  if (sorted) cards.sort((a, b) => byKey(then[a.options[0]], then[b.options[0]])); // "by arrival" means the arrival the card shows
  hurry.sort((a, b) => rideDep(then[a]) - rideDep(then[b]));
  return { cards, hurry, gone, filteredOut: !groups.length };
}
const framed = computed(() => frame(result.value, query.value, filters.value, asked.value));
/** The list on screen: the frame's trips, each as it stands now. The times follow the live store and the clock; which
 *  trips, and where each is in the list, do not. `left`: a card whose ride has gone since (it keeps its place). */
export const list = computed(() => {
  void lang.value;
  void now.value;
  const r = result.value,
    q = query.value,
    f = framed.value;
  if (!r || !q) return { cards: [] as Card[], hurry: [] as Journey[], gone: [] as Journey[], filteredOut: false };
  const nowSec = clock.nowOn(q.day);
  const stands = (i: number): Journey => tripNow(r.journeys[i], live.at, nowSec);
  const cards = f.cards.map((c): Card => {
    const options = c.options.map(stands),
      j = options[0];
    return {
      idx: c.idx,
      j,
      q,
      options,
      lines: c.lines,
      deps: departures(j, options, live.at, nowSec),
      left: !!q.isNow && standing(j, nowSec) === 'gone',
    };
  });
  return { cards, hurry: f.hurry.map(stands), gone: f.gone.map(stands), filteredOut: f.filteredOut };
});
/** A way's card to bring into view with a flash (its index; `n` makes asking again for the same card a change). */
export const reveal = signal<{ idx: number; n: number } | null>(null);
/** Something fills the plan screen: a list, or the wait for one. */
export const showing = computed(() => status.value !== 'idle' || result.value != null);
/** The card highlighted on the map: the peek line's journey. */
export const highlighted = computed<Card | null>(
  () => list.value.cards.find((c) => c.idx === altSel.value && altShown.value.has(c.idx)) || null,
);

/** What the results' own flows need from the controllers: the sheet and the map after results come, a way's card
 *  brought into view. */
export const hooks = {
  afterResults: (): void => unset('results.afterResults'), // the sheet opens, the map draws
  redraw: (): void => unset('results.redraw'), // the map draws the ways switched on
  revealCard: (_idx: number, _open: boolean): void => unset('results.revealCard'), // a way's card scrolled into view (the sheet opened first if asked)
};

/** The first three ways are drawn on the map, the first of them highlighted. */
function resetAlts(): void {
  const cards = list.value.cards;
  altShown.value = new Set(cards.slice(0, 3).map((c) => c.idx));
  altSel.value = cards.length ? cards[0].idx : -1;
}
/** A plan answered, now. `sort`: the order kept when the same question is asked again; every other plan starts by
 *  arrival. */
export function setResults(r: PlanResult, q: Query, sort: Sort = 'arrive'): void {
  // the boxes stay open: picking a destination plans at once, and the time or the bike may still change (a change
  // plans again). They fold when the rider moves on: a tap on the map, a result opened, the sheet dragged, X or back.
  result.value = r;
  query.value = q;
  asked.value = Date.now();
  status.value = 'idle';
  error.value = '';
  if (filters.value.resultSort !== sort) filters.value = { ...filters.value, resultSort: sort };
  resetAlts();
  hooks.afterResults();
}
export function clear(): void {
  result.value = null;
  query.value = null;
  status.value = 'idle';
  altShown.value = new Set();
  altSel.value = -1;
}
function selectAlt(idx: number): void {
  altSel.value = idx;
  altShown.value = new Set([...altShown.value, idx]);
  hooks.redraw();
}
/** A way tapped on the map (its route or its minutes): highlighted, and its card brought into view in the sheet; the
 *  highlighted one tapped again opens a collapsed sheet on its card. */
export function pickAlt(idx: number): void {
  const again = altSel.value === idx;
  if (!again) selectAlt(idx);
  hooks.revealCard(idx, again);
}
/** The card's map button: show the way (highlighted), highlight a shown one, hide the highlighted one. */
/** A card's map button: on the map or off it, nothing else. The highlighted way stays as it was (it is chosen on the
 *  map, by its time label), unless it is the one taken off or none is highlighted yet (2026-10-22, the maintainer). */
export function toggleAlt(idx: number): void {
  const shown = new Set(altShown.value);
  if (shown.has(idx)) {
    shown.delete(idx);
    if (altSel.value === idx) altSel.value = shown.size ? [...shown][0] : -1;
  } else {
    shown.add(idx);
    if (!shown.has(altSel.value)) altSel.value = idx;
  }
  altShown.value = shown;
  hooks.redraw();
}
/** Filters and the sort order are remembered across plans; a change starts the map over from the new first three. */
export function setFilter(patch: Partial<Filters>): void {
  const { resultSort, ...kept } = patch;
  if (Object.keys(kept).length) settings.set(kept);
  filters.value = readFilters(resultSort || filters.value.resultSort);
  resetAlts();
  hooks.afterResults();
}
