// What the map modules share: the one map under everything, its markers, the stops that are stations, and
// what the map needs from the rest of the app.
import type { Map as MLMap, Marker, Popup } from 'maplibre-gl';
import type { Place } from '../state/search';

export const state = {
  main: null as MLMap | null,
  styled: false,            // the style is loaded: layers can be added, data set
  failed: false,            // no MapLibre (no network at first start): the app runs without a map
  currentStyle: null as unknown,
  drawnFor: null as string | null,   // the panel whose content is on the map
  drawSeq: 0,
};
export const markers = { journey: [] as Marker[], live: [] as Marker[], lineVeh: [] as Marker[], followVehicle: [] as Marker[], alt: [] as Marker[], me: null as Marker | null };
export const popupState = { current: null as Popup | null };
export const pick = { marker: null as Marker | null, seq: 0 };
export const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
/** stop -> 'rail' | 'lrt' | 'station' for stops that are, or belong to, a station. */
export const stopKinds = new Map<number, string>();
export const stopKindProp = (stop: number | string): { kind?: string } => (stopKinds.has(+stop) ? { kind: stopKinds.get(+stop) } : {});
/** A drawing is stale when another one started since. */
export const stale = (seq: number): boolean => seq !== state.drawSeq;

const styledWaiters: ((m: MLMap | null) => void)[] = [];
/** Resolves to the map once its style is loaded (again after a style change); null when there is no map. */
export const mapReady = (): Promise<MLMap | null> => new Promise((res) => { if (state.failed) res(null); else if (state.main && state.styled) res(state.main); else styledWaiters.push(res); });
export const settleWaiters = (m: MLMap | null): void => { for (const r of styledWaiters.splice(0)) r(m); };

/** The map's calls into the app: panels to open, plans to make. Filled in by the app at start. */
export const hooks = {
  openTrip: (_trip: number, _stop: number) => {},
  openLine: (_route: number) => {},
  openStop: (_stop: number) => {},
  planTo: (_p: Place) => {},
  planFrom: (_p: Place) => {},     // "from here": the place in the From box, the bar open
};
