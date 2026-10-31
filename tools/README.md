# tools: measuring and testing

| File | What |
|---|---|
| `follow.test.mjs`, `railtimes.test.mjs`, `mapview.test.ts` | `npm test`: follow mode's state machine, train delays, what the map shows for each panel. |
| `bench.ts` | Runs the router in Node: a plan, a window of departures, bike reach. |
| `trainbacktest.mjs` | Scores the app's train predictions on a morning's raw SIRI minute files (kept in `data/siri/`). |
