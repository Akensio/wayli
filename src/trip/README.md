# trip: what a trip is made of

The data the rest of the app passes around about a trip, as types and a few
pure helpers. Nothing here writes a word, draws, keeps state or asks the
worker.

| File | What |
|---|---|
| `place.ts` | A place to plan from or to (`Place`: what the worker takes, plus "my location" being found afresh), and a stop or station as such a place (`stopPlace`). |
| `query.ts` | The question a plan asks (`Query`: places, service day and time, options, what live data went in), and what it asks the router for: the window of departures (`planWindow`) and whether live vehicles go in (`withLive`). |
| `journey.ts` | A journey and its legs (`RideLeg`, `WalkLeg`, `isRide`, `ridesOf`), what the map needs to draw a leg (`DrawLeg`), a plan's answer (`PlanResult`), and what the live data says about a ride (`RideLive`). |

Not here: how any of it reads (`text/`), the records the phone keeps of it
(`state/store.ts`), following a trip (`following/`).

Used by everything above it. It uses only the worker's contract (the shapes
the worker answers in) and the engine's path and live-time types.
