# Wayli's design principles

The rules agreed with Gadi (from the design principles deck,
https://claude.ai/artifact/R664DeK2CWoKprEPWSJtLz), each with the one place
in the code that owns it and the test that fails the build when it breaks.
Rules still under discussion stay in the deck until agreed.

## 1. The map follows the sheet

Agreed 2026-10-23, built 2026-10-24. What the map draws, where its camera
goes and which live vehicles it shows follow from what the sheet holds, and
from nothing else.

| The sheet holds | The map draws | The camera | Live vehicles |
|---|---|---|---|
| Nothing yet | the rider | stays | every one, the lines near the rider in front |
| Results | the ways shown, one highlighted, lines' chips | fits the ways (not again on a new highlight) | the results' lines |
| One way | it, the whole lines of its rides faint | fits it, or the ride tapped | its own (the way's vehicles) |
| Following | the trip, the rider | fits the trip | its own (the followed vehicle) |
| A line | its course and stops | fits it | its own (the line's vehicles) |
| A stop or station | its pin, the lines calling there faint | centres on it | the lines calling there |
| Trains between two stations | both pins | fits both | every one |
| Stops near me | a ring, the stops in it | fits the ring | every one |
| A page, the place chooser | nothing more | stays | as before (none while picking a point) |

The camera aims at the part of the screen the map shows, between the bar
and the sheet; the locate button too.

- Owner: `src/map/view.ts` decides (pure), `src/map/render.ts` carries it
  out. Panels fill their state and never draw the map themselves; a panel
  whose live vehicles are its own puts them on after the drawing
  (`afterDraw`).
- Test: `tools/mapview.test.mjs` (in `npm test`).
