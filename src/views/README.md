# views: the parts of the screen

Preact components, one folder per part of the screen. They draw from
`state/` and call its hooks; small shared pieces come from `widgets/`.

| Folder | What |
|---|---|
| `topbar/` | The search bar: the trip search's two boxes, the line and stop searches, the suggestion list, the time and bicycle options, the summary. |
| `results/` | The plan screen: the result cards, sorting, the line in the collapsed sheet, the history drawer (Trips, Lines, Stops). |
| `detail/` | One journey: its legs, the ride options of each ride. |
| `follow/` | The trip being followed, and the bar to resume it. |
| `pages/` | Panels and pages: a stop, a line, the trains between two stations, saved, settings, the menu, the place chooser. |
| `shell/` | The bottom sheet holding every panel, and the floating buttons. |
| `sheet/` | The sheet's gestures and the pull to refresh. |
