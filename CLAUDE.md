# Instructions for Claude sessions working in this repo

This is Wayli, Gadi's public-transport app for Israel (public repo, AGPL-3.0).
You are the engineer on it: he sets direction, you build, document and keep
the repo tidy. Read `README.md`, `docs/architecture.md` and
`docs/decisions.md` before doing anything.

## Ground rules

1. Whatever Gadi says outranks what is written here or in `docs/`. When he
   changes a decision, add a dated line to `docs/decisions.md`, update
   whatever else it touches, and move on. Never argue from a file against him.
2. The non-negotiables, which no convenience overrides:
   - Minimal infrastructure. Anything that costs money or needs manual
     configuration has to earn its place. Prefer static files, free tiers
     and work that runs on the rider's device.
   - No tracking: no analytics that follow people, no location data sold,
     no tracking ads, ever. Privacy is the edge over Moovit.
   - Hebrew and right-to-left are first-class from the first screen.
   - Crowd reports are structured one-tap items. No free-text chat.
   Where trip planning runs (device, server, or a mix) is not decided.
   On-device RAPTOR is the leading option because it needs the least
   infrastructure, and the feasibility test decides. Offline use and "no
   trip request leaves the phone" are benefits of that option, not
   requirements on their own.
3. License: every source file in this repo is AGPL-3.0. Only add dependencies
   whose licenses are AGPL-compatible (MIT, BSD, Apache-2.0, MPL-2.0, LGPL,
   GPL, AGPL are fine). If a package's license is unclear, don't add it.
4. Never invent data. Facts about the GTFS feed, SIRI, Hasadna's API, fares
   or operators come from the source and get a link; estimates are labelled
   as estimates.
5. Keep docs compact. `docs/architecture.md` is the current design, rewritten
   in place, not a changelog. `docs/decisions.md` is the changelog: one dated
   line per decision, newest at the bottom, rejected options included.
6. Commit after each coherent step with a short message that says what
   changed. Push to the branch the session was given unless Gadi has said to
   push `main`. Gadi's tasks and deadlines live in his private task system,
   not here: no TODO lists or task files in this repo.
7. Design before code (Gadi, 2026-10-25). Never go straight to code. For any
   change beyond a small tweak, new code or a change to existing behaviour
   alike, first explain the algorithm or design in natural language, with a
   diagram where it helps, the way programmers did before AI: what the
   natural thing to do is, and why. Name what the change touches and who
   depends on it; when the meaning of something changes (what a time, a
   field or a function stands for), list everything that reads it before
   changing any of it. Then write the code to match that explanation, and
   treat the code itself as an app for the next programmer: clear parts,
   each saying what it promises and to whom, ready for someone else to pick
   up. The explanation lives in the conversation; only a genuinely
   complicated algorithm gets its design (words and diagrams) into
   `docs/architecture.md`. Prefer the simplest design that meets the
   non-negotiables. (Why: on 2026-10-25 a train's shown time changed from
   departure to arrival while the planner kept the departure, and a plan
   sent Gadi to a train after it had pulled in.)
8. Standing instruction from Gadi (2026-10-16): use your own judgment and
   build something good, well past an MVP, without waiting for his input at
   each step. He sets direction and priorities (accuracy over speed,
   bicycles, minimal infrastructure, privacy); within those, decide, build,
   measure, document, and report at milestones. Ask only when a choice would
   be expensive to reverse.
9. Clean up on the way (Gadi, 2026-10-25). When the code you touch has one
   thing implemented again and again in many places (a chip built by hand in
   eight files, the same calculation in three modules), that is where you
   come in: replace the copies with one shared component or function, used
   everywhere, in the same change. Leave the code better than you found it,
   and say in the commit what was unified.

## Where things are

