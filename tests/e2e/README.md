# tests/e2e: the built app in a browser

`npm run smoke` drives the app as a rider would, in a phone-sized Chromium,
on the site built into `site/` (the app and a day of data:
`pipeline/build_site.py`). Each step prints `ok` or `FAIL` with what it saw;
the run fails on a failed step or on any error on the page. They take a few
minutes and need the data, so `npm run check` does not run them: run them
before pushing a change to what a rider sees.

Playwright is not one of the app's dependencies (it brings its own browser).
Install it beside the repo (`npm i --no-save playwright`), or point
`PLAYWRIGHT` at an installed copy.

| File | What it drives |
|---|---|
| `harness.mjs` | What they share: the site served from `site/`, the first service day it carries at 09:30, the rider by HaShalom station, the checks. |
| `flow.mjs` | The main flow: plan, a way, its line, a stop, following a trip, the drawer's searches, settings, saved places. |
| `back.mjs` | Back on Android (close requests) and with browser history: panels close newest first, then the plan, the menu and settings. |
| `map.mjs` | Locate and the compass, a place's and a stop's bubble, choosing a place on the map. |
