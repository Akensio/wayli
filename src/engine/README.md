# engine: the logic with no screen

Plain JavaScript modules with no DOM and no app imports, so the data worker
runs them and so does Node (`tools/`: the benchmark, the tests, the train
backtest).

| File | What |
|---|---|
| `raptor.ts` | Reads the compact timetable (format in `docs/architecture.md`); stop search; RAPTOR: one round per vehicle boarded, an earliest-arrival plan or a whole window of departures (profile), then ranking. |
| `streets.ts` | Reads the street graph: the walk or ride from a point to the stops around it and between two points, with climbs counted (`secondsOn`). |
| `places.ts` | The offline address book: free-text search over streets, house numbers, cities and places. |
| `clock.ts` | Israel time and service days, whatever the phone's zone: seconds on a service day, `nowOn(day)`, day strings, `hhmm` and `legMinutes` (how a time and a leg read, the same in the worker and on screen). |
| `feed.ts` | The live vehicles: the relay's snapshot (read in the data worker) or Hasadna's API, freshness, matching a vehicle to its trip. |
| `delays.ts` | How late a vehicle runs: where it is along its trip, trains' and buses' learned section times (and the buses' live correction), the delay, a stop's live time. |
| `follow.ts` | Following a trip: a pure state machine from the journey, the position and the clock to what to tell the rider and when. |
| `geo.ts` | Distances on the ground: `haversine` (great circle) and `metres` (a flat approximation for vehicles along their trips, the same as the pipeline's); on that approximation `scaleAt`, `nearestOnSegment` and `projectOnStops` (where a point is along a trip). |
| `modes.ts` | What kind of vehicle runs a line, from its GTFS route type: `Mode`, rail, lrt, cable, taxi, flex or bus (the one word for it in the whole app). |
| `container.ts` | Reading the container every data file comes in (a header, then typed-array sections), for the timetable, the street graph, the address book and the courses. |
| `text.ts` | How the searches compare text (`norm`) and rank matches (`byScore`), shared by the stop search and the address book. |

The files move to TypeScript as they are touched (`modes.ts` first) and are
imported with their `.ts` extension: Vite transpiles them for the page and
the worker, Node 22.18+ runs them as they are for `tools/`.
