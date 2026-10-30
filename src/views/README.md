# views: the parts of the screen

Preact components, one folder per part of the screen. They draw from
`state/` and call the controllers directly (a tap is one import away from
the work it starts); small shared pieces come from `widgets/`.

| Folder | What | Files |
|---|---|---|
| `topbar/` | The search bar: the trip search's two boxes, the line and stop searches, the suggestion list, the time and bicycle options, the summary. | `TopBar`, `SearchField` (one box with its list), `Popovers` (when, bicycle) |
| `results/` | The plan screen: the result cards, sorting, the line in the collapsed sheet, the history drawer (Trips, Lines, Stops). | `PlanScreen`, `Results`, `JourneyCard`, `LegChips`, `SortMenu`, `PeekLine`, `Recent` |
| `detail/` | One journey: its legs, the ride options of each ride. | `Detail`, `LegRow`, `RideOptions` |
| `follow/` | The trip being followed, and the bar to resume it. | `Follow`, `ResumeBar` |
| `stop/` | A stop or a station: its lines, departures, where its trains go. | `StopDetail` |
| `line/` | A line: its course, stops, timetable at your stop, vehicles. | `LineDetail` |
| `station/` | The trains (or light rail) between two stations. | `TrainTimes` |
| `saved/` | Saved places, trips, lines and stops (`StopList` is its list of stops). | `Saved`, `StopList` |
| `settings/` | The settings page and its layer. | `SettingsPage` (the layer), `Settings` (its content) |
| `menu/` | The menu drawer. | `Drawer` |
| `chooser/` | Choosing a place for home, work or the saved list. | `Chooser` |
| `shell/` | The bottom sheet holding every panel, the floating buttons, the sheet's gestures and the pull to refresh. | `Sheet`, `Floating`, `gestures`, `pullRefresh` |

Each file opens with a comment saying what it draws. A feature has the same name here, in `state/` and in `controllers/` (`stop`, `line`, `station`, `chooser`, ...).
