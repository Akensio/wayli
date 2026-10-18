# Decisions

One dated line per decision, newest at the bottom. Rejected options stay here
so they are not re-litigated.

- 2026-10-15 Project started: a public-transport app for Israel meant to beat
  Moovit and Bus Nearby. Multi-transfer, multimodal trip planning is the
  feature everything is built around.
- 2026-10-15 Trip planning runs on the device (RAPTOR over a compiled
  timetable), not on a server: offline use, privacy, near-zero hosting.
- 2026-10-15 Timetables ship as static files from a CDN, rebuilt nightly by a
  GitHub Action. Torrent/IPFS rejected for now; an optional mirror maybe later.
- 2026-10-15 Servers only where unavoidable: real-time relay, crowd reports,
  push alerts. Cloudflare Workers + D1.
- 2026-10-15 Crowd reports are structured one-tap items, anonymous,
  location-gated, fading after about 15 minutes. Free-text chat rejected
  (moderation, safety, cost). Built after routing.
- 2026-10-15 Money: routing, live arrivals, offline and privacy are free
  forever. Pro tier (commute alerts, widgets/watch, no ads, supporter tier;
  maybe Rav-Kav ticket commissions, which would need Ministry approval and is
  unchecked) and B2B (white-label for municipalities and operators; employer,
  venue and tourism widgets). Location data is never sold; no tracking ads.
- 2026-10-15 Name: Wayli (sounds like וואי לי).
- 2026-10-15 Launch as an installable web app (PWA) first; native wrappers
  only if needed later.
- 2026-10-15 License: GNU AGPL-3.0, public repository. Proprietary,
  all-rights-reserved was considered and dropped. No contributor license
  agreement is set up.
- 2026-10-16 Repository created (github.com/Akensio/wayli) and scaffolded:
  README, CLAUDE.md, docs/. No code yet; next is the feasibility test.
- 2026-10-16 Clarified: on-device routing is a hypothesis under test, not a
  decision. The real principle is minimal infrastructure: nothing that costs
  money or manual configuration time without a reason. The feasibility test
  decides where routing runs; fallbacks are listed in `architecture.md`.
- 2026-10-16 Feasibility test, desktop part: passed. One weekday of the
  national feed (123k trips, 4.5M stop times) compiles in 35 s to a 2.8 MB
  gzip, 26 MB in memory. RAPTOR with up to 3 transfers answers Haifa to
  Be'er Sheva in 23 to 38 ms in headless Chromium and 10 to 30 ms in Node for
  other cross-country queries; results checked against the raw feed. Phone
  timing still pending. Footpath radius set to 400 m (250 m could not get
  from the HaMifratz platforms to the train).
- 2026-10-16 Priorities after the test: speed is a solved problem, accuracy
  is not. The router must not miss good transfer opportunities (realistic
  walking between stops and stations, sensible transfer buffers, more than
  one departure per answer). Bicycle is a required mode, important for some
  riders: bike as first/last mile, bike between transit legs, bike on
  trains where allowed. Both need a street network in the pipeline; see
  `architecture.md`.
- 2026-10-16 Gadi: Claude builds on its own judgment, well past an MVP,
  reporting at milestones; he sets direction. Recorded in CLAUDE.md.
- 2026-10-16 Built the transfer-accuracy pass and the street network: real
  walking transfers from OpenStreetMap (404k, 10 min cap), station
  transfers, 90 s boarding slack, range-RAPTOR window queries with ranking,
  multi-origin from points on foot or by bike, bike-only routes. A one-hour
  window answers in about 330 ms in desktop Chromium; the street graph is
  10.7 MB. Bike-on-transit rules remain to be collected. Details in
  `architecture.md`.
- 2026-10-16 Gadi: bikes on trains are always possible. So "take the bike
  along" means trains only (GTFS route_type 2); buses never; light rail
  unknown until he says. Implemented as a vehicle-type filter in the
  planner; the test page offers no bike / ride to the stop and park it /
  take it along.
