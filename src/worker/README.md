# worker: the data worker

| File | What |
|---|---|
| `worker.js` | Runs off the main thread. Downloads and holds the day's timetable, the street graph, the address book and the courses, and answers every query by name (`plan`, `stopInfo`, `trainsBetween`, `rideOptions`, `lineInfo`, `search`, ...), using `engine/`. Also keeps the last live snapshot to match vehicles to trips. |
| `client.ts` | The app's end: `call(op, args)` returns a promise per request. |
