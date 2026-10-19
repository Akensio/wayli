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
7. Before writing code in a new area, state the approach in a paragraph (in
   the conversation, or in `docs/architecture.md` if it is a lasting design
   choice), then build it. Prefer the simplest thing that meets the
   non-negotiables.
8. Standing instruction from Gadi (2026-10-16): use your own judgment and
   build something good, well past an MVP, without waiting for his input at
   each step. He sets direction and priorities (accuracy over speed,
   bicycles, minimal infrastructure, privacy); within those, decide, build,
   measure, document, and report at milestones. Ask only when a choice would
   be expensive to reverse.

## Where things are

| Path | What |
|---|---|
| `README.md` | Public description: what, why, how, roadmap. |
| `docs/architecture.md` | The design: pipeline, compact timetable, on-device routing, real-time, crowd reports, server pieces, the feasibility test. |
| `docs/decisions.md` | Dated log of decisions, including rejected options. |
| `LICENSE` | GNU AGPL-3.0. |
| `pipeline/compile.py` | GTFS zip to one service day's compact timetable (format in `docs/architecture.md`); with `--streets`, real walking transfers. |
| `pipeline/streets.py`, `pipeline/streetgraph.py` | OpenStreetMap extract to the compact street graph; reader and stop-to-stop walking times for the compiler. |
| `pipeline/shapes.py` | GTFS shapes to the compact courses file (simplified polylines per shape); the compiler (`--shapes`) records each pattern's course and where its stops fall on it. |
| `pipeline/rail.py` | OpenStreetMap railways to a small rail graph with an A* router; the compiler (`--rail`) draws train patterns along the track, since the feed has no shapes for trains. |
| `app/raptor.js` | Timetable loader, stop search, RAPTOR planner with window (profile) queries and ranking; browser and Node. |
| `app/streets.js` | Street graph loader; first/last mile on foot or by bike to stops; point-to-point routes. |
| `pipeline/places.py`, `app/places.js` | Offline address book from OpenStreetMap (streets, house numbers, cities, notable places) and the free-text search over it. |
| `app/index.html`, `app/app.js`, `app/worker.js`, `app/sw.js`, `app/styles.css` | The app: shell (one map, a top search bar, a bottom sheet of panels), UI, data worker, service worker, styles. Hebrew/RTL first, English toggle, no framework, no build step. |
| `app/live.js`, `app/follow.js`, `app/store.js` | Real-time client (Hasadna Open Bus, delay estimate, Israel-time helpers); trip-following state machine (pure, testable in Node); on-device store (settings, history, saved places, trip in progress). |
| `app/darkmap.js` | The dark basemap: OpenFreeMap's Liberty style recoloured by role at runtime. |
| `app/feasibility.html` | The routing test page (older harness). `app/bench.mjs` times the router in Node, `app/browser_bench.mjs` in headless Chromium, `app/build_artifact.py` builds the artifact variant. |
| `pipeline/build_site.py` | Assembles `site/`: app files, per-day timetables, street graph, `data/manifest.json`. |
| `.github/workflows/build.yml` | Nightly data build and GitHub Pages deploy. |
| `eslint.config.mjs` | The lint check (undeclared names are errors): `npx --yes eslint@9 app/*.js`, also run by the workflow before every build. Run it before pushing app code. |
| `data/`, `site/` | Gitignored: downloads, compiled files, the built site. |

Planned, not yet created: `worker/` (Cloudflare Worker for the real-time
relay, reports and push). Create it when the work starts.

## Current state

2026-10-18: v0.3 is on `main` and live at https://akensio.github.io/wayli/,
rebuilt nightly by the workflow. Gadi normally merges session branches into
`main` himself (squash); for this effort he allowed direct pushes of `main`
(fast-forward from the session branch). The app is map first (one map with
the live vehicles under a search bar and a bottom sheet), plans
(depart/arrive-by, grouped results, countdowns, live delays shifted before
routing), remembers (history, saved places, last search), follows a trip
with get-off alerts and resumes it, shows live times from Hasadna's Open
Bus data (no key, no relay), has line pages and bubbles on the map, shares
trips, proposes a faster way while following when delays appear (v0.3.1),
and has settings. 2026-10-18 later: one vector icon set replaces every
emoji (also the map badges), settings are grouped lists, the menu opens from
a user button in the search pill, the sheet drags from anywhere, and train
courses meet the track beside each station. 2026-10-19: stop names,
headsigns, the address book and the basemap's labels follow the language
setting (English from the feed's translations and OpenStreetMap); the first
three ways are drawn on the map together, one highlighted, with a map button
per card; the collapsed sheet is a handle plus one line about the
highlighted way (the chip strip is gone); the top bar is pills. Next: crowd
reports, Arabic, elevation, measuring live-data freshness in daily use, a
fallback relay only if Hasadna proves unreliable.