- 2026-10-16 Checked the bike rules online (Gadi asked): trains bar
  non-folding bikes on weekday peaks, intercity buses take them in the
  luggage compartment, city buses and light rail take folding bikes only.
  Coded as such, with "intercity" as a heuristic from route names and
  length. Supersedes the "trains only, always" line above.
- 2026-10-16 Gadi: the test page on his phone never loaded its data (the
  artifact host), and he wants a full product to test. Built the app v0.1
  (`app/`), deployed by a nightly GitHub Action to GitHub Pages: one
  timetable file per day, the street graph loaded lazily, a service worker
  for offline. Testing through Claude artifacts is abandoned.
- 2026-10-17 Live: Gadi enabled Pages (source: GitHub Actions) and
  squash-merged the branch (PR #1); the first workflow run built 7 days and
  the street graph in 9 minutes and published https://akensio.github.io/wayli/.
- 2026-10-17 Gadi: the app did not find "הורדים 4, גבעתיים"; addresses must
  work in general. Built an offline address book from OpenStreetMap
  (`pipeline/places.py`, `app/places.js`) rather than an online geocoder:
  no third party sees the rider's addresses, no usage limits, works offline.
- 2026-10-17 Gadi: the raster map looks dated; pick-on-map must be obvious.
  Switched both maps from Leaflet raster tiles to MapLibre GL with OpenFreeMap
  vector tiles (free, keyless, crisp, dark mode). The location and map
  buttons became labelled chips under each field. The app now reloads itself
  when a new build is deployed and shows its build time.
- 2026-10-17 Gadi: the dark basemap in dark mode is too dark. One light,
  colourful basemap (OpenFreeMap Liberty) in every theme; it also shows bus
  stops and landmarks, which the grey Positron did not.
- 2026-10-17 Gadi: play with the app and improve it by a drastic margin; his
  list: compact the ways to go, history and saved places, "start a drive"
  that says when to get off, resume a started trip, live times, re-check a
  searched trip. All built as v0.2 (see `docs/architecture.md`), plus
  arrive-by, earlier/later, countdowns, expandable stops, sharing, home and
  work, settings, install prompt, night service in one file.
- 2026-10-17 Live times come from Hasadna's Open Bus API straight from the
  phone: it allows browser calls, needs no key, and SIRI line_ref equals
  the GTFS route_id, so no relay and no secret. The timetable now stores
  route_id per route. Delays are estimated on the device from the vehicle's
  position against its schedule. Rejected: the Ministry's SIRI feed via a
  relay (credentials, a server), kept as a fallback.
- 2026-10-17 Gadi: a dark basemap in dark mode is fine if it is sensible and
  under the user's control. OpenFreeMap "Fiord" (readable streets and
  labels) is offered as a setting; light Liberty stays the default in both
  themes; OpenFreeMap "dark" stays rejected.
- 2026-10-17 Alerts in follow mode use the Notification API through the
  service worker plus vibration and a short beep, all on the device.
  Rejected: push notifications from a server (would need a worker and keys)
  for something the phone can do itself while the trip screen is open.
- 2026-10-17 A service day's file includes the next calendar day's trips
  that start before 03:00, shifted by 24 h, because the feed codes night
  buses on the next date. Rejected: loading two files at night in the app.
- 2026-10-18 Gadi: show live buses on the map, and use live train data in
  planning (a delayed train from HaShalom to Rehovot was missing). Built a
  live map (every reporting vehicle in view, stops when zoomed in) and
  live-aware planning: a plan from now shifts delayed trips (buses near the
  origin, every train) before routing, keeping each pattern's trips in
  order. Rejected: re-sorting trips after delays (breaks the format's
  assumptions) and server-side routing with live data (a server).
- 2026-10-18 Live queries sort by recorded time, look back half an hour and
  show the data's age: Hasadna's ingestion was 20 minutes behind that
  morning and backfilled old snapshots, so "newest by id" lied.
