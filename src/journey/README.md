# journey: the domain

What the app is about, as the page holds it: places, a plan as asked, journeys and
their legs, following one, and the records the phone keeps of them. Pure modules:
they import only `lib/` and the engine's and the worker's shapes below them, and
every layer above uses them (`src/README.md`, "May use", is the table; `tools/imports.test.ts` holds it).

| File | What |
|---|---|
| `types.ts` | `Place`, `Query`, a journey and its legs, and the records kept on the phone: a recent `View`, a `SavedTrip`, a `SavedStop`, `savedTripKey`. |
| `follow.ts` | Following a trip: a pure state machine from the journey, the position and the clock to what to tell the rider and when; the `ActiveTrip` it follows. |
| `colors.ts` | Line colours: operators' colours for buses, navy trains, red light rail. |
| `format.ts` | Words: durations, transfers, line names, countdowns. |
| `agencies.ts` | Operators' names in English. |
| `share.ts` | Sharing a journey as text and a link (the caller names the places and says what happened). |
| `pay.ts` | The link to HopOn (Rav-Pass) for paying. |
