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
   - Trip planning runs on the device. No server ever sees a trip request.
   - Nothing about the rider leaves the phone except what they tap to send
     (a crowd report, an opt-in alert subscription). No analytics that track
     people, no location data sold, no tracking ads, ever.
   - Hebrew and right-to-left are first-class from the first screen.
   - Works offline once the timetable is downloaded.
   - Crowd reports are structured one-tap items. No free-text chat.
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

## Where things are

| Path | What |
|---|---|
| `README.md` | Public description: what, why, how, roadmap. |
| `docs/architecture.md` | The design: pipeline, compact timetable, on-device routing, real-time, crowd reports, server pieces, the feasibility test. |
| `docs/decisions.md` | Dated log of decisions, including rejected options. |
| `LICENSE` | GNU AGPL-3.0. |

Planned, not yet created: `pipeline/` (GTFS to compact timetable, runs in
GitHub Actions), `app/` (the installable web app), `worker/` (Cloudflare
Worker for the real-time relay, reports and push). Create them when the work
starts, not before.

## Current state

Repo scaffolded 2026-10-16. No code yet. The next step is the feasibility
test described in `docs/architecture.md`: compile the Israel GTFS feed to a
compact format and plan Haifa to Be'er Sheva with three transfers in the
browser, in under one second on a phone. Everything after that depends on
the result.
