# measure: how fast and how right

Scripts run by hand in Node against real data, to measure the app's engine.
They are not tests: nothing here passes or fails, they print numbers that go
into `docs/architecture.md` and `docs/decisions.md`.

| File | What it measures |
|---|---|
| `bench.ts` | The router on a real timetable: one plan, a window of departures, bike reach, with timings. Usage at the top of the file. |
| `searchbench.ts`, `searchcases.ts` | The place search on everyday searches (89: a name as written, a part of it, a city, an address, the same name in several cities, a slip, a word still being typed, the other alphabet, stops), each asked through the worker's `search` with the language the app is in and where the rider is, over a real timetable and address book. Per case, where on the list the wanted row is; before counting a case the bench checks that the data has such an entry at all, so a wrong expectation shows as "not in the data" and not as a miss (or a pass). Also: rows in two languages, rows shown twice, the time a search takes. Usage at the top of the file. |
| `searchsample.ts` | The search's long tail: random entries of the real data (restaurants, places named in Latin letters only, other places, addresses, bus stops, stations), each searched five ways through the worker's `search`: by its name from 2 km away, by its name and city with no position, with a letter dropped, in Latin letters by the app's own rule, and by the data's English name. Per kind and way: how often the entry is on the list of eight, and how often first; `-v` lists what was not found. Where the bench asks whether well-known answers come first, this asks whether anything at all can be found. Usage at the top of the file. |
| `trainbacktest.mjs` | The app's train predictions replayed on a morning's raw SIRI minute files (`data/siri/`): how often and by how much they miss. Usage at the top of the file. |
