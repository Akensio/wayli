# engine: the logic with no screen

TypeScript modules with no DOM and no app imports, so the data worker
runs them and so does Node (`tests/`: the benchmark, the tests, the train
backtest).

| File | What |
|---|---|
| `raptor.ts` | Reads the compact timetable (format in `docs/architecture.md`) and offers its layout's accessors (a pattern's stops, a trip's times, a stop's patterns); RAPTOR: one round per vehicle boarded, an earliest-arrival plan or a whole window of departures (profile), then ranking. |
| `streets.ts` | Reads the street graph: the walk or ride from a point to the stops around it and between two points, with climbs counted (`secondsOn`). |
| `best.ts` | How good a way is, as one number (when it gets there, plus walking, waiting, changes and the risk of missing one, in minutes of riding): what the results' "Best" order sorts by. |
| `places.ts` | The offline address book: reading its file, naming its entries in the rider's language, the address on a street for a house number, and what is at a point (the nearest address by cells). |
| `words.ts`, `wordindex.ts`, `catalogue.ts`, `find.ts` | The search (`docs/architecture.md`, "The search"): a name or what is typed as words in one plain form, how far a typed word is from a word and how a word sounds in either alphabet; the index of every distinct word with the entries that have it, and its packed form; the catalogue of everything findable (the address book's entries and the stops) as built nightly, written to a file and read back; and `find`, what was typed to the entries meant, best first. |
| `clock.ts` | Israel time and service days, whatever the phone's zone: seconds on a service day, `nowOn(day)`, day strings, `hhmm` and `legMinutes` (how a time and a leg read, the same in the worker and on screen). |
| `feed.ts` | The live vehicles: the relay's snapshot (read in the data worker) or Hasadna's API, freshness, matching a vehicle to its trip. |
| `delays.ts` | How late a vehicle runs: where it is along its trip, trains' and buses' learned section times (and the buses' live correction), the delay, a stop's live time. |
| `geo.ts` | Distances on the ground: `haversine` (great circle) and `metres` (a flat approximation for vehicles along their trips, the same as the pipeline's); on that approximation `scaleAt`, `nearestOnSegment` and `projectOnStops` (where a point is along a trip). |
| `modes.ts` | What kind of vehicle runs a line, from its GTFS route type: `Mode`, rail, lrt, cable, taxi, flex or bus (the one word for it in the whole app). |
| `container.ts` | Reading the container every data file comes in (a header, then typed-array sections), for the timetable, the street graph, the address book, the courses and the search catalogue; and writing one (the catalogue's, the tests' tiny files). |
| `text.ts` | `Lang`, the two languages a name is handed out in. |
| `latin.ts` | A Hebrew name in Latin letters by rule (`inLatin`, the build's own transliteration ported): the last resort of every name helper in English, so no Hebrew letters reach an English screen (`docs/principles.md`, rule 3). |

They are imported with their `.ts` extension: Vite transpiles them for the
page and the worker, Node 22.18+ runs them as they are for `tests/`.
