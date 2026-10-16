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
| `app/raptor.js` | Timetable loader, stop search, RAPTOR planner with window (profile) queries and ranking; browser and Node. |
| `app/streets.js` | Street graph loader; first/last mile on foot or by bike to stops; point-to-point routes. |
| `app/feasibility.html` | The routing test page. `app/bench.mjs` times it in Node, `app/browser_bench.mjs` in headless Chromium, `app/build_artifact.py` turns it into a page publishable as a Claude artifact. |
| `data/` | Gitignored: the downloaded feed and OSM extract, compiled files, built artifact pages. |

Planned, not yet created: `worker/` (Cloudflare Worker for the real-time
relay, reports and push), the nightly GitHub Action around `pipeline/`, and
the real app (the test page is not it). Create them when the work starts.

## Current state

2026-10-16: the feasibility test passed on desktop and the routing core
grew real transfers, window queries and bikes the same day (numbers in
`docs/architecture.md`); the phone measurement is pending, on the test page
published as a private Claude artifact (link in Gadi's task system). Where
routing runs is decided only after that. Nothing user-facing exists yet;
the next big pieces are bike-on-transit rules, the nightly pipeline, and the
app itself.
