# following: the rules of following a trip

Following a trip with no screen: pure functions from the journey, the rider's
position, the clock and the live data to what the rider should be told. The
controller (`controllers/follow.ts`) gathers the inputs, calls these and shows
the answers; the state (`state/follow.ts`) keeps the trip being followed.

| File | Owns |
|---|---|
| `follow.ts` | The state machine: where the rider is along the journey (`advance`, `stepForward`, `stepBack`), what the follow screen shows (`view`), when a trip is over, the changes between rides with live times (`connections`), and joining a faster way onto the trip (`spliceJourney`). |
| `replan.ts` | When to look for a faster way (the ride is late, a change is missed, its vehicle is gone) and which of the ways found is worth proposing. |
| `status.ts` | The notification's line while following: what to do next, with the live time when there is one. |

Does not own: the timers, the position watch, the alerts or the map (all in
`controllers/follow.ts`), the words it uses (`display/`).

Tested in `tests/follow.test.mjs`, `followview.test.ts`, `replan.test.ts`,
`status.test.ts`.
