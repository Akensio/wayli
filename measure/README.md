# measure: how fast and how right

Scripts run by hand in Node against real data, to measure the app's engine.
They are not tests: nothing here passes or fails, they print numbers that go
into `docs/architecture.md` and `docs/decisions.md`.

| File | What it measures |
|---|---|
| `bench.ts` | The router on a real timetable: one plan, a window of departures, bike reach, with timings. Usage at the top of the file. |
| `trainbacktest.mjs` | The app's train predictions replayed on a morning's raw SIRI minute files (`data/siri/`): how often and by how much they miss. Usage at the top of the file. |
