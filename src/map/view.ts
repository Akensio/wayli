// What the map shows for what the sheet holds: the one place that decides (docs/principles: "the map follows the
// sheet"). One table, one function: what is drawn, where the camera goes, which live vehicles show. The map's renderer
// (map/index.ts) carries it out; the panels only fill their state. Pure: no imports, so tools/mapview.test.mjs runs
// it in Node.

/** What is drawn. */
export type Draw =
  | 'nothing'   // the map itself, the rider's dot
  | 'ways'      // the results: the ways switched on, one highlighted, each ride with its line's chip
  | 'journey'   // one way, its stops; with `context`, the whole lines of its rides faint around it
  | 'line'      // a line's course and every stop of it
  | 'stop'      // a stop's pin; with `context`, the courses of the lines calling there, faint
  | 'pair'      // two stations' pins (the trains between them)
  | 'ring';     // the stops near the rider, inside a ring
/** Where the camera goes: stays, fits what is drawn (or the focused ride), or centres on a point. */
export type Camera = 'keep' | 'fit' | 'focus' | 'point';
/** Which live vehicles the map's own layer shows: every one (the lines near the rider in front), only those of the
 *  results' lines or the stop's lines, or none because the panel draws its own (a way's, a line's, the followed one). */
export type Live = 'near' | 'results' | 'stop' | 'own' | 'none';
export type View = { draw: Draw; context: boolean; camera: Camera; maxZoom: number; live: Live };
/** What the sheet holds: its panel (nav.key) and the little the decision depends on. */
export type Sheet = { key: string; results?: boolean; focus?: number };

const REST: View = { draw: 'nothing', context: false, camera: 'keep', maxZoom: 16, live: 'near' };

export function viewFor(s: Sheet): View {
  switch (s.key) {
    case 'screen-plan': return s.results ? { draw: 'ways', context: false, camera: 'fit', maxZoom: 15, live: 'results' } : REST;
    case 'detail': return { draw: 'journey', context: true, camera: s.focus != null && s.focus >= 0 ? 'focus' : 'fit', maxZoom: 16, live: 'own' };
    case 'follow': return { draw: 'journey', context: false, camera: 'fit', maxZoom: 16, live: 'own' };
    case 'lineDetail': return { draw: 'line', context: false, camera: 'fit', maxZoom: 15, live: 'own' };
    case 'stopDetail': return { draw: 'stop', context: true, camera: 'point', maxZoom: 15, live: 'stop' };
    case 'trainTimes': return { draw: 'pair', context: false, camera: 'fit', maxZoom: 13, live: 'near' };
    case 'screen-nearby': return { draw: 'ring', context: false, camera: 'fit', maxZoom: 16, live: 'near' };
    case 'picker': return { ...REST, live: 'none' };   // choosing a point: the map alone
    default: return REST;                              // pages over everything, the place chooser
  }
}

/** The part of the screen the map shows between the bar on top and the sheet below, as padding for the camera: what is
 *  fitted or centred lands there, not behind the sheet. A sheet over most of the screen leaves the map a strip. */
export type Padding = { top: number; bottom: number; left: number; right: number };
export function visibleArea(screenH: number, barBottom: number, sheetVisible: number): Padding {
  const top = barBottom + 12;
  return { top, bottom: Math.max(16, Math.min(sheetVisible + 16, screenH - top - 120)), left: 24, right: 24 };
}
/** The offset that puts a centred point in the middle of that part, not of the screen. */
export const centreOffset = (p: Padding): [number, number] => [(p.left - p.right) / 2, (p.top - p.bottom) / 2];
