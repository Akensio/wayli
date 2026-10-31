# tests

`npm test` runs every `*.test.ts` and `*.test.mjs` here (Vitest, in Node, with
Vite resolving the app's TypeScript); `npm run check` runs them after the
format, lint and type checks. Each file says at its top which part of the app
it holds and to what. Every rule that broke once gets a test here.

| File | What it holds |
|---|---|
| `imports.test.ts` | Which folder may use which: the table in `src/README.md`, read and enforced, and no import cycles. |
| `raptor.test.ts` | The router's rules on tiny timetables: which stop to get off at, which journeys to keep, the next way after an empty window, and the timetable's layout accessors. |
| `raptor-props.test.ts` | The router against a slow, plainly right search on 300 random timetables: the true earliest arrival, journeys that can be ridden, leaving later never arriving earlier. |
| `railtimes.test.mjs`, `feed.test.ts` | Train delays from learned section times; which live vehicles count as fresh. |
| `query.test.ts`, `replan.test.ts`, `status.test.ts`, `follow.test.mjs`, `followview.test.ts` | The pure rules about a trip: what a plan asks for, when to re-plan and what to propose, the notification's line, following's steps and what its screen shows. |
| `query-state.test.ts`, `results.test.ts`, `store.test.ts`, `nav.test.ts` | The app's state: the question's time rules, the order of the result cards, what the phone's storage reads back, the panels' stack and Back (on a fake browser history and on fake CloseWatchers). |
| `client.test.ts` | The page's end of the data worker: every call answered or failed with what it asked. |
| `mapview.test.ts` | What the map shows for each panel. |
| `tinytt.ts` | Not a test: builds a tiny timetable in the real file format, read by the app's own parser, for the router's tests. |
| `e2e/` | The built app in a real browser (`npm run smoke`, see its README). |
