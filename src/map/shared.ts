// What the map modules share: the one map under everything, its markers, the stops that are stations, and
// what the map needs from the rest of the app.
import type { Map as MLMap, Marker, Popup } from 'maplibre-gl';
import type { Place } from '../journey/types';
import * as nav from '../state/nav';
import * as sheet from '../state/sheet';
import * as results from '../state/results';
import * as detail from '../state/detail';
import { visibleArea, type Sheet, type Padding } from './view';

export const state = {
  main: null as MLMap | null,
  styled: false, // the style is loaded: layers can be added, data set
  failed: false, // no MapLibre (no network at first start): the app runs without a map
  currentStyle: null as unknown,
  drawnFor: null as string | null, // the panel whose content is on the map
  drawSeq: 0,
};
/** The markers of what the renderer draws: a journey's pins, the results' badges and chips. (A panel's own vehicles and
 *  the rider's dot are map/vehicles.ts's.) */
export const markers = {
  journey: [] as Marker[],
  alt: [] as Marker[],
};
export const popupState = { current: null as Popup | null };
export const pick = { marker: null as Marker | null, seq: 0 };
export const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
/** stop -> 'rail' | 'lrt' | 'station' for stops that are, or belong to, a station. */
export const stopKinds = new Map<number, string>();
export const stopKindProp = (stop: number | string): { kind?: string } =>
  stopKinds.has(+stop) ? { kind: stopKinds.get(+stop) } : {};
/** A drawing is stale when another one started since. */
export const stale = (seq: number): boolean => seq !== state.drawSeq;

const styledWaiters: ((m: MLMap | null) => void)[] = [];
/** Resolves to the map once its style is loaded (again after a style change); null when there is no map. */
export const mapReady = (): Promise<MLMap | null> =>
  new Promise((res) => {
    if (state.failed) res(null);
    else if (state.main && state.styled) res(state.main);
    else styledWaiters.push(res);
  });
export const settleWaiters = (m: MLMap | null): void => {
  for (const r of styledWaiters.splice(0)) r(m);
};

/** The map's calls into the app: panels to open, plans to make. Filled in by the app at start. */
export const hooks = {
  openTrip: (_trip: number, _stop: number) => {},
  openLine: (_route: number) => {},
  openStop: (_stop: number, _station?: number) => {}, // a station: all its platforms
  planTo: (_p: Place) => {},
  planFrom: (_p: Place) => {}, // "from here": the place in the From box, the bar open
  timeAt: (_stop: number): number | null => null, // when what the sheet holds passes that stop (the ride, the trip chosen)
  lineAt: (_stop: number): boolean => false, // the line in the sheet as a timetable at that stop, if it calls there
};

/** What the sheet holds, as the decision takes it. */
export function currentSheet(key = nav.key.value): Sheet {
  return { key, results: results.showing.value && results.list.value.cards.length > 0, focus: detail.focus.value };
}
/** The part of the screen the map shows, as camera padding (also the locate button's, map/index.ts). */
export const cameraPadding = (): Padding => visibleArea(innerHeight, sheet.topPad() - 12, sheet.px(sheet.state.value));
