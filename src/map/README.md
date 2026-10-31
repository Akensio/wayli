# map: the one map under everything

What the map shows for what the sheet holds is decided in one place
(`view.ts`, pure and tested by `tools/mapview.test.ts`) and drawn by one
renderer (`render.ts`). Nothing outside this folder touches the map's
markers or MapLibre itself: panels hand their vehicles over
(`showVehicles`), and everything on the map is drawn from components or
GeoJSON, never from HTML strings.

| File | What |
|---|---|
| `index.ts` | The map: setup, the layers, taps; what the rest of the app may use of it. |
| `locate.ts` | Our locate button (your dot, the accuracy circle, following you) and compass, through MapLibre's public API. |
| `vehicles.ts` | A panel's own vehicles (a way's rides, a line, the followed ride) and the rider's dot while following. |
| `view.ts` | For each panel: what is drawn, where the camera goes, which live vehicles show. |
| `render.ts` | Carries that out from the panels' state. |
| `layers.ts` | Drawing a journey or a line: courses, stops, pins, the other ways muted. |
| `live.ts` | The live vehicles in view and the day's stops. |
| `popups.ts`, `bubbles.tsx` | Bubbles for a vehicle, a stop, a tapped place, the picked point (components rendered into MapLibre's popups), and a line's vehicle markers. |
| `basemap.ts`, `style.ts` | The basemap (OpenFreeMap's Liberty) recoloured from two palettes, light and dark; labels' language. |
| `heading.ts` | The compass cone on the position dots, which register with it. |
| `images.ts`, `picker.ts`, `shared.ts`, `maplibre.ts` | Station badges and arrows; picking a point; what the map modules share; MapLibre bundled with its worker. |
