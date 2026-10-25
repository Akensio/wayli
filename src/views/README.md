# views: the parts of the screen

Preact components, one folder per part of the screen. They draw from
`state/` and call its hooks; small shared pieces come from `widgets/`.

| Folder | What |
|---|---|
| `topbar/` | The search bar: the trip search's two boxes, the line and stop searches, the suggestion list, the time and bicycle options, the summary. |
| `results/` | The plan screen: the result cards, sorting, the line in the collapsed sheet, the history drawer (Trips, Lines, Stops). |
| `detail/` | One journey: its legs, the ride options of each ride. |
| `follow/` | The trip being followed, and the bar to resume it. |
| `stop/` | A stop or a station: its lines, departures, where its trains go. |
| `line/` | A line: its course, stops, timetable at your stop, vehicles. |
| `station/` | The trains (or light rail) between two stations. |
| `saved/` | Saved places, trips, lines and stops (`StopList` is its list of stops). |
| `settings/` | The settings page and its layer. |
| `menu/` | The menu drawer. |
| `chooser/` | Choosing a place for home, work or the saved list. |
| `shell/` | The bottom sheet holding every panel, the floating buttons, the sheet's gestures and the pull to refresh. |

A feature has the same name here, in `state/` and in `controllers/` (`stop`, `line`, `station`, `saved`, ...).
