# tests

`npm test` runs every `*.test.ts` and `*.test.mjs` here (Vitest, in Node, with
Vite resolving the app's TypeScript); `npm run check` runs them after the
format, lint and type checks. Each file says at its top which part of the app
it holds and to what. Every rule that broke once gets a test here.

| File | What it holds |
|---|---|
| `imports.test.ts` | Which folder may use which: the table in `src/README.md`, read and enforced, and no import cycles. |
| `raptor.test.ts` | The router's rules on tiny timetables: which stop to get off at, which journeys to keep, the next way after an empty window, that a trip is boarded and left only where the feed allows (no intercity line between two stops of one city), when a way past the longest walk is worth offering (the night's direct bus against three within the limit, and the rule's edges), and the timetable's layout accessors. |
| `raptor-props.test.ts` | The router against a slow, plainly right search on 300 random timetables: the true earliest arrival, journeys that can be ridden, leaving later never arriving earlier. |
| `railtimes.test.mjs`, `delays.test.ts`, `feed.test.ts` | Train delays from learned section times; the bus delay model's steadiness rules; no news past due, for a bus and for a train (the very same position for two minutes after it was due to move is no estimate; standing is not certain past five minutes and no estimate past twenty-five); which live vehicles count as fresh. |
| `query.test.ts`, `replan.test.ts`, `status.test.ts`, `follow.test.mjs`, `followview.test.ts` | The pure rules about a trip: what a plan asks for, when to re-plan and what to propose, the notification's line, following's steps and what its screen shows. |
| `now.test.ts` | A plan as it stands now and the one store of live times, by the cases that went wrong on the road: the bus short of the stop that was filed as gone, the train that never ran and was "leaving now" for an hour and a half, the late train missing from its stop's list, a list saying "now" for ever, a missed change, and one ride showing the same time on the card, its chip, the stop page and the list of rides. |
| `planlive.test.ts` | The worker's one answer per trip on a tiny timetable loaded the way the worker loads a real one and fed minute by minute as the relay feeds it: the planner routed on the same times the screens are given; a bus short of the stop leaves now; one past it has gone; the week's trains replayed (a parked set that never ran, a dead fix while the train ran on, a train standing with a live GPS); what a fresh open knows from the snapshots of minutes before. |
| `best.test.ts` | What "Best" means, by the choices a rider meets: a short trip's direct bus against a change, a long walk against the bus by the door, a long trip's tight change onto an hourly train, the same tight change onto a frequent line, and two ways alike but for when they leave. |
| `query-state.test.ts`, `results.test.ts`, `store.test.ts`, `nav.test.ts` | The app's state: the question's time rules, the order of the result cards and that the trips of a search stay while their times follow (the clock and a newer look move a card's times, not the card; asking again does), what the phone's storage reads back, the panels' stack and Back (on a fake browser history and on fake CloseWatchers). |
| `client.test.ts` | The page's end of the data worker: every call answered or failed with what it asked. |
| `mapview.test.ts` | What the map shows for each panel. |
| `tinytt.ts` | Not a test: builds a tiny timetable in the real file format, read by the app's own parser, for the router's tests. |
| `e2e/` | The built app in a real browser (`npm run smoke`, see its README). |
