# worker: the data worker

The app's questions are answered here, off the main thread: the worker holds
the day's timetable, the street graph, the address book and the courses, and
the page asks by name (`client.ts`: `call(op, args)` returns a promise).
`worker.js` is the message loop; each part answers its own ops:

| File | What | Ops |
|---|---|---|
| `worker.js` | The message loop: every part's ops in one table. | |
| `data.js` | What is loaded (`tt`, `st`, `pl`, `sh`, `lang`) and loading it, with progress. Only it assigns them; `onNewDay` / `onNewLang` reset what other parts derived from them. | `loadTimetable`, `loadStreets`, `loadShapes`, `loadPlaces`, `loadBusTimes`, `setRailTimes`, `setLang` |
| `names.js` | Names in the rider's language: stops, stations, cities, headsigns, line labels; a stop as handed out. | |
| `search.js` | The search over stops and the address book; what is at a point; stored places named again. | `search`, `reverse`, `localize` |
| `plan.js` | Journeys: places to stops, live delays into the timetable, the searches, legs, transfers, grouping. | `plan` |
| `stops.js` | Stops and stations: rail and light rail stops, light rail stations, a stop's station, sign numbers, lines at a stop. | `stopGroups`, `stopInfo`, `stationReach`, `departures`, `stopRoutes`, `stopsGeo`, `nearbyRoutes`, `findRecent` |
| `lines.js` | Lines as riders know them, indexed from the routes. | `lineGroups`, `lineInfo`, `lineTimes`, `routeLabels` |
| `trips.js` | A trip's stops and times; the direct trips between two places. | `trainsBetween`, `rideOptions`, `tripStops`, `tripFor` |
| `courses.js` | Where rides and walks run on the map. | `ridePaths`, `rideCourses`, `patternCourse`, `streetPaths` |
| `vehicles.js` | Live vehicles from the newest snapshot through the relay. | `liveQuery`, `vehiclesStatus`, `estimate` |
| `traffic.js` | How the roads run now, from the buses. | `traffic` |
| `client.ts` | The page's end: one promise per request. | |

The logic with no data of its own (routing, streets, places, delay models)
is in `engine/`.