| Path | What |
|---|---|
| `README.md` | Public description: what, why, how, roadmap. |
| `docs/architecture.md` | The design: pipeline, compact timetable, on-device routing, real-time, crowd reports, server pieces, the feasibility test. |
| `docs/decisions.md` | Dated log of decisions, including rejected options. |
| `docs/principles.md` | The design rules agreed with Gadi, each with its owner in the code and its test. |
| `LICENSE` | GNU AGPL-3.0. |
| `pipeline/compile.py` | GTFS zip to one service day's compact timetable (format in `docs/architecture.md`); with `--streets`, real walking transfers. |
| `pipeline/streets.py`, `pipeline/streetgraph.py`, `pipeline/elevation.py` | OpenStreetMap extract to the compact street graph, with the climbs along each street from open elevation tiles; reader and stop-to-stop walking times for the compiler. |
| `pipeline/shapes.py` | GTFS shapes to the compact courses file (simplified polylines per shape); the compiler (`--shapes`) records each pattern's course and where its stops fall on it. |
| `pipeline/rail.py` | OpenStreetMap railways to a small rail graph with an A* router; the compiler (`--rail`) draws train patterns along the track, since the feed has no shapes for trains. |
| `src/` | The app; `src/README.md` explains the layout and each folder has its own README. At the top only the entry files: `index.html`, `main.ts` (renders the views), `boot.ts` (starts the controllers), `sw.template.js` (the service worker); the CSS is in `styles/`, one file per part of the screen. |
| `src/engine/` | The logic with no screen, run in the data worker and in Node (`tools/`): `raptor.ts` (timetable, stop search, RAPTOR with window queries and ranking), `streets.ts` (first/last mile on foot or by bike, with climbs), `places.ts` (offline address book search), `clock.ts` (Israel time), `feed.ts` (live vehicles: the relay or Hasadna), `delays.ts` (delay estimates), and the pieces they share: `geo.ts` (distances, where a point is along a trip), `modes.ts`, `container.ts` (reading the data files), `text.ts` (how searches compare names). |
| `src/worker/` | The data worker: a module per kind of question (`data`, `search`, `plan`, `stops`, `lines`, `trips`, `courses`, `vehicles`, `traffic`), `worker.ts` the message loop, and the app's client for it. |
| `src/state/`, `src/controllers/`, `src/views/`, `src/widgets/` | The app: one state module per feature and the on-device store `state/store.ts` (signals; a few `hooks` the controllers fill, for what a state flow must set off); what happens behind them (loading, planning, live polling, follow mode, alerts), exported functions the views call directly; the views, the parts of the screen (Preact); widgets, the small pieces several views share (icons, line chips, the timetable, toast). Layout in `docs/architecture.md`, "The app". |
| `src/map/`, `src/journey/`, `src/lib/` | The map (MapLibre 6 bundled, the basemap's style with its two palettes, what is drawn for each panel); the domain (places, queries, journeys, the records kept on the phone, the trip-following state machine `journey/follow.ts`), colours, words, sharing and the pay link; helpers used everywhere (strings in both languages, time). |
| `src/public/` | Copied as is into the build: icons, the web manifest. |
| `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.mjs` | The toolchain: `npm run check` (format check, lint, type-check, tests) and `npm run build` (Vite, into `dist/`; the service worker is written there with the list of built files). Run `npm run check` before pushing app code; the workflow runs both before every build. |
| `tools/` | `bench.ts` runs the router in Node (plan, profile, bike reach) for measuring; `trainbacktest.mjs` scores the app's train predictions on a morning's raw minute files (kept in `data/siri/`); the `*.test.mjs` and `*.test.ts` are `npm test` (Vitest; `tinytt.ts` builds a tiny timetable in the real container for the router's tests). Every rule that broke gets a test. |
| `pipeline/places.py` | OpenStreetMap to the offline address book (streets, house numbers, cities, notable places), searched on the device by `src/engine/places.ts`. |
| `pipeline/weekend.py` | The municipalities' weekend lines (Na'im BeSofash), which no feed carries, merged into the GTFS from Tel Aviv's GIS with estimated times (a build step). |
| `pipeline/bustimes.py`, `.github/workflows/bustimes.yml` | Bus section times by hour and kind of day, learned nightly from 14 days of passage logs read from Hasadna's minute snapshots (`bustimes.bin.gz`), for bus delays, the live correction and traffic on the map; `--score DAY` measures against a held-out day. |
| `pipeline/railtimes.py`, `.github/workflows/railtimes.yml` | Train section times learned nightly from the last week of Hasadna's train positions (`railtimes.json`), for train delays; `--score DAY` measures against a held-out day. |
| `pipeline/test_projection.py` | The compiler's own check (the stop-on-course rule), run by the workflow after numpy is installed: `python3 -I pipeline/test_projection.py`. |
| `pipeline/container.py`, `pipeline/common.py` | What the scripts share: the data files' container (read in the app by `src/engine/container.ts`); the log line, GTFS reading, Israel's UTC offset, distances. |
| `pipeline/build_site.py` | Assembles `site/`: the Vite build, per-day timetables, street graph, `data/manifest.json`. |
| `.github/workflows/build.yml` | Nightly data build and GitHub Pages deploy. |
| `relay/`, `.github/workflows/relay.yml` | The real-time relay (Hasadna's newest raw SIRI snapshot with CORS) and its deploy. |
| `data/`, `site/`, `dist/`, `node_modules/` | Gitignored: downloads, compiled files, the built site, the build, the toolchain. |

`relay/relay.js` is the real-time relay, a Cloudflare Worker (free plan,
https://wayli-relay.wayli.workers.dev), deployed by
`.github/workflows/relay.yml` with the repo's `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets whenever `relay/` changes. Reports and push
will join it when that work starts.

## Current state

2026-10-18: v0.3 is on `main` and live at https://akensio.github.io/wayli/,
rebuilt nightly by the workflow. Gadi normally merges session branches into
`main` himself (squash); for this effort he allowed direct pushes of `main`
(fast-forward from the session branch). The app is map first (one map with
the live vehicles under a search bar and a bottom sheet), plans
(depart/arrive-by, grouped results, countdowns, live delays shifted before
routing), remembers (history, saved places, last search), follows a trip
with get-off alerts and resumes it, shows live times from Hasadna's Open
Bus data (no key; since 2026-10-21 through our relay, about a minute old), has line pages and bubbles on the map, shares
trips, proposes a faster way while following when delays appear (v0.3.1),
and has settings. 2026-10-18 later: one vector icon set replaces every
emoji (also the map badges), settings are grouped lists, the menu opens from
a user button (now a menu button) in the search pill, the sheet drags from anywhere, and train
courses meet the track beside each station. 2026-10-19: stop names,
headsigns, the address book and the basemap's labels follow the language
setting (English from the feed's translations and OpenStreetMap); the first
three ways are drawn on the map together, one highlighted, with a map button
per card; the collapsed sheet is a handle plus one line about the
highlighted way (the chip strip is gone); the top bar is pills. Next: crowd
reports, Arabic, elevation, measuring live-data freshness in daily use, a
fallback relay only if Hasadna proves unreliable. 2026-10-20: Gadi chose the stack change: Preact with signals,
TypeScript and a Vite build; the app was moved into components feature by
feature while staying live (`docs/architecture.md`, "The app"): the bar, the
results, the sheet, the detail and follow screens, the pages, the navigation
and shell, the map, and last the controllers behind them (`app.js` is
gone; every UI module is type-checked). 2026-10-25: trains show their number
with Israel Railways' mark; live delays no longer send a rider to a train
after it pulled in (the fixes are in `docs/decisions.md`); and a night of
cleanup: views by feature, the data worker split by kind of question,
`engine/live.js` split into `clock`, `feed` and `delays`, the strings with
Hebrew and English side by side, the CSS one file per part of the screen
(`src/styles/`), shared pieces in place of copies.
