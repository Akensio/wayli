# map: the one map under everything

What the map shows for what the sheet holds is decided in one place
(`view.ts`, pure and tested by `tools/mapview.test.mjs`) and drawn by one
renderer (`render.ts`).

| File | What |
|---|---|
| `index.ts` | The map: setup, the layers, taps, the locate button. |
| `view.ts` | For each panel: what is drawn, where the camera goes, which live vehicles show. |
| `render.ts` | Carries that out from the panels' state. |
| `layers.ts` | Drawing a journey or a line: courses, stops, pins, the other ways muted. |
| `live.ts` | The live vehicles in view and the day's stops. |
| `popups.ts` | Bubbles for a vehicle, a stop, a tapped place. |
| `basemap.ts`, `style.ts` | The basemap (OpenFreeMap's Liberty) recoloured from two palettes, light and dark; labels' language. |
| `heading.ts` | The compass cone on the position dot. |
| `images.ts`, `picker.ts`, `shared.ts`, `maplibre.ts` | Station badges and arrows; picking a point; what the map modules share; MapLibre bundled with its worker. |
