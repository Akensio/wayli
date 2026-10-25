# engine: the logic with no screen

Plain JavaScript modules with no DOM and no app imports, so the data worker
runs them and so does Node (`tools/`: the benchmark, the tests, the train
backtest).

| File | What |
|---|---|
| `raptor.js` | Reads the compact timetable (format in `docs/architecture.md`); stop search; RAPTOR: one round per vehicle boarded, an earliest-arrival plan or a whole window of departures (profile), then ranking. |
| `streets.js` | Reads the street graph: the walk or ride from a point to the stops around it and between two points, with climbs counted (`secondsOn`). |
| `places.js` | The offline address book: free-text search over streets, house numbers, cities and places. |
| `live.js` | Real time: the vehicles from the relay or Hasadna, matching a vehicle to its trip, where it is along its stops, delay estimates for buses (learned section times) and trains (runs and stands), Israel-time helpers. |
| `follow.js` | Following a trip: a pure state machine from the journey, the position and the clock to what to tell the rider and when. |
