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
- 2026-10-16 Maintainer: Claude builds on its own judgment, well past an MVP,
  reporting at milestones; he sets direction. Recorded in CLAUDE.md.
- 2026-10-16 Built the transfer-accuracy pass and the street network: real
  walking transfers from OpenStreetMap (404k, 10 min cap), station
  transfers, 90 s boarding slack, range-RAPTOR window queries with ranking,
  multi-origin from points on foot or by bike, bike-only routes. A one-hour
  window answers in about 330 ms in desktop Chromium; the street graph is
  10.7 MB. Bike-on-transit rules remain to be collected. Details in
  `architecture.md`.
- 2026-10-16 Maintainer: bikes on trains are always possible. So "take the bike
  along" means trains only (GTFS route_type 2); buses never; light rail
  unknown until he says. Implemented as a vehicle-type filter in the
  planner; the test page offers no bike / ride to the stop and park it /
  take it along.
- 2026-10-16 Checked the bike rules online (the maintainer asked): trains bar
  non-folding bikes on weekday peaks, intercity buses take them in the
  luggage compartment, city buses and light rail take folding bikes only.
  Coded as such, with "intercity" as a heuristic from route names and
  length. Supersedes the "trains only, always" line above.
- 2026-10-16 Maintainer: the test page on his phone never loaded its data (the
  artifact host), and he wants a full product to test. Built the app v0.1
  (`app/`), deployed by a nightly GitHub Action to GitHub Pages: one
  timetable file per day, the street graph loaded lazily, a service worker
  for offline. Testing through Claude artifacts is abandoned.
- 2026-10-17 Live: the maintainer enabled Pages (source: GitHub Actions) and
  squash-merged the branch (PR #1); the first workflow run built 7 days and
  the street graph in 9 minutes and published https://akensio.github.io/wayli/.
- 2026-10-17 Maintainer: the app did not find "דיזנגוף 50, תל אביב"; addresses must
  work in general. Built an offline address book from OpenStreetMap
  (`pipeline/places.py`, `app/places.js`) rather than an online geocoder:
  no third party sees the rider's addresses, no usage limits, works offline.
- 2026-10-17 Maintainer: the raster map looks dated; pick-on-map must be obvious.
  Switched both maps from Leaflet raster tiles to MapLibre GL with OpenFreeMap
  vector tiles (free, keyless, crisp, dark mode). The location and map
  buttons became labelled chips under each field. The app now reloads itself
  when a new build is deployed and shows its build time.
- 2026-10-17 Maintainer: the dark basemap in dark mode is too dark. One light,
  colourful basemap (OpenFreeMap Liberty) in every theme; it also shows bus
  stops and landmarks, which the grey Positron did not.
- 2026-10-17 Maintainer: play with the app and improve it by a drastic margin; his
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
- 2026-10-17 Maintainer: a dark basemap in dark mode is fine if it is sensible and
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
- 2026-10-18 Maintainer: show live buses on the map, and use live train data in
  planning (a delayed train from HaShalom to Rehovot was missing). Built a
  live map (every reporting vehicle in view, stops when zoomed in) and
  live-aware planning: a plan from now shifts delayed trips (buses near the
  origin, every train) before routing, keeping each pattern's trips in
  order. Rejected: re-sorting trips after delays (breaks the format's
  assumptions) and server-side routing with live data (a server).
- 2026-10-18 Live queries sort by recorded time, look back half an hour and
  show the data's age: Hasadna's ingestion was 20 minutes behind that
  morning and backfilled old snapshots, so "newest by id" lied.
- 2026-10-18 Maintainer: the phone's back button must go back inside the app, and
  rides must follow their real course, not straight lines between stops.
  Overlays and tab changes became history entries (popstate closes them);
  the feed's shapes.txt is compiled to a 3.6 MB courses file loaded last,
  and each day's file records where every stop falls on its pattern's
  course. Rejected: routing rides along the street graph (wrong for rail,
  approximate for buses) and per-day shape files (the courses hardly change,
  one cached file serves every day).
- 2026-10-18 Maintainer: search by line number; tap a station on the map to see
  its lines. Line search and a line page (course, stops, the line's
  vehicles now with their delays, other directions); the live map's stops
  open the stop page with its lines and departures. The maintainer also floated a
  map-first home screen; not decided, see the discussion in the session.
- 2026-10-18 The feed has no shapes for trains, so train courses come from
  OpenStreetMap railways routed station to station (`pipeline/rail.py`),
  stored once per station pair in the day's file. Rejected: drawing trains
  stop to stop (the maintainer's own example was a train) and asking Israel Railways
  for geometry (no open source of it).
- 2026-10-18 Maintainer: the dark map lacks the light map's detail (3D shapes,
  road types, stops); show each live vehicle's direction; the build time
  must be Israel time. The dark map is now Liberty itself recoloured at
  runtime (Fiord dropped); vehicles carry heading arrows; times shown are
  Israel time everywhere. Rejected: hand-maintaining a dark style JSON
  (Liberty changes under us) and a server-side style (a server).
- 2026-10-18 Maintainer: the ride's map must show the whole line, faded where he
  is not on it, and every live vehicle of it. Done on the journey and
  follow maps; the planned trip's vehicle is ringed. Also fixed the same
  morning: vehicle markers stretched across the map (a stray position
  rule), train courses dotted at every bend (dots now come from the stop
  list), and the service worker's shell cache is keyed by the build so
  every deploy refreshes the app on the phone.
- 2026-10-18 Maintainer: tapping a vehicle on a map must show a bubble on the map,
  not open a page. Bubbles (MapLibre popups) for vehicles and stops on every
  map, with buttons to the pages; the live map's bottom card is gone.
- 2026-10-18 Maintainer, at Rehovot station: "why a 2-minute walk, I'm in the
  station?" and "the train is 18:24, delayed to 18:29; where does 18:28
  come from?" Standing at a stop (150 m for a railway station) now counts
  as being there, and nearby walks are capped by the straight line. 18:28
  was the position-based delay estimate (+4, the official figure was +5);
  the detail now shows the scheduled time struck through next to the live
  one, and a bug that lost the live badge on refresh (the shifted first
  departure was used as the matching key) is fixed.
- 2026-10-18 Maintainer, on the proposal for a map-oriented interface: "let's do
  it". v0.3 is map first: one map under everything with the live vehicles
  always on it, a floating search bar for places and line numbers (a
  destination plans from where you are), a bottom sheet with three heights
  for every panel, a menu instead of tabs, picking a point and following a
  trip on the same map. Rejected: keeping the tab bar with a map tab (the
  map is the home, not a destination), one map per panel as before (five
  maps on a phone, each refitting), and a framework for the sheet (a few
  pointer events do it).
- 2026-10-18 Maintainer: the accent colour is turquoise, not orange (and not
  cyan): #12998b in light mode, #2fcfbc in dark, a darker shade for text
  links; icons and the theme colour follow.
- 2026-10-18 Maintainer: while following a trip, "recalculate" when delays on
  the road make it better to get off early and take another line. Built as
  a periodic re-plan from the next stop with live vehicles, proposed as a
  card with one tap to switch (details in architecture.md). Rejected:
  switching automatically (the rider is on a vehicle; a surprise change is
  worse than a late one) and re-planning every minute regardless (data use
  on the phone; it runs when the ride is late, the vehicle is missing, or
  every five minutes).
- 2026-10-18 a street with a quote mark in its name, הל"ה, was not found
  ("לה", "הלה"). The normaliser turned the gershayim into a space, making
  two words, while her spelling lost its leading ה and matched "לה
  גוארדיה". Now a quote inside a word is part of the word (streets, stops,
  places, cities, in the app and the pipeline), and stops and places are
  ranked together on one scale (whole words over prefixes, full names over
  partial ones, nearness, a stop ahead of a street at equal strength)
  instead of five stops always first. Rejected: fuzzy matching (edit
  distance) for now; the misses so far were normalisation, not typos.
- 2026-10-18 Maintainer: on the map, show only the lines relevant to the current
  search, and when he taps a ride and sees its course, only that line. The
  live layer now follows the view (the results' lines; nothing while a
  journey, line or followed trip draws its own vehicles), and a tap on a
  ride leg in the journey detail focuses it. Rejected: a manual filter
  switch on the map (one more control; the view already says what is
  relevant).
- 2026-10-18 Maintainer: "we have search both on top and below the map; only on
  top". The top bar is now the whole planner (destination field; origin
  row once a place is set; swap), and the sheet's plan screen keeps only
  the options, results and recent searches. Rejected: a single field with
  the origin as a chip inside it (too tight on a phone).
- 2026-10-18 Maintainer, same evening: "I meant the live dots too, no need for
  tons of irrelevant buses", and "why a 21:57 dot at 22:19?". With nothing
  searched the home map now shows only the lines of the stops within
  500 m of him (everything when he looks elsewhere), and a vehicle more
  than five minutes behind the feed's newest report is dropped. Rejected:
  an absolute age cutoff (the feed itself lags by 10 to 20 minutes, so it
  would blank the map).
- 2026-10-18 Maintainer: operators have their colours, Egged green, Metropoline
  orange; colour lines by operator. Done with one table of approximate
  brand colours (architecture.md lists them and their sources); light
  rail is red now so Kavim can be purple. Rejected: the feed's
  route_color (set for few routes, and the same FF9933 across operators).
- 2026-10-18 Maintainer: "why does the compilation take 9 minutes?" Every push
  recompiled seven days. The compiled days are now cached by the feed,
  the graphs and the compiler's source; app-only pushes deploy in about
  two minutes. Rejected: a separate app-only workflow (two deploy paths
  to keep consistent) and committing the compiled data (100 MB a day in
  git).
- 2026-10-18 Maintainer: the planner must not sit below the map at all ("stop
  reusing that element"). The options moved into the top bar as a third
  row of chips (when; bicycle) with their details in a card hanging off
  the bar; the sheet's plan screen is results and recent searches only.
- 2026-10-18 Maintainer: station dots need icons; the longest walk needs a finer
  setting. Stations (rail, light rail, bus stations) are badges with the
  mode's glyph, one per station; the walk is a stepper (minus, the
  number, plus; the number can be typed). A slider was tried first and
  rejected by the maintainer at once: an exact value among forty is not a slider's
  job on a phone.
- 2026-10-18 Maintainer: label the two rows (to / from), start clean and let
  back clear the fields, a clear Go button on top, and the clock reads
  "now" unless he sets a time. All four done; a plan is a history entry
  so back clears it.
- 2026-10-18 Maintainer: the bar should first ask "where do you want to go?" and
  open into the two rows on a tap; the language toggle belongs in
  settings. Done; the EN button is gone from the bar.
- 2026-10-18 Maintainer: the hamburger menu "opens kinda weirdly" (a floating
  dropdown with no motion, detached from the button). It is a side drawer
  now, over a dimmed map, closed by a tap outside, its ✕ or back. Found
  on the way: a pushState right after a programmatic history step back is
  swallowed by it; pushes now wait for that step to land.
- 2026-10-18 Maintainer: a button to align the compass, and the tilt with it.
  MapLibre's compass control does both; it is shown only while the map is
  rotated or tilted.
- 2026-10-18 Maintainer: picking on the map by moving the map under a crosshair
  is annoying; tap a spot, get a pin with a bubble and a confirm, tap
  elsewhere to keep looking. Done; a tap on a stop picks the stop itself.
- 2026-10-18 Maintainer: the train's course near HaShalom was a tangle. Cause: the
  rail router snapped each station to its single nearest track node, which
  on the four-track Ayalon corridor could only be reached past the station
  and back over a crossover. Now a station meets every nearby parallel
  track at the closest point and the search chooses the track; the gap from
  the station to the track counts double so it meets the track beside the
  station.
- 2026-10-18 Maintainer: modernise the settings and every icon. One hand-drawn
  stroke icon set as an SVG sprite replaces all emoji, including the
  station badges on the map (drawn from the same paths on canvas), and
  ordinary bus stops get a small badge close up; settings are grouped lists
  with switches and pill segments.
- 2026-10-18 Maintainer: the sheet was hard to pull up by its thin handle. It is
  now dragged from anywhere while collapsed or half open (the half size no
  longer scrolls; a pull opens it fully), the handle is taller.
- 2026-10-18 Maintainer: a user icon attached to the search bar instead of the
  floating hamburger. The round button sits inside the pill at its start
  edge and opens the same drawer, now headed by the avatar and "no account,
  everything stays on the phone". He also said the two-row to/from bar can
  stay as designed (he had asked for a single box earlier).
- 2026-10-18 Maintainer: once a plan is made the top bar should fold into one
  summary box over the to/from/time/bike rows (the folded card he had once
  told me to scrap was, he says, the one good thing in that batch; the rest
  deserved scrapping). Done, on top: a tap reopens the rows.
- 2026-10-18 Maintainer: stops on the plain map are hard to tap and not clearly
  stops, and the basemap shows its own squares for them. The basemap's
  transit symbols are hidden, our bus-stop badges start at zoom 15, station
  names sit under our badges, and a tap within 14 px of a stop opens it.
- 2026-10-18 Maintainer: "something like the plan-a-trip view for simply tapping
  where you want to go". A tap on the bare map (sheet collapsed) drops a pin
  with the place's name and "to here" (plans at once) / "from here" (opens
  the bar on the destination field).
- 2026-10-18 Maintainer asked whether suggestions should hang below all the boxes
  rather than under the field being typed in; he was unsure. Recommended and
  done: it never hides the other field and the list does not jump between
  rows; one CSS rule to undo.
- 2026-10-19 Maintainer: "why is everything reported 15 min ago and still on the
  map?" Measured: Hasadna's pipeline was 14-16 minutes behind the clock at
  08:00 (20 on the 18th); our queries take the newest rows, so the dots are
  the latest known positions. Decided: keep showing them (a delay seen
  fifteen minutes ago still beats the timetable) but never as if live: when
  the feed is four or more minutes behind, the dots fade, the note says
  "the source is behind" and the bubble gives the age. Rejected for now:
  hiding them (an empty map hides the lag too) and extrapolating positions
  along the route (guesswork drawn as fact). An own SIRI poller would need
  a Ministry key and a server, which the minimal-infrastructure rule
  reserves for when Hasadna proves unreliable; this is the first evidence.
- 2026-10-19 Maintainer: when the bar opens, the "from" row goes above the "to"
  row, and "from" starts filled with "my location". Done; the location is
  resolved when the plan is made, so an empty-handed open costs no GPS fix.
- 2026-10-19 Maintainer: dragging the sheet is still tough. Cause: the chip strip,
  which fills most of the collapsed sheet, was excluded from the drag to keep
  its sideways scroll, so only the thin handle grabbed. Now a start on the
  strip drags unless it moves sideways, a 40 px pull steps one size, and
  the fully open sheet is pulled down by its top 96 px as well as the handle.
- 2026-10-19 Maintainer: the green "leave in n min" on a result card should be
  green only when the line has a live location. Done: green when the first
  ride's vehicle reports (and is not stale), plain ink otherwise; the
  results header still says which time the live data is from.
- 2026-10-19 Maintainer: orange when the live location carries big uncertainty.
  Live colours now mean confidence everywhere (result cards, legs, stop
  departures, bubbles, the follow badge): green a report under four
  minutes old, orange an older one (still marked ?), plain the schedule.
  Lateness is the number alone; orange no longer means "3+ minutes late".
- 2026-10-19 Maintainer: with the sheet fully open and the list at its top, a
  scroll down should fold the sheet. Done with touch events (the pull is an
  overscroll the browser does nothing with); a swipe that starts scrolled
  down scrolls as before.
- 2026-10-19 Maintainer, on a train that had left before the list's "now": how
  to resurface the ride he is on, to start following it. Done: a plan from
  now looks ten minutes back, what left goes in an "already left, on
  board?" strip above the list with an "I'm on it" button, and a trip
  started after its first ride left begins on board (the follower used to
  wait up to 15 minutes at the walk to the stop). Considered for later: "I'm
  on this one" from a vehicle's bubble on the map, planning the rest of the
  way from that very vehicle.
- 2026-10-19 Maintainer: the strength of the pull should decide midway or all
  the way. A flick goes all the way; a slow pull steps or lands where let go.
- 2026-10-19 Maintainer: recents that keep the time of the search and "search
  backwards", because "my location" moves with him once he is on the
  vehicle. Chosen instead: the last search is restored as it was for an
  hour (own origin, own time, on-board strip applied), also from its recent
  chip; a fresh plan is "plan again from now". No backwards search needed.
- 2026-10-19 Maintainer: the locate and compass buttons go in a bottom corner.
  Bottom-right, above the sheet, hidden with the map under a full sheet.
- 2026-10-19 Maintainer: the +1/+6 on the buses of a journey's map were unclear.
  They are minutes late per vehicle; now only the vehicle running the
  rider's ride carries its number, the others show it in their bubble.
- 2026-10-19 Maintainer likes the tilt and rotation; "make it look 3D-like".
  Done with what MapLibre 4.7 gives for free: a sky and horizon haze when
  tilted, the pitch limit raised to 72°, a low side light that shades the
  extruded buildings. Not done: 3D terrain or hillshade (needs elevation
  tiles, e.g. AWS Terrain Tiles, a few MB per session; flat in Tel Aviv,
  worth it for Haifa and Jerusalem, the maintainer's call).
- 2026-10-19 bug from a friend on iPhone: "Can't find variable: when" on
  every plan. A leftover `void when` in the recent-searches renderer read a
  loop-scoped name; Safari threw it into the plan's error handler, which
  wiped the results. Removed; an eslint no-undef scan of every module is
  now part of the checks.
- 2026-10-19 Maintainer: "add to home screen" does not work on iPhone. iOS never
  fires the install prompt; the row now shows on iPhones with Safari's own
  steps. Pull-to-refresh did not work anywhere: the collapsed sheet now
  leaves a pull down to the browser, and the drawer has "reload the app".
  The 3D ask was about the compass button, not the map: a needle with depth
  in real perspective; the map's sky and light stay, they cost nothing.
- 2026-10-19 Maintainer asks about a future stack (TypeScript, React, strict
  lint) so such bugs cannot happen. Answer in the conversation and here:
  the bug class is "undeclared name", which eslint no-undef (now in CI) and
  TypeScript both catch; React would not have, and the no-framework,
  no-build-step rule stays. Path if wanted: TypeScript's checkJs with JSDoc
  first (no build step), then .ts with tsc in CI; measured today: checkJs
  with strict off reports 114 findings, 97 of them DOM typing.
- 2026-10-19 Maintainer: screens that need no map (settings, saved, the place
  chooser) should be whole-screen pages, not the sheet over a map. Done:
  the sheet becomes the page, with its own header.
- 2026-10-19 Maintainer: the half-open sheet could not be scrolled; his earlier
  ask had been misread. Now half and full both scroll, and only a pull past
  the top edge folds the sheet or past the bottom edge opens it.
- 2026-10-19 Maintainer: the live note "אין רכבים בשידור באזור הזה · רק קווי
  החיפוש" was broken Hebrew (two fragments glued). It is now a sentence per
  case, in both languages.
- 2026-10-19 Maintainer: map look should be light / dark / like the device, and
  the menus should have the same setting. Done; the old map value "auto"
  (light) reads as "device".
- 2026-10-19 Maintainer: pull-to-refresh still did not work. Cause: the sheet
  body's overscroll containment stopped the gesture from chaining to the
  page even when collapsed, and the handle said touch-action none. Lifted
  for the collapsed sheet; the pull up there moved to touch events.
- 2026-10-19 Maintainer: after the pull-to-refresh fix, pulling the sheet up got
  "stuckish and inconsistent". Cause: `pan-y` let Chrome claim the upward
  drag too (nothing scrolls, but the gesture is taken and touch events are
  throttled), and a tiny quick nudge counted as a flick. Now `pan-up`, which
  hands Chrome only the finger-down swipe, and a flick needs 30 px of travel.
- 2026-10-19 Maintainer: the "already left, on board?" rows on top of every plan
  were confusing; most of the time the rider wants the next departures.
  Now a fresh plan shows one quiet line that opens on a tap; a plan
  restored from earlier shows the rows at once (that is the rider who
  boarded and came back); the rows are calmer, four at most.
- 2026-10-19 Maintainer: the sheet is still stuckish and oversensitive for the
  full opening. The flick rule ("fast means all the way") was wrong for a
  phone, where every pull is fast: speed now steps one size, like
  Android's sheets, and only a long drag past the midpoint goes all the
  way; the dead zone at the start of a drag shrank from 8 px to 4.
- 2026-10-19 Maintainer: the sheet still sticks when the drag starts on the chip
  strip, and pulling down on the search box does not refresh. Cause of
  both: the browser claimed gestures (the strip is a horizontal scroller;
  its pull-to-refresh never fires on this fixed page). Decided: the app owns
  them. touch-action none on the bar's controls and the collapsed sheet; the
  strip scrolls by script; pull-to-refresh is the app's own circle on the
  bar and the collapsed sheet. Rejected: more touch-action tuning (three
  rounds spent).
- 2026-10-19 Maintainer: the bluish flash on tapped buttons (the browser's tap
  highlight) goes; feedback of our own instead: press-down, tint, ripple.
- 2026-10-19 Maintainer: the friend's "add to home screen" was Chrome on iPhone.
  Covered by the iPhone row (same user agent family), but the hint named
  Safari; it now names the browser in hand and where its share button is.
- 2026-10-19 Maintainer: the sheet's slide is not smooth, "how many hacks did we
  add?" Five gesture layers, but the stutter was the oldest piece: the sheet
  moved by animating its height, a layout on the main thread every frame.
  It now slides by a transform (composited); the gesture rules stay.
- 2026-10-19 Maintainer: "no way there are no buses around there right now"
  (Azrieli, 15:33, the map said no vehicles reporting). A real bug: a
  vehicle counted as fresh only within five minutes of the newest report
  seen anywhere, and Hasadna's lag is uneven by area (Tel Aviv's newest was
  20 minutes old, the country's 6), so a whole area fell off the map. Each
  set is now judged against its own newest report; the note still says how
  old the data is.
- 2026-10-19 Maintainer: "do they always lag so badly?" Measured on Hasadna's own
  snapshot log: the ETL of each minute's snapshot starts 10 to 25 minutes
  after it (median 15, p90 19) in every daytime hour today, the same
  yesterday and on 2026-10-15, and a quarter of today's minutes had not
  loaded at all by the afternoon. It is the cadence of their pipeline, not an
  incident, so a position on the map is a quarter of an hour old by design;
  the delay a bus reported then is still the best estimate we have. Fresher
  data means MOT's SIRI feed directly (a key and a relay), which stays the
  fallback plan.
- 2026-10-19 Maintainer: station names on the map are Hebrew while the app is in
  English. The feed's translations.txt has English and Arabic for most stop
  names, so the compiler carries English names (stops, stations, cities,
  headsigns) in the timetable header, the worker hands out names in the
  app's language, search matches Hebrew and English alike, and the basemap's
  own labels follow the setting too (one name per label instead of Latin plus
  Hebrew). Arabic waits for an Arabic interface; the data side is a flag.
  Rejected: a separate names file translated in the app at runtime (one more
  download and a map by stop id for no gain).
- 2026-10-19 Maintainer: "it doesn't find an existing address" (a street
  and house number typed in Latin letters) and the from/to boxes were "a mish
  mash" of English stop names and Hebrew addresses. The address book now
  carries OpenStreetMap's English names (85% of streets) and the feed's
  English city names, and a Latin-letter word also matches the consonant
  skeleton of a Hebrew name, so any spelling finds the street. Rejected:
  transliterating Hebrew names for display (unvocalised Hebrew gives
  "hvrdym"); a Hebrew name without an English one stays Hebrew.
- 2026-10-19 The headsign of line 62 showed in Hebrew in the English app:
  routes.txt spells a quote mark as '' where translations.txt has ", which
  hid 652 headsigns and 3,000 stop names from the lookup; one key for all
  three spellings lifts coverage from 92% to 99.6% of stops.
- 2026-10-19 Maintainer: tapping the search bar did not open the recents and "my
  location" list; it opened only from the From box. The list did open, and
  the tap that handed the box focus (the clear button, the Go button) closed
  it again as a tap outside it. A tap within half a second of the focus no
  longer closes it.
- 2026-10-19 Maintainer: with the keyboard open the list is taller than the
  visible screen, so scrolling it pans the page and the from/to boxes slide
  away. The list now ends above the keyboard (the visual viewport) and
  scrolls inside itself, without scroll chaining to the page.
- 2026-10-19 Maintainer: "maybe it's time we remove" the chips in the collapsed
  sheet (plan, home, work, recents, nearby). Agreed: the search pill and its
  list offer the same, nearby stays in the drawer. The collapsed sheet is
  now a handle, plus one line about the highlighted way when there are
  results. The strip's sideways-scroll gesture code went with it.
- 2026-10-19 Maintainer: show the alternative ways on the map, as road-planning
  apps do, with a per-route toggle in the list. Built the Google Maps model
  plus his toggle: the first three ways drawn together, one highlighted in
  colour, the others grey with a minutes pill; a tap on a grey route or pill
  highlights it; a card's map button shows, highlights or hides its way.
  Rejected: a highlight-only tap on the card (a card tap opens the detail,
  as before) and drawing every way (clutter; the toggles add more).
- 2026-10-19 Maintainer: the top search "more pill-like"? Yes: the field, the
  summary box, the chips and the Go button are full pills now.
- 2026-10-19 Maintainer: a small x inside each text box to clear the text while
  searching. Added to every search box (to, from, the place chooser): shown
  while the box has text and focus, it clears the text, keeps the keyboard
  and brings the recents list back. The round X beside the To box still
  clears the whole plan.
- 2026-10-19 Maintainer: the search pill jumps down when the From row opens above
  it, and the X and swap placement "is weird". The pill (and the summary
  box) now sit one row lower at rest, so opening the From row above them
  moves nothing; while editing, a back arrow starts the From row and the
  swap sits at the end, centred between the two rows, as in Google Maps.
  Back returns to the summary when a plan is shown, else to the plain pill;
  clearing a plan is the summary's X.
- 2026-10-19 Maintainer: the collapsed sheet sits too low for Android's swipe-up
  gesture strip; the collapsed height gains 16 px (plus the bottom inset of
  an installed app) so the handle clears it. Filling the collapsed sheet
  with content: "maybe not needed", left as the one line.
- 2026-10-19 Maintainer could not find the line search and the nearby stops.
  Both exist (a number typed in the search box lists lines; "stops near me"
  is in the menu), so the menu gets a "search a line by number" entry that
  opens the box with a numeric keyboard, and the nearby screen now opens as
  a half sheet with the map showing the rider's position, a ring out to the
  farthest listed stop and the stops highlighted. The lines near the rider
  are the live layer's "lines near me" already.
- 2026-10-19 Maintainer: sorting and filtering of results ("single-stop"). Chips
  over the list: Direct, Train, and a sort that cycles by departure,
  arrival, fastest, fewest changes; remembered across plans. Rejected: a
  filter panel (the chips are one tap each).
- 2026-10-19 Maintainer: trip tracking "a little messed up", with a screenshot at
  00:51 of a plan for "Tonight 08:00" whose Start said the trip was over.
  After midnight the planner stays on the night's service day, so a morning
  time landed on the past morning; a time from 03:00 on typed at night now
  moves the day to the coming one. Start is disabled, with the reason, when
  the trip is over, instead of a toast after the tap. The ride line read
  "1 · דן stops" in English: a bidi artefact of a Hebrew operator name in an
  English sentence; operators now show English names (a table in the app)
  isolated with <bdi>, and "1 stop" is singular.
- 2026-10-19 Maintainer: home and work need a choose-on-map option. The chooser
  had it as a chip under the box; it is now also a row in the list that
  opens with the box, like the To box's own.
- 2026-10-20 Maintainer: the municipal weekend (Shabbat) buses are missing.
  Verified: the MOT feed (and so Hasadna's mirror) carries only
  state-licensed operators; "Naim BeSofash" (Tel Aviv-led, 12 authorities,
  18 lines 705-729, free) and Ramat Gan's "Sababus" are absent, their
  numbers collide with real MOT lines, and MOT's own displays cannot show
  them (https://busofash.co.il/?post_type=qa). No SIRI for them either.
  What exists openly: Tel Aviv's GIS layers behind the official map, lines
  (https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/992)
  and stops with MOT stop codes (.../993), and the line pages with stop
  lists; no timetable, no frequencies anywhere public (the site says
  "varying frequency", Fri 16:30-02:00, Sat 09:00-17:30). HopOn and Moovit
  get a private schedule. Not built yet: a frequency-based estimate would
  mean inventing headways; the maintainer decides between asking the municipality or
  HopOn for the schedule file, estimated headways labelled as such, or
  showing the lines on the map without times.
- 2026-10-20 Maintainer: lowering the search pill at rest was "a bad design
  proposition"; what he wanted is the installed app's look of map apps,
  the map continuing under the phone's status bar instead of a coloured app
  bar, while the website keeps the pill at the top. Reverted the lowering
  (the From row now slides in above the pill instead); the status bar takes
  the map's ground colour (theme-color follows the map setting, light
  #f8f4f0 or dark #141210) and on iPhone it is translucent over the map.
- 2026-10-20 Maintainer: the options panel (clock, bike, "plan trip" next to Go)
  is "a weird old relic". Rethought: the two chips each open a small
  popover, when (depart or arrive, the days as pills, now or a time) and
  bicycle (none, to the stop, take it along; folding appears when a bike is
  chosen). Changes apply to the chip at once; a tap elsewhere closes the
  popover and, when a plan is showing, re-plans it. The "plan trip" button
  is gone: Go is the one button. Rejected: a full options sheet (too much
  for two choices).
- 2026-10-20 Maintainer, on third thought: the lowered pill is nice, it was the
  coloured top in the installed app that annoyed him; with the status bar
  now continuing the map, the pill stays a row lower at rest. The pill
  carries the app's logo at its end beside the user button at its start,
  ahead of accounts. Entering search mode animates: the origin row slides
  in above, the options row under, back and swap pop in, the pill narrows
  smoothly; the summary box and the suggestion list slide in too.
- 2026-10-20 Maintainer: a better colour palette for the roads and such, light and
  dark. Liberty's own colours (yellow motorways, saturated water, green
  parks) fight the transit lines drawn over them. Both modes are now
  Liberty with every colour replaced from a palette by role and road class
  (mapstyle.js replaces darkmap.js): light is warm off-white land, white
  streets with soft grey casings, pale sand motorways and muted water, the
  Positron and Transit-app family; dark is cool near-black land, roads as
  lighter greys in a clear hierarchy, deep blue-black water. Alphas and
  zoom fades are kept. Rejected: OpenFreeMap's Positron as is (no POIs, no
  3D buildings) and the old HSL remap (one formula cannot give motorways
  and side streets their own places).
- 2026-10-20 Maintainer: the app icon at the start of the pill and the user at
  its end; a tap on the icon starts a search like the rest of the pill, a
  tap on the user opens the menu. Done.
- 2026-10-20 Maintainer: the map palette should carry the app's turquoise rather
  than yellow. Motorways, water, parks, casings and labels now take a tint
  of the brand colour (#12998b) in both modes; land, streets and buildings
  stay neutral so the transit lines keep the strongest colour on the map.
- 2026-10-20 Maintainer, installed app: "the map doesn't continue all the way to
  the top". On Android it cannot: Chrome keeps the status bar as a strip of
  one colour and no web app draws under it (only display "fullscreen"
  removes it, taking the clock with it). The strip now takes the exact
  ground colour of the current palette, so it continues the map's ground;
  on iPhone the status bar is translucent and the map runs under it.
- 2026-10-20 Maintainer: the neutral palette "is not bad" either. Both stay: a
  "map colours" setting, turquoise (default) or neutral, each light and
  dark, so he can compare on the phone.
- 2026-10-20 Maintainer, two screen recordings: a reload "is jumpy as hell" and
  the search-mode animations "not smooth enough, mega sleek, a bit slower
  is fine". Reload: the map now starts at the camera it was last left at
  (remembered on every move) instead of a wide default view, the locate
  control eases to the rider in half a second instead of flying through
  blank tiles, the status bar and the map's ground colour are set by an
  inline script before the first paint, and the shell paints once the icons
  exist, in one fade. Search mode: 0.4 s eases with a soft curve, staggered
  (origin row, options row, then the side buttons grow in), and the same
  motion out, which the old version skipped; reduced-motion settings turn
  it all off.
- 2026-10-20 Maintainer, on the reload again: "something from the side gets
  drawn and removed very jumpily". That was the menu drawer: the page
  starts right-to-left, English flips the direction a moment later, and
  the drawer's transform animated from the right edge to the left edge
  across the screen. The language and direction are now set before the
  first paint, and the drawer has no transition until the app has booted.
- 2026-10-20 Maintainer: both option chips glowed when one popover opened (only
  the open one now); bus stops on the map are small and some seem missing
  (the dots and badges are a third larger, badges never yield to labels; a
  stop without service that day is still left off, by design).
- 2026-10-20 Maintainer: "we lost the ability to clear an active search": the
  user button, moved to the pill's end, covered the summary box's clear X.
  In the summary the user sits at the start and the X at the end. And the
  search-mode motion "still not as smooth as I imagine": the pills changed
  width when the side buttons appeared, a layout animation the browser
  cannot keep smooth while the keyboard rises. The pills now keep their
  width: the back arrow sits inside the origin pill, the swap floats over
  the pills' end between the rows, and only transforms and opacity animate.
- 2026-10-20 Maintainer: the user button hid the summary's X ("the person icon can
  disappear for that"): gone from the summary box. Search mode is now a
  sequence: the pill shortens, the origin row slides in, the time chip, the
  bike chip and Go grow in one after another, then the recents list unfolds;
  the keyboard is held for a third of a second so it never rises during the
  layout change; leaving plays it back in reverse. The day pills wrap onto
  two rows so every day shows (half seemed "blocked" off the edge of a
  scroller); a calendar was considered and rejected for seven days of data.
- 2026-10-20 Maintainer: "let's do the Preact refactor, as modular and readable
  as possible". The no-framework, no-build-step rule is retired: a build
  costs nothing here and the UI's mishaps came from state scattered over
  the DOM. Preact (React's API at 4 KB) with signals, TypeScript strict,
  Vite. Step one, same day: the unchanged app builds through Vite (src/,
  dist/, the service worker written with the hashed file names, the data
  paths absolute since the worker now lives under assets/), the workflow
  runs `npm run check` and `npm run build`; the old harnesses moved to
  tools/. The components follow feature by feature, the app staying live.
  Rejected: React itself (same API, ten times the size), Svelte or Solid
  (a different model for no gain here), a big-bang rewrite.
- 2026-10-20: The top bar is the first Preact feature: its state (places,
  when, bicycle, open parts) lives in signals in `state/search.ts`, the
  legacy app reads and sets those instead of the DOM, and what the bar needs
  from the planner goes through one `hooks` object, so each later feature
  can take over a hook without touching the others. The place chooser's
  search box stays on the legacy code until the pages move. One digit in
  line mode searches at once (a whole line number).
- 2026-10-20: The results are the second Preact feature. The list is derived
  (a computed over the result, the filters, the language), not rebuilt by
  hand, so a filter, a language switch or a map toggle never re-renders the
  wrong thing; the countdowns read one clock signal instead of a timer that
  rewrites the DOM. A swap of From and To no longer plans by itself (Go does).
- 2026-10-20: The journey detail and the follow screen are components; the
  follow controller stays in app.js for now and publishes the trip into
  signals after each step, so the screen is a pure view of the state machine
  (follow.js) and the controller moves later without touching it.
- 2026-10-20: The map is a module of its own (`src/map/`), typed against
  MapLibre's own types (a dev dependency for the types only; the script
  still comes from the CDN). The highlighted way is drawn bolder (a wider
  casing and ride) since the maintainer found the operator colour too faint; the other
  ways stay grey by design. With the pages, the navigation and the shell as
  components, `index.html` is roots only and `app.js` keeps the loading, the
  planning and the page controllers until those move too.
- 2026-10-20: The move is finished: `app.js` is gone. What it still did
  (loading, planning, each page's live polling, follow mode, alerts,
  language, install) is `src/controllers/`, one typed module each, started
  by `src/boot.ts`; every UI module is type-checked. Two things fell out on
  the way: a stale copy of the plan screen's map drawing that overrode the
  map module's own (its minute badges were never cleared when another panel
  took the map), and a 20-second timer and a translation loop that had
  nothing left to update.
- 2026-10-20: From the maintainer's test of an arrive-by-19:00 trip (Rehovot to Tzavta):
  arrive-by now ranks only the journeys that arrive in time; ranked with the
  rest, a later journey with fewer changes arriving a few minutes past the
  deadline knocked out one in time and was then dropped itself, so the latest
  workable departures went missing. The back arrow in search mode ends the
  search like the summary's X (maintainer: leaving the boxes should clear it); a
  tap on the map still folds the rows back to the summary. Departure and
  arrival times read left to right with the arrow between them in both
  languages (maintainer: early time on the left). The sort chip opens a small menu
  instead of cycling. The logo in the search pill is drawn from the theme's
  colours, so it follows light and dark (the home-screen icon stays fixed:
  the system draws it).
- 2026-10-20: The address book takes everyday places too (the maintainer could not find
  the restaurant האחים: it is in OpenStreetMap, but the pipeline kept only
  landmarks). Added: food and drink, hotels, hostels and guest houses, any
  named shop or office, pharmacies, banks, post offices, schools,
  kindergartens, places of worship, galleries, gyms, pools, bike and car
  rental: 16k places become 49k, 2.1 to 2.9 MB gzipped. They rank level with
  streets (landmarks keep their lead), checked over twenty searches: street,
  address and landmark answers are unchanged. Left out: fuel, parking,
  playgrounds and the like (rarely named, rarely a destination by transit).
- 2026-10-20: Trains are never hidden behind buses (the maintainer's arrive-by-19:00 trip
  from Rehovot: the 17:34 and 17:56 trains were missing; only the 17:24 came
  through). The router keeps, per departure, only the earliest arrival, and
  ranking dropped a journey when another left later and arrived earlier or
  saved a change: a bus 277 a minute faster hid each later train. Now every
  plan also runs a train-only search, and journeys with a train and without
  one are ranked apart. Measured over 70 random morning trips: 10.2 to 10.5
  journeys on average, 6 trips gain a train option, planning time unchanged
  (about 135 ms in Node). Rejected: lowering the transfer penalty (it would
  not bring back the direct train, which a faster bus beats outright).
- 2026-10-20: From the maintainer's notes: a tap on the map no longer drops a pin that
  flashed and vanished (the bubble's pointer marks the spot; names arriving
  late fill the open bubble instead of reopening it); the bubble's pointer
  colours only its facing side (two coloured sides drew a white square when
  it pointed sideways); "My location" is a value, not text: shown as a tag,
  emptied to the placeholder when the box is tapped, back when left
  untouched; the From placeholder asks like the To one; the suggestion list
  folds away instead of vanishing. Following a trip: Back beside Next step,
  both held from the clock (a step chosen by hand moves on by position only),
  and the screen restyled to the current design (round hide button, one-line
  title, End trip pill, the instruction in a card). Tested in
  tools/follow.test.mjs, which `npm run check` now runs.
- 2026-10-20: From the maintainer's notes: the time choice is Now / Depart at / Arrive
  by; the last two show three scroll wheels (day, hour, minute) in one row,
  like an alarm clock, replacing the day pills and the time field. The chip
  stays short ("By 19:30", the day only when not today). Changing the day no
  longer resets a chosen time to the default.
- 2026-10-20: From the maintainer's screenshot (a walk drawn straight through the
  buildings): the street graph had failed to download on 5G and nothing
  retried, so the walk stayed the straight-line fallback. Background files
  now retry (5, 20, 60 s and on reconnect) and walks drawn straight follow
  the streets once the graph arrives. Walks also join the streets at the
  segment in front of the point, several candidates within 150 m with
  off-street metres counted three times, instead of the nearest
  intersection (50 m away in his case, which drew a diagonal and a
  backtrack). Over random Gush Dan pairs: 42% of walks over a minute
  shorter, 2.5% longer (all off-road); access times unchanged at the
  median. Rejected: nearest segment only (a dead-end path next to the point
  gave hour-long detours). The service worker now drops older builds of a
  data file instead of keeping every night's copy.
- 2026-10-21: From the maintainer's notes: leaving search mode no longer flashes the
  rows away for a frame before they play out (the play-out now starts in the
  same moment); the user button is a three-line menu button and the drawer
  is headed by the logo; the drawer closes with a swipe towards its edge;
  settings is a page sliding in over everything and out again, leaving the
  drawer open under it. Saved stays a screen in the sheet for now: its
  place chooser and map picker live in the sheet and would open under a
  layer. Also: with only "my location" set, closing a panel leaves the sheet
  folded instead of half open and empty.
- 2026-10-21: From the maintainer: the menu button takes the old user button's look
  (a turquoise disc), now with three lines, and moves to the start of the
  pill with the logo at its end; its press is the disc giving and the lines
  drawing together, springing back on release, instead of the "bump down"
  (which was the press shrink replacing the centring transform; every
  centred button in the bar had it).
- 2026-10-21: From the maintainer's screenshot: "from → to" lines (recent searches,
  saved trips, a ride's summary) isolate each name (`ui/FromTo`, `<bdi>`), so
  a Hebrew name in English or an English one in Hebrew no longer reorders
  the line, and the arrow points the way the interface reads (it pointed
  backwards in Hebrew on the ride summary); a recent search too long for its
  card ends in an ellipsis instead of running past it. Names stay in the
  language they were picked in.
- 2026-10-21: From the maintainer's screenshot: a trip started from its detail showed
  no route on the map. The panel swap redrew the map before the follow
  drawing existed, and the drawing's own redraw then saw the same panel and
  skipped; now it forces the draw. Also "5 stop" is "5 stops" (and the
  detail's ride line isolates its names like the rest).
- 2026-10-21: Live data comes through a relay of our own (the maintainer agreed): a
  Cloudflare Worker passing Hasadna's newest raw SIRI snapshot through with
  CORS, because their database runs 15 minutes behind at rush hour while
  the raw files are a minute old. The browser unpacks the brotli file and
  the data worker answers every live question from it; Hasadna's API stays
  the fallback. Trains with no GPS are placed at the station they report;
  frozen positions (moving speed, same fix for 2 minutes: over a third of
  trains with GPS) are dropped. Rejected: asking for line or area queries
  differently (the database itself is behind); parsing in the relay (the
  free plan allows 10 ms of CPU per request). Hasadna could add the CORS
  header to their files; then the relay can go.
- 2026-10-21: From the maintainer: entering search mode, the menu button and the logo
  pop out (the chips' effect) before the pill shortens, and the "to" tag pops
  in where the menu was; the rest of the sequence moves 0.16 s later (the
  keyboard too). Leaving, the pill grows back while the rows play out (the
  rule meant for that never applied: the shortened padding stayed until the
  play-out ended) and the icons pop back in once it is whole.
- 2026-10-21: From the maintainer ("only full English or only full Hebrew"): stored
  places (recent searches, saved places and trips, the bar, shared text)
  are named in the interface's language when shown (`state/names.ts`): a
  stop by its code in the timetable, an address-book place by its exact
  position, the entry there whose Hebrew or English name is the stored one
  (several share a point: a building's numbers, a venue and its address; a
  house number the map lacks keeps its number on the same street), a point
  picked on the map by naming that point again the same way. Names
  OpenStreetMap has in one language only stay in it (צוותא). Also: a line
  page draws the line in its operator's colour and names the operator in
  the interface's language.
- 2026-10-21: From the maintainer (13 minutes' walk planned while standing on the
  Rehovot platform; from there the walk is 0-30 s): "my location" no longer
  falls back to a position up to 10 minutes old when GPS fails (inside a
  station, often); it tries a coarse network fix first and then accepts the
  last position only under 2 minutes old. And choosing the same destination
  again reuses the last search from "my location" only while the rider is
  still within 150 m of where it started and it is under 10 minutes old.
- 2026-10-21: A new build that arrives while a trip is followed now goes in
  once the trip is over (it waited for the next cold start), and coming back
  to the front checks for a new build (the maintainer's phone kept the old one, live
  times 15 minutes behind, after the relay went live).
- 2026-10-21: Maintainer still saw live data 15 minutes old. Found: the data worker
  refused every question until the day's timetable was in, so the map's
  first live request at start went to Hasadna's database; live queries and
  place names no longer wait for it. And the map's note now says when live
  data came from the database and why the relay was not used, so a failing
  relay on a phone shows instead of hiding behind the fallback.
- 2026-10-21: On the maintainer's phone the relay always failed with "signal is aborted":
  the 12 s limit covered the whole read, and at start-up the read competes
  with the data downloads and waits behind their unpacking in the same
  worker. Now 15 s for the relay to start answering and a minute for the
  body, and the first load fetches only the current snapshot (the one of 3
  minutes before follows in the background for frozen positions). The
  relay is not blocked: a phone gets 188 KB (brotli) or 255 KB (gzip).
- 2026-10-21: the maintainer's mobile carrier answers NXDOMAIN for
  wayli-relay.wayli.workers.dev (Google's and Cloudflare's DNS resolve it),
  so the relay also gets our own address, relay.waynet.app (waynet.app's DNS
  moving to Cloudflare, the relay attached as a custom domain). The app tries
  relay.waynet.app, then workers.dev, then Hasadna's database, and accepts
  an address only when it answers with a snapshot (x-snapshot header).
- 2026-10-21: From the maintainer, four fixes. (1) Android's back no longer plays
  Chrome's "previous page" slide: where the browser has CloseWatcher (Chrome
  on Android), each panel gets one instead of a history entry; elsewhere,
  history as before. (2) The sheet no longer jitters entering and leaving
  search mode: its box is now the whole screen and only its slide moves (it
  was as tall as the space under the bar, so the bar growing shrank it at
  once while the slide eased after). (3) The locate and compass buttons take
  the app's look: round surface buttons, the app's locate icon in turquoise
  (a turquoise disc while following), a turquoise and grey needle. (4) After
  picking a destination the boxes stay open (the time or bike can change and
  plan again); they fold on a map tap, a result opened, a sheet drag, X or
  back.
- 2026-10-22: From the maintainer: the locate button only ever shows where you are (a tap
  while following re-centres; MapLibre's control turned location off on that
  tap; turning location off is the phone's permission). And a hidden settings
  row no longer draws as an empty row (the rows' own display overrode the
  hidden attribute: the install hint, empty, under "The app").
- 2026-10-22: From the maintainer: the drawer also swipes shut from the dimmed map
  beside it, and the settings page swipes shut the way it came in. "Add to
  home screen" shows whenever the app runs in the browser, not only when
  Chrome offers its prompt (it held the prompt back on his phone, and the
  row had only shown before through the empty-row bug); without the prompt
  a tap explains the browser menu's way.
- 2026-10-22: From the maintainer (the time didn't apply; "Tonight / Today / Tomorrow"
  confused): Go after setting a time planned "from now" (it took the path of a
  freshly picked destination); now Go and the popover plan with the time set.
  The time popover gets a Done button and works on a draft, set on any close.
  The day wheel shows calendar days only; the night after midnight is the
  previous service day at 24:00+, internal ("25:30"). Rejected: keeping
  "Tonight" as a separate day (it is the GTFS service day leaking out).
- 2026-10-22: From the maintainer (no live vehicles on the map for a friend's search,
  on mobile data): the live note says "loading" until the first answer
  instead of nothing, a slow answer still shows unless a newer one already
  has (overlapping requests discarded every answer on a slow connection),
  and a finished trip leaves the resume bar on return to the app and within
  a minute (it was checked only at start, so an app open overnight kept it).
- 2026-10-22: The Ministry's GTFS server did not answer GitHub's runners for a
  morning and the deploy failed, app change and all. The build keeps the last
  feed that downloaded (Actions cache, one a day) and builds with it, with a
  warning, when the download fails.
- 2026-10-22: From the maintainer ("trains don't move at the same speed between
  stations; fit an expected ride time per section from recent data"): train
  delays from learned section times (pipeline/railtimes.py, nightly, last 7
  days of Hasadna's positions): running time and its spread along each
  section, late trains' stands, and a learned 20 s made up per station.
  Held-out day, arrivals within a minute: next station 86% vs 46%, two ahead
  57% vs 32%, five ahead 37% vs 29%. Rejected: using the Ministry's
  per-station SIRI predictions (a key and a fixed-IP server) for now, and
  the railway's own API (Israel Railways threatened Better Rail with a
  lawsuit over it, 2026-09).
- 2026-10-22: Maintainer asked whether trains reuse old positions: they take the
  next trip's number early (18% of train fixes; 94% standing at the first
  station). The maintainer: the rest look like a train finishing one trip and going on
  as the next, handle it smartly. Measured: about a tenth do (another trip
  goes quiet close by), a quarter are one train reporting two numbers at
  once, the rest empty runs. The worker hands a fix back to the trip it
  continues when time, place, path, progress and delay all agree and only
  one trip fits (no wrong handover in two days replayed), and drops the
  rest. Rejected: handing back to the trip ending at the next one's first
  station (a quarter fitted, at an hour's delay), and taking the closest
  delay when several fit (two wrong in a day).
- 2026-10-22: Maintainer saw no buses on his map while friends did. The live site
  showed them from his area with and without the relay; an empty map with no
  word was possible only with live times off or the phone offline, and now
  the note says which.
- 2026-10-22: the maintainer's map lost its buses while friends elsewhere saw theirs:
  a vehicle with a wrong clock (reports stamped up to two days ahead; 13 of
  8,915 in one snapshot) became its area's "newest report", so every true
  report there looked over five minutes old and was hidden. Reports stamped
  over 2 minutes after the snapshot are dropped, and the newest report
  skips a lone one far ahead of the rest.
- 2026-10-22: the maintainer's phone showed a blank page while the site loaded fine
  elsewhere. MapLibre now comes bundled with the app instead of from cdnjs (a
  network that cannot reach the CDN, or a cleared cache, left the page blank;
  and one less third party), and a safety net in index.html says when the
  app has not started after 12 s, shows the error, and offers "try again" and
  "clear stored files and reload" (service worker and caches; history and
  saved places stay).
- 2026-10-22: From the maintainer on the HaHagana platform: the 19:30 to Moshe Dayan,
  running at 19:37, was missing; late, it arrived after the 19:45 express,
  so the router dropped it as beaten. A direct way's card now also lists the
  earlier departures between the same two stops that arrive later (up to
  two, reachable, at most 30 minutes later), marked with their arrival: the
  train at the platform is never hidden.
- 2026-10-22: From the maintainer ("19:34 vs 19:38 next to each other?"): the trip
  detail showed the planned departure (the delay when planning) in bold and
  the live check's time in the badge. Now the newest live look sets the bold
  time and the badge says only how late (and "?" when the report is old).
- 2026-10-22: Confirmed with the maintainer: his phone's DNS on mobile data answered
  "no such name" for wayli-relay.wayli.workers.dev (a filter blocking
  *.workers.dev); switching Android's Private DNS to dns.google fixed it.
  Riders behind the same filter fall back to Hasadna's database (minutes
  behind); relay.waynet.app remains the fix for them, waiting on the maintainer.
- 2026-10-22: From the maintainer on the 173: "get off at the next stop" came a stop
  early. The follower took the nearest stop as reached, often the one ahead,
  and also alerted within 350 m of the alighting stop whatever stood between.
  Now the rider is placed on the stretch between two stops (the stop at its
  start is reached, the one at its end once within 60 m), and the alert comes
  once the stop before the last is passed. On board, the live badge gives the
  time at the alighting stop, not "passed" for the boarding one.
- 2026-10-22: From the maintainer: a notification that stays, with the stops left and
  when to get off. While following, a silent notification (one tag, updated
  in place, gone at the end) says the step: walking, waiting ("leaves X at
  21:48"), riding ("3 stops left · get off at Y ~22:13"), with "as of" the
  last update. A web page gets no position with the phone locked and is
  paused in the background, so the line leads with clock times that stay
  true when it stops updating. Uses the trip alerts' permission and switch.
- 2026-10-22: From the maintainer: the locate button went grey after a tap, and the
  position dot should be turquoise. Bundling MapLibre had put its styles
  after ours; on a phone a tap leaves :hover on the button, and MapLibre's
  hover grey then won the tie over the following button's turquoise. The
  app's styles load after MapLibre's again (imported in main.ts), and the
  position dot, its halo and its accuracy circle are the app's turquoise.
- 2026-10-22: From the maintainer: a compass fan on the position dot. A turquoise cone
  turned by the phone's compass (absolute orientation on Android; on an
  iPhone after permission asked from the locate button's tap) and the map's
  rotation, smoothed, hidden when no reading came for two seconds or the
  position is stale. Its own element in the dot (the dot's ::after is its
  ring). The heading never leaves the phone.
- 2026-10-22: From the maintainer and a friend's screenshot: (1) "walk 15 min, then walk
  2 min" to a train against a 15-minute setting. The router counted only the
  walk to the first stop; a footpath chained after it (or before the egress)
  came on top. Now the whole walk at either end is within the setting, the
  access walk's last 30 s to the stop included, and walks in a row show as
  one. On 40 random trips in Tel Aviv: before, 92 of 605 journeys walked over
  15 minutes at an end (up to 22) and 77 showed two walks in a row; after,
  none. (2) "Why not change at Rabin Square?" Between the same two vehicles
  the router kept the first place to change it found; the planner now picks,
  of all the places that work, one with 2 minutes or more to spare, then the
  least walking, then the most time to spare (the 56 to Rabin Square and a
  2-minute walk with 9 minutes for the 61, not Arlosoroff, 3 minutes' walk
  with 2 to spare). (3) A card's map button only puts its way on the map or
  takes it off; the highlighted way changes only when it is the one taken
  off or none is highlighted.
- 2026-10-22: From the maintainer: a friend raised her longest walk from 15 to 30
  minutes and the same search came back as before. Searching the same place
  again within the hour shows the saved result; it now does so only when it
  was planned by this build and with the same longest walk, and the same
  holds for the result shown at start.
- 2026-10-22: Maintainer: remove "the same search again shows the saved result":
  live times change in between, one can never know. Removed; every search
  plans afresh. At start the last search (six hours) opens again with its
  places and options and is planned afresh too, from now if it was from now
  and from where the rider is if it was from "my location"; its old results
  are never shown. Rejected: keeping the reuse with tighter conditions.
- 2026-10-23 Maintainer: build the search by line, styled by kind of vehicle. Built
  as a Trip / Line switch above the bar's rows (shown while editing, hidden
  at rest), the line search keeping the To box with chips for the kind of
  line; lines grouped by the feed's line code (makat) rather than one row
  per direction, the nearest first. Trains, which have no numbers, are
  their two end stations. Rejected: a separate line-search page (the top
  asks, the bottom answers), city pairs as the grouping (a line from Holon
  to Tel Aviv split in two).
- 2026-10-23 Maintainer: a search by stop, and for trains it should work differently:
  riders of trains care about where they can get from here and when, not
  lines; choose a station, then a destination, and get the times. Built as
  the third search type: bus and light rail stops open their departures by
  line; a station lists the stations reachable without a change, and a
  chosen one the direct trains between the two with live times. Rejected:
  a second box in the bar for the destination station (the station's page
  already holds the list, and the bar stays one box for line and stop).
- 2026-10-23 Maintainer, on the first version: a "to station" box in the sheet breaks
  the layout (the top asks, the bottom answers), and the reason for from/to is
  that many riders plan their own trips from the train schedule. Changed: the
  train chip gives the bar two station boxes and a swap; the sheet only lists
  answers (where trains from the From station go, then the trains between the
  two). The To box lists only stations reachable without a change.
- 2026-10-23 Maintainer: build the three stages of live traffic estimation. Built
  and measured before switching on: learned bus section times by hour and
  kind of day from Hasadna's minute snapshots (nightly, passage logs kept 14
  days); a live correction from the buses that just ran a section; traffic
  on the map from the same. Every delay estimate moved into the data worker
  (one owner for the learned and live times). Rejected: commercial traffic
  feeds (terms, cost, the map area sent out), Waze (agencies only), Hasadna's
  database for the live part (15 minutes behind made it worse than none),
  the bus's own recent pace (measured, no gain), night free flow as the map's
  baseline (every road read slow at 10:00).
- 2026-10-23 Maintainer: the nightly download of Hasadna's minute files needs no
  separate ask; it is the same public data the relay already passes on all
  day. Rejected: having the relay keep the snapshots itself (it would need
  storage and still fetch the same files).
- 2026-10-23 Maintainer: animate switching between the search types, without an
  if-else per transition. Built as one layout-animation helper (FLIP,
  `src/widgets/flip.ts`) keyed on what the bar searches for, and a sliding
  highlight in the switch. Also: the kind-of-line chips scroll with a finger
  (the bar's buttons had touch gestures off).
- 2026-10-23 Maintainer: a tap on the time chip while it says "now" should open on
  "depart at". Done: it opens on depart at the time now, wheels showing;
  closed without a change it stays "now" (no frozen minute).
- 2026-10-23 Maintainer: the line search should not be numbers only, and the
  keyboard should stay up when switching. Done: the full keyboard, a number
  plus words for where the line runs, words alone for the lines there
  (Hebrew spelling with or without the extra yod or vav matches); the switch
  and chips no longer take the focus. Rejected: switching keyboards by kind.
- 2026-10-23 Maintainer: add the weekend buses (Na'im BeSofash; the grassroots
  "Sababus" shuttles have no data anywhere). Built from Tel Aviv's GIS
  (routes, stops) with estimated times from the official hours and a 20
  minute frequency, labelled as estimates wherever they show. Rejected: no
  weekend lines until a timetable is published (riders use them every
  weekend, and an honest estimate beats nothing); scraping an app.
- 2026-10-23 Maintainer: a line's stops should be visible from further out. Now
  from zoom 9, solid in the line's colour while far out, white with a ring of
  it up close (a journey's stops stay from zoom 12). And the compass cone he
  asked for did not show on his phone: it hid after 2 s without a reading,
  and a still phone may send none; it now keeps the last direction for half
  a minute and also takes an absolute plain orientation event.
- 2026-10-24: From the maintainer's notes. The search boxes offered saved passwords
  (Chrome guesses at logins and ignores autocomplete="off"): they are
  search boxes now. The line and stop searches fold to a pill of their own
  instead of falling back to the trip search; back returns to it (his
  choice). History by search kind, plus what was opened (trips, lines,
  stops, stations, station pairs), kept by feed ids since the timetable's
  numbers change daily; a trip reopens as it was only while the same build
  is loaded (otherwise its indices may point elsewhere), else re-plans.
  The map note folds into an info button. "No stops on the map": a build
  after midnight compiled the night's day from a feed that already started
  the next day (75 KB instead of 3.9 MB); such days are left out of the
  site. The follow screen's own dot also gets the compass cone.
- 2026-10-24: Maintainer saw a "?" vehicle on HaTayasim on Saturday: shared taxi
  line 16 (Odelia, route ids 28099/28100), five cars reporting while the
  feed gives the line no Saturday trips. Timetables now carry the names of
  the feed's other lines; such a vehicle is named, its bubble says the line
  is not in today's official timetable. And no compass cone on his iPhone:
  the first tap on the map asks for the compass too, where the browser asks.
  (His phone is a Pixel, not an iPhone: Settings' new compass line said
  "started no". Chrome there has the permission request too, which the code
  took for "an iPhone": it waited for a tap and then listened for the
  iPhone's readings only. Now every kind of reading is listened to from the
  start and the permission, where there is one, is asked from a tap.)
- 2026-10-24: the maintainer's back rule: the keyboard closes first, then the open
  list, and only then the usual stack. Built as one close watcher for the
  bar that undoes a piece and is made again (measured in Chrome: watchers
  made from one tap are grouped, so a watcher per piece closed two at once;
  rejected). Android only; elsewhere back stays history. Switching search
  kinds keeps the keyboard and the list as they were (his ask). The list's
  jitter on a switch was the rows' glide: a fixed element inside a
  transformed one is placed against that one, so the list jumped, slid and
  snapped back; the lists now hang from the bar itself.
- 2026-10-24: Results, from the maintainer: the open sheet showed the highlighted
  way's line above the list that holds it too; the line is now the
  collapsed sheet's only. A way tapped on the map scrolls the list to its
  card. Mine: opening the sheet (a tap or a drag) lands on the highlighted
  card, and highlighting no longer refits the map (it zoomed back out on a
  rider who had zoomed in to tap a route). His question on line 710 at
  17:49 on Saturday: Na'im BeSofash runs until 17:30 on Saturdays
  (busofash.co.il), then read as the last trip ending by then. He then saw
  Bus Nearby list a 710 near 18:00 by Derech HaShalom, 25 minutes into the
  route: the hours are now read as first and last departures, and 710 runs
  every 30 minutes (Time Out; every 20 gave a last bus there at 17:42, 30
  gives 17:52). The app no longer says "every 20 minutes" for every line.
- 2026-10-24: Around the rider the live map hid every vehicle not on a line
  serving a stop within 500 m; the maintainer saw vehicles vanish as he zoomed in on
  himself (right after Shabbat none of his lines ran yet, and the note that
  said so is folded now). They are shown faded instead, his lines in front.
- 2026-10-24: From the maintainer: a stop's page shows on the map only what it is
  about (the principle): the vehicles of the lines calling there and their
  courses, faint; it showed every vehicle around. Results sort by arrival
  first, each plan starting so (the order is the plan's, no longer a kept
  setting); the sort chip no longer turns coloured when another order is
  chosen. Comparing ways, each ride carries its line's chip on the map (in
  its colours on the highlighted way, grey on the others). The faint whole
  lines before and after a ride were there but too faint on the dark map
  (0.3); now 0.45. "My location to my location" is no recent search.
- 2026-10-24: One view per stop (maintainer: "merge all to a single page"). A
  stop tapped on the map opens in the sheet directly, no bubble first (the
  bubble's lines, from here and to here are in the view); the station view
  (where its trains go) is folded into it under the departures, across all
  the station's platforms, so a station is a stop like any other; the train
  timetable's From station opens it too. Vehicles keep their bubbles.
- 2026-10-24: Built the agreed "one place decides the map" (deck slide 6,
  agreed 2026-10-23; the maintainer: go, with the centring). `map/view.ts` is the
  decision as a pure table, tested in Node (`tools/mapview.test.mjs`);
  `map/render.ts` carries it out for every panel; the six panels no longer
  draw the map, and the camera has one owner, aiming between the bar and
  the sheet (the locate button too: it centred behind a half-open sheet).
  The camera fits a thing once: highlights, live updates and courses
  arriving no longer refit it. docs/principles.md starts with this rule.
- 2026-10-24: Maintainer: Route 4 and half of Route 1 had no traffic colour. A bus
  was placed on the straight line between its two stops, and on a highway
  section (stops kilometres apart) the road curves away from it: positions
  over 120 m off were dropped. Buses are now placed on the pattern's course.
  And a section needed two buses in 15 minutes; on highways each line has
  its own pair of stops, so a long section (2 km or more) now takes one bus
  seen along it three times. Replaying Thursday 08:00-08:20 (Oct 22) through
  the worker: road coloured 3,146 km before, 3,868 with the course alone,
  5,304 with both; long sections 130 to 369; the city unchanged.
- 2026-10-24: Maintainer: Route 4 and half of Route 1 lacked the map's turquoise
  (he meant the basemap, not traffic). OpenStreetMap tags those stretches
  trunk, which Liberty draws in one layer with primary roads, white; trunk
  now takes the motorway's colours, by class, primary keeps its own.
- 2026-10-24: Maintainer: the basemap's "Palestinian Territories" country label
  must go; Wayli is an app for riders in Israel and the label would put
  people off using it. Left out of the country and state label layers by
  its code (PS) and its English and Hebrew names; the rest of the map,
  borders included, is as OpenStreetMap draws it.
- 2026-10-24: Maintainer saw two bus-stop badges with no stop circles in Neve
  Sha'anan: OpenStreetMap's own bus stops from the basemap's points of
  interest (poi_r1/r7), at stops the feed still lists (codes 4002, 26967)
  but no line serves today. The basemap's bus and rail points are no longer
  drawn: the map's stops are the feed's, served that day.
- 2026-10-25: Maintainer: a line should show the day's times, and how long it
  takes from and to each stop relative to a stop of his choice; a ride in a
  trip, the times its line comes to his stop; and a stop tapped on the map
  while looking at a search should not swap the sheet for the stop. The
  line page became a timetable anchored at "your stop" (where it was opened
  from, else the nearest) with each stop's time and minutes from it; a ride
  lists its line's departures from the boarding stop with the arrival where
  he gets off; a stop tap shows a bubble while the sheet holds a search,
  journey, line or trains, and opens the stop view only at rest. Rejected:
  a full stops-by-trips grid (unreadable on a phone at 40 stops by 50 trips)
  and relative times from the line's first stop (not where anyone stands).
- 2026-10-25: Maintainer: with the map tilted and the buildings in 3D, the ground
  should have its heights too, as a setting off by default; no contour
  lines (redundant). Terrain from AWS's open Terrain Tiles (free, no key,
  the same kind of static tiles as the basemap; attribution in the map's
  credits), exaggerated 1.5 times, with a light hill shading, only while
  the map is tilted past 10°. Rejected: MapTiler's terrain (needs a key and
  an account), a hillshade on the flat map (changes the 2D look nobody
  asked to change), and contour lines.
- 2026-10-25: Maintainer: time to count elevation in walking and cycling times.
  Street edges carry metres up and down from AWS's open Terrain Tiles
  (pipeline/elevation.py, Pillow to read the PNGs, HPND licence), smoothed
  and counted with a hysteresis; cost on foot from Tobler (3 s per metre
  up), by bike a climb rate of about 500 m an hour and faster descents.
  Measured on four builds (raw heights; 3 m hysteresis; smoothing 1 and 2
  pixels): raw heights added up to a quarter to flat Tel Aviv bike rides
  (radar noise and buildings), smoothing over about 150 m removed most of
  it and kept the hills. Rejected: a flat 5 s per metre for bikes (counted
  the climb's distance twice on gentle grades), heights per intersection
  only (missed hills between them), a paid elevation API.
- 2026-10-25: Maintainer: the train search starts at From (a station picked in
  To while From is empty becomes From); the light rail gets the same
  station-to-station search (its two direction stops are one station);
  a setting picks the stop search's opening chip (friends who use it for
  trains); one look control for the whole app with a switch to set the map
  and menus apart.
- 2026-10-25: Maintainer: a tap on another stop in the stop view acted oddly
  (the sheet changed, the map kept the old stop: a panel opened again was
  not redrawn), and a departure opened an old, redundant view (the trip's
  stop list, no map). Re-opening a panel now redraws the map; the trip
  page is gone: a departure, a train row and a vehicle open the line at
  that stop with that trip chosen.
- 2026-10-25: Maintainer: the 3D heights are slow and clunky on his phone; the
  look must stay. MapLibre upgraded 4.7 to 6.15 (BSD-3), whose changelog
  from 5.x on is largely terrain work: shared render-to-texture
  framebuffers, pooled drape textures freed at rest, cheaper DEM lookups,
  hillshade artifacts on mobile GPUs fixed, the camera no longer jumping or
  sliding when terrain switches on mid-gesture. With it: height tiles to
  zoom 12 instead of 14 (the data is 30 m anyway) and the height source made
  with the style rather than at the first tilt. The 6.x breaking changes
  touched us in two places: ESM only (no default export; its worker is a
  file of its own, bundled as an asset and named to it) and GeoJSON types
  no longer global (`@types/geojson`, MIT). Speed could not be measured
  here (the headless browser renders on the CPU; 1-3 frames a sweep either
  way), so the maintainer judges on the phone. Rejected: another map library (the
  whole map, its style and every layer are MapLibre's: a rewrite, and a
  different look), a lower pixel density while tilted (changes the look),
  hiding the 3D buildings while tilted (same).
- 2026-10-25: Maintainer: tapping a stop on a line's page was jittery, and the
  timetable should expand. The times shown now stay (dimmed) until the new
  stop's arrive, instead of the box collapsing to "loading" and every row's
  time blinking; the timetable shows a few hours and opens to the whole day
  at a tap. The jitter he meant was more likely the search list itself: on
  a stop or line picked there, the sheet slid and the map eased while the
  bar stayed tall, then dropped 32 px (and the pill 11 px) half a second
  later when its rows were removed. Now the rows that go fold during the
  play-out and the kind row holds the pill's resting height, so the bar
  shrinks with the sheet and nothing moves at the end (measured frame by
  frame in headless Chromium). The maintainer also asked for a thorough cleanup of code nobody uses:
  removed the old trip page (earlier today), the feasibility harness
  (`tools/feasibility.html`, `browser_bench.mjs`, `build_artifact.py`),
  four dead functions, 13 strings and 7 style rules nothing read, and 44
  exports nothing imported (now module-private). Found with a scan of
  every export, `t()` key, class name and worker op against its uses, plus
  `tsc --noUnusedLocals`; dynamic keys (`t('sort' + …)`, `m-${mode}`) were
  checked by hand before anything went.
- 2026-10-25: Maintainer: a train shown 6 minutes late at Hashalom came on time;
  what does the algorithm actually do? Replayed on the raw minute files the
  relay passed him: at 09:08 the train sent no GPS, only "call: Herzliya",
  which the app read as standing at Herzliya then and leaving late; the call
  names a station until the train nears the next, and it had left Herzliya
  on time at 09:04. Fixed: a train without GPS reached the named station when
  the call first named it, and is only known not to be at the next one yet.
  Backtested (`tools/trainbacktest.mjs`, every train every minute 07:30-10:30
  on two mornings) the catch-up per station (h) made predictions early and
  was dropped (rejected: keeping it, or tuning it to 10 s, on two mornings'
  evidence; learning per section how late trains recover is the real fix).
  A train's shown time at a station is now when it pulls in, and its delay
  is against the arrival, not after its stand. Typical miss on the two
  mornings 2.6 -> 2.1 and 1.9 -> 1.9 minutes; the timetable alone 3.1 and 1.6.
- 2026-10-25: Maintainer: the timetable should expand (he had not found the "All
  day" button: it was under the box, below the half-open sheet's edge). The
  toggle is now a chip above the box, in sight whenever the times are.
- 2026-10-25: Maintainer: the timetable comes closed by default (it stayed open
  across stops and lines once opened: the component outlived them). The
  locate button moves the map to the rider without changing the zoom; a
  second tap, on the rider already, sets a fixed zoom (15). Following the
  rider moves the map the same way, its zoom left alone.
- 2026-10-25: Maintainer asked to organise the sheet's history: (searches, viewed,
  saved) by (trips, stops, lines). Three tabs, trips, lines and stops,
  following the bar's kind; in each, saved then recent. Not nine lists: for
  lines and stops a search and a view are the same act (a pick opens it),
  so only trips keep two histories (searches, ways opened). Lines can now be
  saved too (a star on the line page, kept by the feed's route id).
- 2026-10-25: A ride in a journey lists every direct ride between its two stops (any line or train, by departure, live for the next ones), replacing the one line's times there: the maintainer's journeys often have several lines or trains that would do, and he wants a station's view for just his stops. Live matching is one module for this and the trains between two stations.
- 2026-10-25: The drawer gets a second level (maintainer): trips Opened · Searched · Saved, lines and stops Recent · Saved, Opened first since it is usually what is wanted again. A saved item is no longer hidden from the recent lists, as they are separate now.
- 2026-10-25: The line and stop searches show recent ones above "near you" while empty (maintainer), filtered by the chips; in the train timetable, recent stations and station pairs in the From box. Platforms and light rail stops are recorded as stations so they come back as such.
- 2026-10-25: The trains between two stations are drawn on the map (maintainer): the next train's course and stations, other routes faint, only those trains live; the same for light rail. Their bar folds to a trip-like summary (To; From · Train), X back to the trip pill.
- 2026-10-25: A focused box keeps its text unselected with the caret at the end (maintainer), replacing select-all on focus.
- 2026-10-25: Trains are shown by their train number (maintainer: as on the station boards), from GTFS `route_desc`, which equals SIRI's VehicleRef for every train checked (76 of 76 in a snapshot); the compiler puts it in the route's short name. A train *line* (every train between two stations) is still "train".
- 2026-10-25: Back on Android folds an open trip search (keyboard, list, search); every panel gets an X closing all panels besides Back (maintainer).
- 2026-10-25: The Nearby screen ("stops near me") is removed (the maintainer asked; agreed): the stop search's empty list is the stops around you with their lines and distance. The menu separates the three searches from the pages with a line.
- 2026-10-25: How many recent items to keep is a setting (5/10/20/40 of each kind; default 10). Pay links to HopOn (Rav-Pass), the Ministry-licensed payment app, through its store page: opening an app straight from a web page is unreliable across phones.
- 2026-10-25: Not built yet, to discuss: separate pages for ride and search history (the drawer's second level may already cover it).
- 2026-10-25: Code layout reorganized (maintainer: 15 loose files in src, ui vs features unclear): src/ keeps only the entry files; engine/ (logic with no screen: raptor, streets, places, live, follow), worker/ (the data worker and its client), lib/ (i18n, time, store); features/ renamed views/ (parts of the screen) and ui/ renamed widgets/ (pieces shared by views); the relay moved from worker/ to relay/, so worker/ means one thing. A README in every folder (src/README.md the overview, with what may import what).
- 2026-10-25: Planning with live data fixed (maintainer: "something's very wrong"; a plan had him leave at 21:28 for a train shown at 21:26). The router boarded a train at its departure after the learned stand (2:53 at Rehovot) while the screen showed its arrival since the morning's change: trains are now boarded when they pull in. Trips kept in order now bring the earlier one forward instead of pushing the later one back (which also had the rider walk up after the bus shown). Buses seen before their trip begins or further along than possible since its start (loop terminals) wait at their first stop, on time, instead of reading up to 15 minutes early (73 + 62 buses in a 21:38 snapshot); a bus's older report from its previous trip (570 of 4,798 vehicles) and reports an hour past a trip's end are dropped. Snapshot of 3,932 vehicles: >10 min early 199 to 107, >30 min late 147 to 128; train backtest 2026-10-25 07:30-10:30 2.1 to 1.9 min typical. Not reverted: the train algorithm itself measured better than the one before it.
- 2026-10-25: Design before code (maintainer): every change beyond a small tweak starts with the algorithm or design explained in natural language, with diagrams where they help, naming what it touches and who depends on it; the code is then written to match and treated as an app for the next programmer. CLAUDE.md rule 7 rewritten.
- 2026-10-25: Israel Railways' mark beside every train number (maintainer): traced from the CC BY-SA 3.0 "Flag of Israel Railways.svg" by Meronim on Wikimedia Commons (the logo itself has no free license; the maintainer chose the flag's remix right). The path stays CC BY-SA 3.0, credited in its file, the README and the app's About. One widget (`widgets/RailLogo`: `LineName`, `lineNameHtml`) now fills every line chip, Preact and map HTML alike, instead of eight hand-built copies.
- 2026-10-25: Clean up on the way (maintainer): repeated implementations met while working are replaced by one shared component in the same change (CLAUDE.md rule 9). First case: every line chip is now `widgets/LineChip` (and `lineChipHtml` for the map's bubbles); the six hand-built chips, `chipStyle` and the `.chip.t2`/`.t0` colours are gone. The map's line badges stay markers of their own, sharing the chip's inside.
- 2026-10-25: The data worker (1,357 lines in one file) is split by kind of question into data, names, search, plan, stops, lines, trips, courses, vehicles and traffic, with worker.js the message loop over their ops; split with the TypeScript checker resolving every name, bodies unchanged. Only data.js assigns what is loaded; derived indexes register their reset (onNewDay, onNewLang), which fixed four that were never reset: the light rail stations on a new day or language, and traffic's course sections and bus tracks on a new day.
- 2026-10-25: engine/live.js split by concern: clock.js (Israel time, service days; nowOn alone had 24 callers reading as live.nowOn), feed.js (the live vehicles: relay or Hasadna, matching a vehicle to its trip), delays.js (where a vehicle is, trains' and buses' learned times, the delay, live times). The two HH:MM formatters of a moment (map/popups clock, used by three controllers, and one in Results) are one lib/time timeOf.
- 2026-10-25: Strings: one entry per key with Hebrew and English side by side, grouped by the screen using it (was two dictionaries, several keys per line, up to 3,236 characters); 9 unused keys out, 12 duplicate keys merged into their twins (the menu's and the drawer's 'Saved', the chips' and the line label's 'Train', 'towards {headsign}' twice...). The third Date-to-HH:MM formatter (map/live.ts) is timeOf too.
- 2026-10-25: styles.css (759 long lines) regrouped into `src/styles/`, one file per part of the screen (base, widgets, topbar, shell, results, detail, follow, stops, menu, map) imported in that order. Checked rule by rule in the browser for every pair of equal-weight rules whose order changed, and on 25 screens in both languages and themes (identical to the pixel). On the way: 6 rules that never applied or repeated another out (among them `.follow .legs`, always overridden by `.detail .legs`), the three `.field input[type=search]` rules merged into one, and the settings' compass line kept at 12 px by its own rule instead of by rule order.
- 2026-10-25: The pipeline's shared pieces get two modules: `pipeline/container.py` (the data files' container, written by compile, streets, places, rail and shapes and read by five scripts, each with its own copy) and `pipeline/common.py` (the log line, nine copies; GTFS reading and stop_times, four; Israel's UTC offset, two; haversine, four). Every output rebuilt and compared: identical but for the build time. The timetable cache key and the learners' workflow triggers include the two files. bustimes.bin.gz keeps its own layout (fixed tables, no section list), which the app reads as is.
- 2026-10-26: Train delays shown only when sure (maintainer: they correct themselves, and a train was shown early). Two changes, backtested on three mornings' raw minute files. The model: a train standing at a station leaves after its learned stand from when it pulled in (the worker keeps each train's trail of fixes), not at the listed time, which is about when it pulls in; train 959 standing 4 minutes at Tel Aviv Center read a minute later every minute, and Hashalom first 3 minutes early (within a minute 10 minutes ahead: 57-59% to 65-68%). What is shown: the listed time plus the lateness we are 85% sure of (the prediction less a margin by how far ahead, 20 to 140 s), whole minutes from 2 up, never early, nothing beyond 30 minutes ahead; a delay is shown on 6-13% of predictions instead of 70%, and on a train that came on time in under 1% instead of about 20%. One function (`liveAt`) gives every train time on screen and in the planner, so a trip, a stop, the trains between two stations and the line page (which now shows the chosen trip's live times) agree. `est.delay` is what is shown; `est.late` the best estimate (the handover check uses it). Rejected: the point estimate clamped to never early (more false lates than before), a margin without the 30-minute horizon (predictions 30+ minutes out of 9-12 minutes late were mostly made up).
- 2026-10-26 (later): Shown train times never run backwards along a trip. Taken station by station, the 30-minute horizon showed a train an hour late (that morning's disruption: 236 at +72, 406 at +62) late at the stations within half an hour and on time beyond them; a plan boarded it late and left it "on time" before it had boarded (maintainer: a trip shown 10:19 → 10:17). Now each station's shown lateness is at least the station before's less what the train can make up between the two at three quarters of its predicted run (delays.js railShown); an hour-late train stays about an hour late. Backtested: on time shown late in about 1% (was under 1%), 19-22% of real 3+ minute delays shown.
- 2026-10-26 (afternoon): Live times written down end to end before more fixes (maintainer: write the whole algorithm in text and diagrams first). `docs/architecture.md`, "Live times, end to end": the pipeline, what each live number means, seven rules, and every reader. Writing it found three places that read a number as something it is not, now fixed: the card's and the detail's "+N" used the train's lateness at its next station instead of at the stop boarded (leg `live.delay` is now `depart − schedDepart`, rule 7); follow added the delay on top of planned times that already carried it, so a late ride moved the arrival twice and started a re-plan on old news (it now uses the shift, the fresh `liveAt` time less the planned time at the same stop, rule 6). The planner moves buses through `liveAt` too, so a plan and the screens show the same time for every vehicle (rule 1); before, buses kept a separate arrival and departure the screens never showed.
- 2026-10-26 (afternoon): Options whose leave time has passed are no longer cards saying "leave now" (maintainer: mark them red, with a button for what you might make if you hurry). Each way is on time (now ≤ its leave time, a card), hurry (the time left before the first ride still covers the walk to it at 0.6 of the planned time: a fast walk or a jog, an estimate), or gone (with the rides that just left). The hurry ways are one red line above the cards that opens to rows with the leave time and how late you are, and Start trip. Rejected: keeping them as red cards among the others (the list would lead with ways most riders cannot take); a brisk walk at 0.8 (one minute of hurry for a five-minute walk, too narrow to be of use). The "just left" and "hurry" lines share one component.
- 2026-10-28: Back and Close move from each panel's bar to the sheet's handle row, with an expand/contract toggle beside them (maintainer: they had to be found by scrolling, on iPhones with no back button worst; and a full-expand button). The handle row is above the scrolling body and was already there, so nothing is lost from the half sheet; the panels' bars keep title, chip, badge and star. Rejected: a sticky bar per panel (keeps 44 px of the half sheet busy), a floating close button over the list (covers content).
- 2026-10-28: A trip's other rides overflowed sideways on a friend's iPhone (maintainer). Cause: the rides' table was rendered inside the leg's text column of a three-column grid; a grid column's floor is its content, and the row's times and "in N min" cannot shrink, so on a narrow viewport or with large system text the grid grew past the sheet and the body, which scrolled on both axes, scrolled sideways (Android with smaller text wrapped the chip instead, the odd first row). Fixed three ways: the table is a row of its own under the leg, the whole width (maintainer: not tabbed out after the dot); the text column may shrink (minmax(0, 1fr)); the sheet body scrolls vertically only. Every fold (Show stops, Hide times, the just-left and hurry lines, All day, more rides) is now one widget, `Fold`, with a chevron that turns (maintainer: no cue for expanding); four hand-built ones gone.
- 2026-10-28: The line page's timetable reads as a printed one: the hour, then its minutes separated by commas, the past ones grey, the next in colour, the chosen one filled; each minute is still a button (maintainer: chips were not intuitive for Israelis). It starts folded and folds again for another line.
- 2026-10-29: Following shows the ride and the changes (maintainer: more on the ride, like its stops; and a connecting bus might be late). The current ride's row opens into its stops at their shown times (liveAt, the same as everywhere), the passed ones dimmed, the next marked, the one to get off at bold. Every remaining ride's vehicle is polled (at most three, every 30 s), each row showing its live departure at the boarding stop; a pure function (engine/follow.js connections) gives each change's margin from the ride before's live arrival plus the walk between against the next ride's live departure, shown green, amber under 2 minutes, red when missed; a missed change is a reason to re-plan, so the faster-way card offers the next ride that works.
- 2026-10-29: A stop's departures, a station's trains and a ride's other rides are listed in the order of the time each shows, live where a vehicle is seen, planned otherwise (maintainer: "wtf is this sorted by", a stop list in planned order with a line 48 minutes late on top). One helper, lib/time.ts byShownTime, in the three views.
- 2026-10-29 (later): Reversed the same day (maintainer: keep the scheduled order, show both times). A list that re-sorts with every live poll jumps under the finger, and a bus is known by its scheduled time; so a stop's departures, a station's trains and a ride's other rides stay in planned order, and each row shows the planned time struck beside the live one when they differ by a minute or more, as the trip detail already did. One widget, ShownTime, in those three and on the line page, which had its own copy.
- 2026-10-29: A stop's page showed its lines as straight rays across the city (maintainer: "this recurring bug where the lines don't follow the streets"). Not a data bug: the server's and the phone's files match, and every pattern on the live files has its course. It was the window before `shapes.bin.gz` (3.5 MB) arrived, which boot fetched only after the 12 MB street graph, during which the map drew the stop-to-stop fallback as if it were the course; and that window opened on every deploy, since the day's timetable was cached under the site's build time and downloaded again whenever the app changed. Three fixes: the courses load with the address book, before the street graph; a straight line between stops is never drawn as a route (the worker says whether a path is a course; a ride without one is dashed, a stop's or a ride's faint whole lines wait for theirs; the redraw when the courses arrive puts both right); the day's file is cached under its compile time. Rejected: bundling the courses into the day file (3.5 MB more per day, downloaded daily instead of when the feed changes).
- 2026-10-29 (later): Data files are cached by content, not by build time (maintainer: cache what rarely changes, if a version or hash can tell whether a download is needed). The service worker already kept every data file under its version from the manifest, but the version was the build time, and the nightly build rewrites the courses every day (the compiled files' Actions cache key carries the date), so every phone downloaded 3.5 MB of courses daily whether or not they had changed. Now `pipeline/container.py` writes a content hash into each container's header (header without the build time, plus the arrays; two builds from the same feed give the same hash), the manifest carries it, and the app keys the cache on it, falling back to the build time for files without one (the learned bus and train times, which change nightly anyway). Rejected: hashing the gzip bytes (the header's build time makes every rebuild differ); ETags from GitHub Pages (the fetch still happens; the service worker answers from its cache without one).
- 2026-10-29 (evening): Three from one screenshot (maintainer). (1) "By arrival" listed 19:31 above 19:28: the cards were ordered by each group's first option, which a plan from now (it looks ten minutes back) had already filed under "just left"; now the cards are ordered by the option each shows, while the map numbers still follow the group's first option, so they do not change as departures pass. (2) The 60 got off a block early for a 3-minute walk when one more stop was 80 m from the door and arrived six seconds later: the router chose the stop by arrival alone (the 60 reaches the next stop 51 s later and the walk from it is 32 s shorter); now the earliest arrival at the door still decides, but among the stops within a minute of it the one with the least walking is taken (engine/raptor.js extract, EGRESS_GRAIN): once aboard, staying on costs nothing, and getting off early to arrive seconds sooner is a walk for nothing. The journey's arrival stays the real one. Rejected: the ranking's walk weight (half a minute per minute walked) for this choice too, which still got off early here by 3 s; a minute is the schedule's own grain. (3) "+19 min" under "leave in 2 min" ("doesn't help me with anything in life"): the lateness was against a planned time the card never shows. The card now says when the first ride reaches its stop ("60 at the stop in 14 min", live-marked when its vehicle was seen), beside the countdown to leaving; the delay figure stays where the planned time is shown too (the detail's rows, the map bubbles).
- 2026-10-29 (night): The boarding pin sat 43 m from the stop the walk led to (maintainer: "dot doesn't appear where the stop is"). The compiler placed each stop on the first course segment within a flat 60 m, and before a sharp turn the clamped end of the segment before counted: 13% of all pattern stops (26,680 of 198,198) sat 50 to 60 m off the segment they are on. Now the first segment ahead within 15 m of the nearest (the stop's own placing error), which keeps a loop's stop on its first pass; and the map's pins sit at the stops themselves, where the walks end, not at the course's ends. Measured on one compiled day (2026-10-20, 191k pattern stops): the gap between a stop and its point on the course went from a median of 7 m and a 90th percentile of 53 m to 5 m and 9 m; stops more than 30 m off from 59,028 to 122. The 17 over 100 m remain: stops the feed places off the road.
- 2026-10-29 (night): The big data files are downloaded in pieces that survive a short session (the maintainer's screenshot: the street graph at 9.1 of 11.1 MB again, a walk drawn straight meanwhile, "lines are not curved enough"). A download only reached the service worker's cache once it finished, so a rider who opens the app for half a minute never got the 11 MB street graph and every open started over. Now the data worker fetches a file whose size the manifest gives in 1 MB range requests, keeps each piece in its own cache as it arrives, and on the next open fetches only the missing ones; a whole copy cached before is cut into pieces instead of downloaded again; the service worker lets range requests through and keeps itself alive until a whole-file copy is stored. Measured in a browser: a page closed after 5 pieces, the next open fetched the other 8 and nothing else of those files, the third open fetched only the manifest. Rejected: the Background Fetch API (Chrome only, not Safari); splitting the files in the pipeline (ranges need no new files). The 62's course itself sits on the road: within 6 m of the feed's raw course, and 90% of it within 6 m of an OpenStreetMap street (max 10 m).
- 2026-10-30: Friday evening, Holon to Givatayim, Wayli found nothing and offered "an hour later"; Moovit showed Saturday evening's buses (maintainer: "why don't we find all these lines?"). Two things. The weekend lines (Na'im BeSofash) were missing from that day's build: the merge read a file's header from its first 4096 bytes, the cut fell inside a Hebrew letter in that day's feed, the step died and the build went on without them (its warning went unread). The header is now read from the decoded text. And "try an hour later" is a dead end on Shabbat: when the window is empty the worker searches once from its end, and the list says when the next way leaves with a button that plans from then, or that nothing more runs that day (on a Friday, that transport resumes after Shabbat) with a button for the next day the data has. Rejected: loading the next day's timetable to name its first ride (a second 3 MB file for a sentence; the next-day button gets there in two taps).
- 2026-10-30 (night): The weekend lines' hours per line from the operator (the maintainer at Kenyoter, Ness Ziona: the 716 listed every 20 minutes from 19:50, "the times are completely wrong"). One flat guess (Friday 16:30 to 02:00, every 20 minutes) stood for all 18 lines; Noa Tanua's page for each line gives its hours and headway per day, and they differ by up to six times (716 and 711 every two hours, 713, 715, 721 to 723 hourly, 714 and 729 every 45 minutes, 706, 707, 709, 710, 717 every 30, 705, 708, 718 every 20). `pipeline/weekend.py` now reads each page (3 s apart, since the site answers a burst with HTTP 429; the hours kept in the cache when a page fails; the general hours as the last fallback) and lets the return direction leave after the outbound's run, as one bus shuttling would (with a two-hour headway, 18:00 against 17:00). The 716 at Kenyoter on a Friday now reads 17:00, 19:00, 21:00, 23:00, 01:00. Still estimates, labelled so: no departure times are published and the speed is estimated. Rejected: Moovit's timetable for these lines (derived data, no licence to copy); the busofash.co.il hours (one window for the whole service).
- 2026-10-30 (night): Where the weekend buses' live positions are (maintainer: "must be a solution somewhere, not the official SIRI"). Found: the city's shuttle tender 280/2023 (technical annex §3.1–3.2) obliges each bus to carry a fleet tracker and a dedicated phone that broadcasts its position in real time "to the municipality and to the riders", with a Moovit device among the equipment whose faults are logged; the municipality names Bus Nearby, Rav-Pass and Moovit as the apps carrying the service. Not found anywhere open: no GTFS-RT, no open-data set, nothing in the national SIRI (Hasadna's archive: no vehicle on the 716's route on Saturday 2026-10-24), Bus Nearby's API behind Cloudflare Turnstile with no terms for reuse (rejected: scraping it). Decision: ask the municipality's transport authority and Noa Tanua for the feed developers get (precedent: the routes were sent to app developers in 2019); meanwhile the estimates stay labelled; plan B, riders' own positions while following a weekend trip, opt-in and anonymous, which fits the crowd-reports design.
- 2026-10-30 (night): A walk that begins the moment the leg before ends (the walk at a change, the walk from the last stop) shows no time of its own on the trip's rows (maintainer: "what is this 21:48 appearing twice?"): the time belongs to the stop and already stands as the ride's arrival on the row above. The first walk keeps its time, which is when to leave. Rejected: dropping the rides' arrival times instead (the arrival is what a rider checks a ride by).
- 2026-10-30 (later): Reversed within the hour (maintainer): the walk after a ride keeps its time, and the ride's second time now says what it is, "to 21:48", smaller under the boarding time, so the two numbers read as a span and the walk's start as its own event. Rejected: an arrow glyph between the times (direction-laden in a two-direction layout; words are shorter).
- 2026-10-31: The code is formatted by Prettier at 120 columns (one commit with no change of logic; `npm run check` starts with the format check), and nested ternaries are an error: the 109 of them became if-chains, small named helpers, or tables. Unified on the way (rule 9): one `liveClass` for the live/unsure class five views built by hand; one `InCell` for the "in N min" cell of the stop page, the trains between two stations and a ride's other rides, which now all count down whenever a live time is known and put the mark before the text (the stop page had the mark after, the other two counted down only for a list made now); `vehicleIcon` and `modeIcon` for the train/tram/bus icon four places chose by hand; `reverseName` for what a map point is called, which the bubble and the picker each had. Rejected: a one-level allowance for nested ternaries (the readable cases are chains, which Prettier already lays out; the rest were the problem).
- 2026-10-31: The worker's 35 operations are one typed table (`src/worker/ops.ts`: arguments and answer per name); the page's `call` is generic over it, the ad hoc generics and most `any` at the call sites are gone, and the worker's dispatch is type-checked and declares the table by name (its JavaScript answers are declared, not verified, until those modules move to TypeScript). A leg is now `RideLeg | WalkLeg` with `isRide` and `ridesOf`, so a ride's line, trip, boarding and alighting positions are required where they are read and absent on a walk, instead of one record of optional fields with an escape hatch (the 25 October departure-for-arrival slip was of that kind); the map draws from its own `DrawLeg` view, which a journey's legs and the line page's made-up rides both fit. Rejected: `Leg` with every field optional plus runtime guards (the compiler should carry this, not the code).
- 2026-10-31: Tests run under Vitest (`npm test`, part of `npm run check`), which resolves the app's own TypeScript, so the state modules are testable too. New: the router's rules on a tiny timetable written in the real container and read with the real parser (`tools/tinytt.mjs`): the alighting rule of 2026-10-29 in both directions, the five-minute transfer rule, and that an empty window still answers with the first ride after it; the result list's order against its map numbers; and the compiler's stop-on-course rule (`pipeline/test_projection.py`, the sharp turn and the loop), run by the workflow after numpy is installed. Rule from here: every rule that broke gets a test with its fix.
- 2026-10-31: The views call the controllers directly (`import { endTrip } from '../../controllers/follow'`) instead of through `hooks` objects on the state modules: 74 of the 88 hook entries were a view reaching a controller through state, one indirection with nothing to decide, and they are gone (with `state/saved`, which held nothing else). The 14 that remain are what a state flow itself must set off in a controller (planning when a place is picked, a panel's history entry, the sheet and the map after results), since state cannot import a controller without a cycle; `nav`, `sheet`, `position`, `names` and the map keep theirs for the same reason. Rejected: hooks everywhere for the symmetry (two places to read for every tap); an event bus (the same indirection, less typed). Engine files move to TypeScript as they are touched, imported with their `.ts` extension (`allowImportingTsExtensions`; Vite transpiles `.ts` for the page and the worker, Node 22.18+ strips the types for `tools/`): first `engine/modes.ts`, whose `Mode` is now the one word for a line's kind (the chip's `LineMode` was a copy).
- 2026-10-31: A panel asked for while it already sits under other panels comes to the front: the panels over it close first (`nav.showOverlay`). Found by the refactor's smoke test: on a line's page, the stop's details, then a line chip there changed the line page underneath while the stop page stayed on top, so the tap seemed to do nothing.
- 2026-10-31: The whole app is TypeScript: the engine (raptor, streets, places, feed, delays, follow and their shared pieces), the data worker (every module and the message loop) and the tools; only the service-worker template stays JavaScript, since the build reads it as text. What the files read and make are named types (Timetable with the (trip, stop) → time formula, Streets, Places, Vehicle as the relay gives it, DelayEstimate, LiveTime, FollowState and FollowView, the router's RawJourney, the worker's wire shapes in ops.ts with `OpsPart` making a missing or mis-shaped operation a compile error), and the page keeps one definition per shape by aliasing the engine's. Files import each other with the `.ts` extension (`allowImportingTsExtensions`, `verbatimModuleSyntax`): Vite transpiles them, Node 22 runs the tools as they are (`node tools/bench.ts`); `allowJs` is gone. The router's answers on two fixed queries are identical before and after. Found by the types and fixed on the way: a ride leg had no `seconds` unless another step had rewritten it, so the page's `seconds: number` lied for most rides (the worker now fills it in from the ride's times); a ride without a first departure matched any vehicle of its line (the live call sites now require one); the engine's route id can be text (compile.py keeps a non-numeric id as text), so the page's types say so instead of narrowing. Rejected: JSDoc types on the JavaScript (half the safety, none of the refactoring help); keeping the worker in JavaScript with checkJs (the contract between worker and page is where the lies were).
- 2026-10-31: Imports point one way, and a test holds it (`tools/imports.test.ts`): engine, worker, lib, journey, state, widgets, map, controllers, views, then the entry files; a folder imports its own files and those below, never above, and no file reaches itself through its imports, type-only imports included (maintainer: "state uses journey, but journey uses state"). Each type moved to the layer that decides its meaning: the worker's answers (stop info, station destinations, line and stop groups, departures, train rows, line info) are owned by its contract and re-exported by state instead of copied; `Place`, the recent `View`, the saved trip and stop and their key are the domain's (`journey/types.ts`); the follow state machine is about journeys as the page holds them and moved from `engine/` to `journey/follow.ts` with the `ActiveTrip` it follows; the store is the persistent part of the app's state and moved from `lib/` to `state/store.ts`; a path's point is the engine's `PathPoint`; sharing returns what happened and lets the caller name the places and toast. The ten cycles went with it: the store no longer knows state, the map's "what the sheet holds" and visible area live in `map/shared.ts`, planning from a stop is the planner's and a station's destination the trains page's, the road model declares what it reads of a vehicle. Rejected: an eslint plugin for cycles (a dependency for what forty lines do); allowing type-only imports upward (a type says who owns a meaning).
- 2026-10-31: Bugs found by reading the code, fixed with a test where one can hold them: a plan finishing after a newer one no longer replaces its results or clears its busy flag (a sequence like every other panel's); a plan from now after 03:00 loads the new service day first instead of planning on yesterday's timetable under today's date; a worker that fails rejects every waiting call, and every worker error names its operation (`tools/client.test.ts`); a failed trip-stops answer is not cached for the day; a journey's detail rows are keyed by the journey, so one journey's open "other rides" never show under another's; the map's faint context lines are dropped when another drawing started meanwhile, a drawing that throws is reported, and a line's page no longer draws its own course again under itself; a stop's page and the trains page stop "loading" when the worker fails; a saved camera is used only when it is one; freshness is judged against each set's own newest report (`tools/feed.test.ts`); route types beyond 127 (on demand, 715) and the shared taxi (8) can be asked for (`tools/raptor.test.ts`); a vehicle is matched to its trip by the schedule (`tripStart`), never by times a plan has shifted; a ride without its stops still names where to get off (`tools/followview.test.ts`); dead code went (bike peak days, a departure's `last`, a reverse hit's "city", the router's second copy of the journey signature).
- 2026-10-31: Kept, now written down: with live delays the planner moves a late trip no later than the next trip of its pattern at each stop (RAPTOR needs trips in order), so a bus ten minutes late with an on-time one five minutes behind is planned, and shown, at the second one's time. That is when a rider at the stop can board this line, which is what the plan promises; the vehicle's own lateness is what the live badge on the detail says. Rejected: letting trips overtake (RAPTOR's ordering breaks and plans become wrong, not just labelled differently).
- 2026-10-31: One owner for each thing that changes. The followed trip is replaced, never changed in place (`setTrip`: a new object sharing the journey and its legs with the old one, nothing copied), so the screen's signal sees every change and the `tick` signal that made up for it is gone; it is saved on the phone when the state machine moves, not on every fix and every five seconds, and saving it no longer redraws the saved and recent lists. The map keeps the courses and street paths it fetches in its own cache (by pattern and stops for a ride, by ends and mode for a walk, a few hundred kept) and draws a copy of the journey's legs that changed; the planner's results, the detail and the stored trip are never written to. Live delays are applied to the timetable's own arrays for one synchronous search and put back inside one function (`withLiveTimes`), with no state left between plans. Rejected: copying the day's 36 MB of times for each plan (maintainer: no copying things from place to place); a deep-frozen journey (a cost on every read for a rule the types and one setter already hold).
- 2026-10-31: The decisions that were buried in the controllers are pure functions with tests: when to look for a faster way while following and which way to propose (`journey/replan.ts`, every threshold named with its unit: late by 3 minutes, a missed change, the vehicle missing near departure, every 5 minutes, never twice in 90 s; 4 minutes earlier plus 3 per extra ride, a declined way away for 15 minutes), the notification's line (`journey/status.ts`), the plan's window and whether live delays go in (`journey/query.ts`), and when a stored trip is over (`isTripOver`). The controllers keep the timers, the fetches, the toasts. Tests: `tools/replan.test.ts`, `query.test.ts`, `status.test.ts`.
- 2026-10-31: The map owns the map. Panels no longer draw their vehicles on it by reaching into its marker lists and its "drawn for" field: they hand them over (`showVehicles(panel, set, vehicles)`, `showRider`), and `map/vehicles.ts` shows them only while that panel is what the map draws and clears them with every new drawing; the map's state and markers are no longer exported. The bubbles and the vehicle markers are Preact components (`map/bubbles.tsx`) rendered into MapLibre's popups and markers, and the HTML-string twins of the line chip, the rail mark and the icons are gone (one way to draw a chip, not two); a name that arrives later fills in through a signal instead of editing the bubble's DOM. The locate button and the compass are our own controls through MapLibre's public API (`map/locate.ts`), with the maintainer's behaviour kept (a tap only ever shows where you are; first tap keeps the zoom, a second one on you sets the neighbourhood's; a drag lets go of following): the old one rewrote MapLibre's private members, which any upgrade could break. The compass cone finds its dots by registration, not by searching the page every frame. Rejected: keeping GeolocateControl with public events only (it moves the camera itself, against the agreed first-tap rule).
- 2026-10-31: State keeps what the app knows; the components own the page. The rider's question (places, time, bicycle, the days the data has) is its own module, `state/query.ts`, with its rules tested in Node (`tools/query-state.test.ts`); `state/search.ts` is the bar's look and its actions (a filter chip, the bicycle choice and the summary tap go through actions that keep their rules, instead of raw writes from the views). No state or controller module looks up an element any more: the sheet's position, its CSS variables and the body's classes are applied by the Sheet component from signals, which also owns the drag; the screen's layout is measured by the top bar (`views/shell/layout.ts`) instead of read during a drag; the keyboard moves through the search boxes' registry, a card is brought into view through a signal its own component answers, and the address book arriving makes the box search again from its own effect instead of a synthetic input event. A panel is mounted only while shown, so what it held for one journey, stop or line is never shown for the next (the two screens stay mounted for their scroll). Navigation is one stack over two Back back-ends, browser history and Android's close watchers, chosen once, instead of `if (WATCH)` through the module. Checked in both modes (`e2e-backmodes`).
- 2026-10-31: The "May use" column is back in `src/README.md`'s folder table, filled from what each folder imports today, and `tools/imports.test.ts` reads that table instead of a list of its own: an import the row does not name fails, a use the row names that the code dropped fails, and the table itself must run one way (maintainer: the README must say which folder uses which). Rejected: the order sentence alone (it hid which folder uses which, and the test's own list could drift from the README).
- 2026-10-31: Controllers start when `main.ts` calls `controllers/install.ts`, not when imported: each collects its hooks and listeners into an `install()`, in a fixed order (status, loading, planner, detail, line, stop, follow, shell); the map adds its theme and live-layer listeners in `initMap`. A hook's default throws `hook <name> was not installed` (`lib/unset.ts`) instead of doing nothing; this found the navigation's `screenShown`, dead since the Nearby screen went, now removed. Rejected: keeping no-op defaults (a missing hook was silent).
- 2026-10-31: One mechanism each, and rows a keyboard can reach. Anything tapped that is not a `<button>` is `widgets/Tappable` (a button to the keyboard and screen readers, Enter and Space); something opened lately or saved reads the same everywhere (`widgets/ViewRow`); one segmented choice (`widgets/Seg`); the train-or-light-rail words in one place (`railWords`); a panel's late answers, live poll and end in `controllers/session.ts`; the console's helpers through `lib/debug.ts`. A search box is split into its typing and its list's frame (`SearchField`), what the list holds (`controllers/suggest.ts`, answers per box in the order asked) and its rows (`SuggestionList`); a recent place and its save star are two buttons side by side, not a clickable span inside a button. A journey leg is a shared frame (`LegFrame`, with `StopsAlongFold`) and one component per screen (`DetailLeg`, `FollowLeg`); a tap inside a leg's folds no longer focuses the leg, by refs rather than class names, and the follow screen keys legs by their ride, so a different ride after switching to a faster way starts with its stops folded. Rejected: stopping the folds' clicks from bubbling (the bar's popovers close on a document click).
- 2026-10-31: Boundaries. What the phone's storage holds is checked for the shape the app reads before it is handed out: a record from an older version or cut short reads as nothing kept, a list keeps the items that pass, a setting of the wrong type takes its default (`state/store.ts`, `tools/store.test.ts`). A catch wraps only what can fail for a reason outside the app: following's and the journey's live part ask one shared `seeRide` (`controllers/liverides.ts`, was two copies) and do their arithmetic outside any catch, a ride whose live data failed keeps what it showed; the live map's requests are apart from drawing; the catches left around a request and its drawing say in the console what failed. Requests have limits: a download that brings no byte for 30 s gives up and says so (its pieces kept stay for the next try), the manifest, rail times and map style give up after 20 s and check their status. The worker reads the timetable's layout through accessors beside the format (`patternStop`, `timesRow`, `tripRange`, `patternsAt`, ...) instead of thirty copies of the offset arithmetic; the router's own loops keep reading the arrays directly. Rejected: a schema library for the store (a dependency for a dozen small checks); narrowing every catch (where a request and a few lines of drawing share one, the extra code buys little); accessors in the router's hot loops.
- 2026-10-31: Folders named for what they hold (maintainer: "tools sounds like simply tests; call it tests"). `tools/` split in two: `tests/` (every test and its tiny-timetable helper, and `tests/e2e/`, the browser smokes with a harness and real checks, `npm run smoke`) and `measure/` (the router benchmark and the train backtest, which print numbers and pass or fail nothing). `src/types/` is gone (maintainer: one declaration is no folder): MapLibre is imported from `map/maplibre.ts` instead of read as a global, and the console handle's declaration sits beside `lib/debug.ts`, its one writer. Rejected: keeping `tools/` with a better README (the name still says nothing); Playwright as a dependency (it brings a browser; the smokes find an installed copy).
- 2026-10-31: Tests added: the router against a plain round-by-round search on 300 random timetables (true earliest arrival, ridable journeys, leaving later never arriving earlier), the panels' stack and Back on a fake browser history (which moves later, as a real one does) and on fake CloseWatchers, and three browser smokes (the main flow, Back both ways, the map's controls). Each was checked to fail when what it guards is broken. Found on the way: a tap on the compass under the harness's frozen clock leaves MapLibre's turn unfinished (an artefact of the test, not the app; the smoke checks the compass asks for north).
- 2026-10-31: `journey/` is split by owner (maintainer: "a bunch of random things glued together, its description vague"). `model/`: a place, the question a plan asks with its window rule, a journey and its legs, what the live data says about a ride (data only). `display/`: how they read and look, `format.ts` split by subject into `time`, `live`, `travel` and `places`, beside `colors` and `operators`. `following/`: the state machine, re-planning and the status line. The records the phone keeps (recent views, saved trips and stops, the key naming a trip) moved into `state/store.ts`, their writer, and its two different `tripKey`s became `tripKey` and `favTripKey`. Sharing and the pay link moved to `views/detail/`, their only users. State now keeps a ride's live standing as data (`RideLive`) and the views word it (`display/live.ts rideBadge`): a badge worded when it arrived stayed in the old language after a switch. Each new folder's README says what it owns, what it does not, and who uses it; `src/README.md`'s table lists the new uses (widgets read the store's record type, for the row of a recent or saved item). Rejected: one `domain/` folder (the same grab-bag under another name).
- 2026-10-31: An address joins a street of its name only in its own city or within 5 km (`pipeline/places.py street_for`). Found from a tap near HaShalom named "Begin Road 136, Tiberias": an address whose street name matched one street anywhere joined it, and Tel Aviv's Begin Road numbers (their ways mapped without "Derech") had joined Tiberias's road, 106 km away. Where no city is known (no stop with one within 1.5 km, much of Gaza and the West Bank), streets are grouped by a square of about 5 km instead of country-wide, which had merged same-named streets 100 km apart into one with an averaged middle. Measured on the current OpenStreetMap extract: addresses over 10 km from their street went from 2,770 on 213 streets to 2 on one (both tagged Jerusalem by their own addr:city). The address book's format is 4, so the nightly build compiles it again; `pipeline/test_places.py` runs in the workflow and fails with the old rule. Rejected: a fixed distance alone (a long road's middle can be far from its ends; the city decides first).
- 2026-10-31: The trip search lists places and stops only, no lines (maintainer, reviewing the trip search: "searching a trip location suggests lines"). Line numbers in the To box were left from the single bar of 2026-10-18; since the line search has its own kind on the switch, they only crowded a place search (and let one digit search). Stops stay: a stop or a station is a place to travel from or to, and the stop search is for a stop's departures, not for planning. Rejected: dropping stops from the trip search too (planning to Savidor or a known stop is common, and the stop search does not plan).
- 2026-10-31: The place search forgives spelling (maintainer, reviewing the trip search: "if I have a mistake when searching, it just doesn't work"). A Hebrew word not found as written now matches by the written word with one slip, by the consonant skeleton the Latin search already used (another spelling), its start, or from five consonants one slip in it; a Latin word gets the skeleton slip; whatever is found only loosely lists after everything found as typed. Also: בי"ח/בי"ס read as בית חולים/בית ספר, a trailing word that only sounds like a city is not taken as one ("said" was Sa'ad, "hacarmel" Karmiel), and "rotshild" keeps its t. Measured on 25 everyday misspellings: 12 found before, 25 after; on 50 correctly spelled queries the top result is unchanged for 47, better for one (ben yehuda 10), and found where nothing was before for two. The skeletons are built by the worker once the address book loads (0.5 s on a laptop), not on the first keystroke. Rejected: a general edit distance over all names (slower, and it matches short words to anything); a search library (none knows Hebrew's spelling variants).
- 2026-10-31: Overture Maps' places join the address book (maintainer, after "lots of restaurants don't appear": "yes add overture"). OpenStreetMap maps businesses only in part: over Tel Aviv we had 1,310 places to eat and drink, Overture 4,214. `pipeline/overture.py` reads its newest release from the public bucket with DuckDB (no key), keeps Israel and the Palestinian territories, confidence 0.7+, the kinds a rider travels to (no lawyers, real estate or beauty services), maps its categories to the app's kinds, and `places.py --overture` adds those OpenStreetMap lacks (same name, or one the start of the other, within 150 m is the same place). Overture's hospitals and malls come in as clinics and shopping centres, since it names many small ones so; only OpenStreetMap's rank as landmarks. Result: 53k places added, 102k in all, the address book 2.9 to 4.3 MB gzipped. The search matches across scripts by sound (מיזנון finds Miznon), letters doubled as written collapse before the vowels go (so "miznon" is not "מוזיאון"), and the loose pass runs only when the exact one leaves room in the list: a search's median went from 46 to 33 ms on twice the places. Licenses CDLA-Permissive-2.0, Apache-2.0, CC0, credited in the about text and the README. The workflow fetches it weekly with the street graph and keeps the last file when the bucket does not answer. Rejected: all of Overture (247k in the box: offices and services nobody travels to, and Jordan); Foursquare's or Google's place APIs (keys, cost, terms).
- 2026-10-31: The folded bar's X starts over (maintainer, reviewing the trip search: "it should clear everything, the entire state completely, including the drawer below", and "it should have more clickable area"). It used to close only the plan's own step, leaving a way's detail, a line or a stop opened from it on the sheet. Now every panel closes, the plan is cleared (places, results, time and options) and the sheet folds to its handle; a trip being followed goes to its resume bar and is not ended, so a slip of the finger cannot cut a ride short. Back while editing the bar keeps its smaller step. The X is drawn at 36 px and takes touches over the bar's full height (about 56 px). Rejected: ending a followed trip too (one tap would lose it; the resume bar's own end stays the way to end it).
- 2026-11-01: Folders renamed so the name says where to look (maintainer: "the whole concept of names is for someone to see the name of the folder and know exactly where to go"; "display" was generic and held unrelated things, "lib" should be "common", "model" is not intuitive). `lib/` is `common/` (what everything uses); `model/` is `trip/` (what a trip is made of: place, query, journey); `display/` is `text/` (the words the rider reads, built from data), its files named for what they word (`durations.ts`, `live.ts`, `travel.ts`, `placeNames.ts`, `operators.ts`), and the line colours moved beside the line chip (`widgets/lineColors.ts`). Paths only, no behaviour changed. Rejected: `format/` (says how, not what), `words/` (the fixed strings are in `common/i18n.ts`), `types/` for the trip data (it holds rules too: the search window).
- 2026-11-01: "knaan safed" finds the Canaan Spa hotel in Safed (maintainer's question). Two flaws in matching by sound: a letter dropped as a vowel (א ע י) let its neighbours collapse, so כנען was k-n while "knaan" is k-n-n; it now keeps them apart, as the Latin vowels do. And a ו was taken as silent for any Latin word, so "knaan" matched קניון (malls); a ו is now silent only where the Latin word has a vowel for it (o, u) or a v/w, so "kanyon" still finds the malls. Misspellings (25 of 25) and correctly spelled searches (50 of 50 same top result) unchanged; tests/places.test.ts holds both rules.
- 2026-11-01: The train timetable's To box lists recents too (maintainer: the From and To boxes "don't seem to share a recents functionality"). It listed none, because its list holds only the stations reachable from the From one without a change. Now it lists up to four stations used lately on either side (a station opened, both ends of a pair looked up), kept only when the To list holds them, those looked up from this very station first; a tap fills the To box and opens the trains between the two.
- 2026-11-01: English to English, with standard fuzzy (maintainer: "it's stupid if we don't match English to English"; "just do standard fuzzy for now, don't add any transliteration stuff"). A word typed in Latin letters is now compared as text with every English word a place has, its English name and the Latin words inside its main name (5,519 places, mostly Overture's two-language names), and when not written so, with typos as search engines allow (edit distance, none up to two letters, one up to five, two beyond; a word still being typed against the start of a longer one). One typo ranks just above a name that only sounds alike, below an exact word. Removed: the sound keys of Latin words inside names (added with Overture), which let "knaan" match "Ouaknine" and a Hebrew word find an English-only name; the existing sound match of a Latin word against a Hebrew name stays as it was. A quick check of the first two letters spares most comparisons: Latin searches take about what they did before (60-200 ms on a laptop). Rejected for now: generated Latin spellings for Hebrew-only names (transliteration; the maintainer said not now).
- 2026-11-01: More everyday places (maintainer: Bus Nearby "has tons of restaurants, while we barely have any", his example חומוס פיטר in Jaffa). The example is in no open dataset: not OpenStreetMap, not Overture at any confidence, and Tel Aviv's GIS "businesses" layer (925) names only the licence holder (corrected 2026-11-03: its "licensed businesses" layer, 964, has trade names and holds the example; see below); Foursquare's open places now sit behind a portal account and token (and Hugging Face gating), so they fail minimal infrastructure. Bus Nearby's business search is most likely a commercial provider (opening hours, phone, website), which privacy and the licence rule out. What was done: Overture's confidence floor lowered from 0.7 to 0.5 (a sample at 0.5-0.7 is real shops and restaurants; below it closed and one-off pages take over): 102k places become 139k (restaurants 10.6k to 15.3k; within a kilometre of Jaffa's flea market 1,144 places become 1,599, food 398 to 509), the book 4.3 MB to 5.2 MB gzipped, searches about a third slower (still under 100 ms for a Hebrew word on a laptop). For a place like the example, the way in is OpenStreetMap: a rider who adds it there (name and amenity=restaurant) sees it in the app after the next weekly rebuild.
- 2026-11-01: Two search flaws found while checking the example's street. "שדרות ירושלים 15" gave the city of Jerusalem: the trailing word was taken as the city; now a trailing city word stays with the street when the words as typed are a street's name in the book (many streets are named after cities), and a street-type word (שדרות, רחוב, דרך) also says no city row is meant. And "חומוס אבו חסן" missed Jaffa's אבו חסן 300 m away while listing the Rishon LeZion and Akko places so named: every typed word had to be in the name; now a place is also found with one typed word left over (a dish, a type, a quarter), only when every word of its name was typed exactly, and it lists after everything found as typed, like a slip. Streets never: "דיזנגוף תל אביב" still strips the city. Rejected: scoring a missing word as a plain match (it would turn "חומוס פיטר" into a list of hummus places ranked as if found).
- 2026-11-01: On-device work is a means, not a creed (maintainer, when a Google Places fallback for missing places was argued against on "nothing leaves the phone" grounds: that requirement "was added out of practicality, not out of niceness. I wanted to not have to deal with infra and to pay more bills, that's all"). Written down as `docs/principles.md` rule 2 and in `CLAUDE.md` ground rule 2: the phone does the work to save infrastructure and bills; offline use and "nothing leaves the phone" are side effects, not promises; the promises are the specific ones (no tracking analytics, no location sold, no tracking ads). A paid service or a small server is weighed by cost, configuration, what it sends and what breaks when it is down, and anything with a bill or a key is the maintainer's call. README's "nothing you type leaves your phone" line, which overstated it, is gone. Also corrected the same day: Places Autocomplete needs no device location (it biases by IP when none is given), so the earlier privacy argument against it was overstated.
- 2026-11-03: Israeli sources for places, surveyed at the maintainer's question ("did you look in Israeli databases, like ArcGIS?"). Found: Tel Aviv's GIS layer 964, "licensed businesses" (https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/964): 21,546 licensed businesses with coordinates, street, the licence's description of the business, and for 10,905 a trade name (3,440 food), refreshed nightly; חומוס פיטר is in it. Matched by name within 150 m, 9,455 of the named ones (2,738 food) are missing from the address book after the Overture change. Terms (opendata.tel-aviv.gov.il, "about"): the data may be shared and put to any use within the site's terms, "as is", all rights reserved to the municipality; no named licence, no attribution clause, the same footing as the weekend lines already built from this server. Also found: Be'er Sheva's two business datasets on data.gov.il (business licensing, 3,111 rows with trade names and addresses; a signage survey of 3,054 businesses with coordinates; "Other (Open)"). Not found: any other city's business layer on a reachable ArcGIS server (Ashdod's public server has none; the rest answer nothing or 403), any national business dataset with trade names on data.gov.il, and GovMap, whose API needs a token tied to a domain and is blocked from the build's network anyway. Earlier line corrected: layer 925 has only the licence holder, 964 has the names. Not built yet: a pipeline step reading 964 (and Be'er Sheva's sets) into the address book the way Overture joins it, pending the maintainer's word on using municipal data under those terms.
- 2026-11-03: Survey widened at the maintainer's question (other municipalities, regional councils such as Gezer, Jerusalem, Rehovot, and the Survey of Israel's national database, בנט"ל). data.gov.il carries four municipalities (Be'er Sheva, Haifa, Ma'ale Adumim, Petah Tikva) and only Be'er Sheva publishes businesses. The Survey of Israel's open set there (117 datasets, "other (open)") holds the national database's institution layers, not businesses: schools (3,329), kindergartens (11,149), academic institutions (390), universities (50), research institutes (87), yeshivot (953), field schools, parking lots (5,826, nearly all named just "מגרש חניה"), ports, airports, settlement centres, the 1997 gazetteer; Israeli grid coordinates, 2023 vintage, names written "type - name" ("בית ספר - מ"מ בן צבי"). The full בנט"ל product is sold (80,000 ₪ nationwide, the Survey's catalogue) and its terms are not open. GovMap's search needs a token and is blocked from here. The municipal sites of Gezer, Rehovot and Jerusalem, and Jerusalem's GIS viewer, answer this environment with a bot wall (403, "Just a moment"), so whether they publish a businesses layer could not be checked from the build's network; a check from a browser in Israel is the way to know. Not built: the institution layers add little a rider searches for that OpenStreetMap lacks, and need name cleaning to even match; parked unless wanted.
- 2026-11-03: Public bodies' places join the address book (`pipeline/public.py`, `--public` in the compiler, the nightly workflow). The maintainer: the on-device rule is about bills, not purity, and these sources cost nothing and need no key, so they are an engineering choice. Three sources, each optional (one down is left out; none answering keeps last week's file): Tel Aviv-Yafo's licensed-businesses layer (trade name, the licence's description read into the app's kinds by keyword, first match wins, "בית קפה" before "מסעדה"; 8.7k of 10.9k named businesses kept, the rest storage, production, offices, taxis or a description nothing recognises), Be'er Sheva's signage survey (1.8k of 3k), and six Survey of Israel institution layers (14k named; the "type - name" form becomes a name, bare types such as "בית ספר" dropped; a yeshiva is filed as a school, the nearest word the app has). Measured: 139k places become 158k (kindergartens 2.3k to 9.4k, schools 5.2k to 9.2k, restaurants 15.3k to 16.0k, cafés 4.8k to 5.2k), the book 5.2 MB to 5.5 MB gzipped; within a kilometre of Jaffa's flea market 1,599 places become 2,270 (food 509 to 741); חומוס פיטר, קפה ילין and גן ביטנורה are found. Terms: Tel Aviv's open data may be shared and put to any use ("as is", all rights reserved to the city); the data.gov.il sets are "Other (Open)"; the Survey's come with its caveat that they are no authority on boundaries. Rejected: Be'er Sheva's licensing list (names and addresses, no coordinates: it would need geocoding against the book, for a city the survey already covers); the Survey's parking lots (5.8k, nearly all named "מגרש חניה"); Overture-style confidence for these (a licence is a fact, not a guess).
- 2026-11-04: Sessions push `main` (maintainer: "you merge to main, you always have", when a week's work had sat on the session branch and the app still searched the old address book). Ground rule 6 now says so: the session branch is pushed as before, and when a step is done and checked, `main` is fast-forwarded to it, since the nightly build runs from `main` and nothing on a branch reaches riders.
- 2026-11-04: The time popover opens on the clock (maintainer: "when I open the time when searching, it shows up 5 minutes back"). While the question is "now", the stored time is set when the app opens and refreshed only when a plan is made, and the popover's wheels were read from it; now they are set to the clock as the popover opens. Plans were never affected: a plan from "now" resets the time first. Test in tests/query-state.test.ts.
- 2026-11-04: English names for every Hebrew-only entry (maintainer: "many places only have their Hebrew names. Can we translate them please (and transliterate where relevant, most times it's better to transliterate than translate)"). Built at build time, no service: `pipeline/english.py`, three layers (spellings learned from the 126k bilingual names the book already holds, kept only when the Hebrew and English words sound alike, so position never teaches a translation; a short table of generic words in English order; rule transliteration for the rest), the compiler fills every street, place and city that lacks English (95k names; the book 5.5 MB to 6.2 MB gzipped), format 7. Measured on held-out bilingual names: half come out letter for letter as the source wrote them, the rest mostly another spelling of the same sound (Herzl/Hertzel) or the source's translation where we transliterate by design. Rejected: machine translation through an API (a key and a bill for 95k short strings, and translation is not what was asked); transliteration on the device at load (the same work on every phone, and the search needs the words at build time anyway); learning translations by word position (English reorders translated names, so it paired "המלח" with "Sea" and "קניון" with "Givatayim").
- 2026-11-04: One result per place in English too (maintainer: "searching for park hamesila gives me multiplied similar results, both in TA and in Jerusalem"). Results were made unique by the name shown, so a park mapped in five pieces with five English spellings (The Track Park, HaMessila Park, Park HaMesilah) was five results in English and one in Hebrew. The key is now the kind, the Hebrew name and the Hebrew city, whatever language is shown; the piece kept is the best scored, the nearest. Rejected: merging the pieces at build time (the nearest piece of a long park is the right one to walk to, and which one that is depends on where the rider stands).
- 2026-11-04: A name is transliterated only when the book has no English for it (maintainer: "we need to transliterate a location only if we don't have it in English"). The rule had been applied per entry, so a park piece, a chain's branch or a same-named street in another city without its own English tag got a made-up spelling beside a sibling that has the real one. Now an entry first takes the English of any entry with the same Hebrew name (the spelling most agree on), and only a name the book has never seen in English is made (format 8).
- 2026-11-05: Traffic colours at once (maintainer: "why does it not show me the traffic on the road immediately? I see the buses but not the red/orange/green lines"). The road model compares a bus's progress with the learned section times, and without them it dropped every snapshot; boot loaded that file last, after the courses, the address book and the street graph (21 MB), and the snapshot of 10 minutes before, meant to make traffic immediate, was fetched only if the times were already in. So on a fresh open the colours waited for the times and then for two more polls 90 s apart. Now the learned times load first (1.3 MB), the worker catches up when they land (it fetches the 10-minute-old snapshot then and feeds it with the current one), and the map redraws the moment the times are in instead of at the next poll.
- 2026-11-05: Which entrance (maintainer: "is it possible for the light railway to tell in which specific station to go out? I mean the physical exit. Each station has multiple exits that go at very specific locations, not the center of the station as currently shown"). The feed has no pathways; OpenStreetMap maps the entrances (37 at 18 stations: the Red Line's underground stations lettered A to D, the Carmelit's, Savidor's) with stop-area relations tying most to their station. Built: `pipeline/entrances.py` (weekly, 4 KB, with the OpenStreetMap step), the worker ties stations to the timetable's rail stops by place and mode (the feed names them "ת.רק''ל אלנבי", "גשר אם המושבות"), and a walk to or from such a station goes to the entrance with the shortest street route and says which, with the street from the address book; follow mode ends the walk at the entrance. Walk times are left as the router planned them from the station point (within 150 m); timing the walk to the entrance itself is the next step if a station proves a minute off. Rejected: tying stations to stops by the feed's names (a third of them carry no rail word); choosing the entrance inside the router (the station point stands for all of them within the router's resolution).
- 2026-11-05: The cold start's traffic checked (maintainer: "I think now the traffic of roads shows incorrect data? Probably due to your caching? Maybe I'm wrong here, check me"). Measured rather than argued: `measure/trafficreplay.ts` replays the relay's last minutes through the real road model in Node, the steady state (a snapshot a minute for a quarter of an hour) against the cold start the app now shows at once. Greater Tel Aviv, 20:30: the 10-minute pair coloured 1,398 sections to the steady state's 1,836, and where both coloured one they agreed on the level 92% of the time, the cold start slower in 41 and faster in 61, so no lean either way; with the 3-minute snapshot added (already fetched at the first load for frozen positions) 1,665 sections and 93% agreement. Done: the catch-up and the first load read 10, 3 and now. Not found: a wrong colour the change explains; what the maintainer saw stays open until an example (a screenshot with the time) says which road.
- 2026-11-06: The walk to an entrance meets the ride (maintainer, a screenshot: the walk to Shaul HaMelech's entrance B, on the rider's side of Begin Road, ended 100 m short of the ride drawn from the station's point, so the route looked broken). The entrance chosen was right; the drawing stopped at it. Now the walk's path runs on from the entrance to the stop's point (the stretch inside the station), and out of it the other way, and a transfer walk between two such stations carries both stretches; follow mode still ends the walk at the entrance.
- 2026-11-06: Entrances marked on the map, the inside stretch lighter (maintainer: "we should have icons for the stairwells into the station, and maybe a slight change in opacity/color for the underground walk"). A walk that meets an entrance is drawn in pieces: the street part as before, the stretch from the entrance to the stop at half opacity, thinner and without the white casing, on the highlighted way and on the other ways alike; a stairs glyph in a white disc stands at the entrance. The split is found on the path itself, which passes through the entrance's point. Rejected: a separate "inside" leg from the worker (the walk is one walk; how it is drawn is the map's business).
- 2026-11-06: A merged walk keeps its entrances (found checking the marks on the live app: the walk to Arlozorov, planned through a nearer stop and merged into one line, named no entrance although Arlozorov has two). The merge now carries the first walk's exit and the last walk's entry and drops those of the stop passed through. Also seen there: the Carmelit's stops in the feed are bus-typed stops named after it, so its entrances tie to nothing and show nowhere, which is right until the feed carries the Carmelit as rail.
- 2026-11-06: Entrances on the map by default (maintainer: "can we add icons for the stairwells to show up on the map by default"). A base layer like the stop badges: every entrance of the file as a stairs badge from zoom 15, its letter under it from zoom 16.5, over the stop circles and under the vehicles, kept across basemap switches; the journey's own mark at the chosen entrance keeps its place with an accent ring, so the one to take stands out among the rest. Rejected: a tap bubble for an entrance (nothing to say yet beyond its letter and station).
- 2026-11-06: Stops and stairwells weightier on the map (maintainer: "stairwells and bus stations are not noticeable enough on the map. The main stations (railway, main bus, and light railway) are clear enough as they are and should not be changed"). The bus stop badge and the entrance badge grow from 15 to 17 px and from a grey to a dark ring and glyph, scale to 1.3 by zoom 17 instead of 1.15 and 1, and the stop circle under them gets the same dark, thicker ring; the entrance letter is a point bigger. The station badges are untouched.
- 2026-11-06: An entrance answers a tap (maintainer: "when clicking on a railway stairs it should show something to indicate we are looking at e.g. 'entrance A to the Shaul HaMelech'"). The point bubble, with a line under the name: "Entrance A to Shaul HaMelech" (Hebrew "כניסה A לתחנת שאול המלך"), the street it opens onto, to here and from here with the entrance as the place. The station's name comes from the timetable's tied stop in the rider's language; the file's Hebrew name stands in until it arrives.
- 2026-11-06: One language on screen, made a rule with a guard (maintainer, on "Entrance A to ארלוזורוב": "this is like the millionth time I tell you to make sure we DON'T mix Hebrew and English. Please find a way to make sure this never repeats itself"). The bubble had looked its station up by the map's coordinates, which are the tile's and not the file's, found nothing and fell back to the file's Hebrew; it now finds it by station and letter. The rule itself is `docs/principles.md` rule 3 and a non-negotiable in `CLAUDE.md`, with three layers so a Hebrew name can never reach an English screen: the data's English, the build's (`compile.py` now gives every stop, station, city and headsign the feed leaves untranslated an English name through `english.py`, 2,000 of 25,600 stop names, the light rail's among them; the entrances file carries OpenStreetMap's `name:en`), and the app's own last resort, `src/engine/latin.ts`, the rule transliteration ported and placed inside every name helper. `tests/latin.test.ts` holds the helpers and the app's own strings to it. Also asked and done: the bubble says what the entrance leads to ("Entrance A to Arlozorov light rail station", "railway station", "Carmelit station"), and train stations' doors are in the entrances file too (OpenStreetMap maps 38 of them with plain entrance nodes beside the station node, most without a letter; within 120 m of it, so a building's door across the street is not taken). The entrances file now carries a format number and `entrances.py --check` tells the build when its file is of an older one, so a change to the script reaches the app the next night and not the next week, as the address book's does.
- 2026-11-06: The lexicon pairs words that sound exactly alike first, each English word to one Hebrew word (`english.py` learn). Seen on the live site after the one-language fix: an entrance's street read "Bet Yekutiel Ko Adom" for רכבת קלה קו אדום, because every "תחנת רכבת בית ..." / "Beit ... Railway Station" pair had taught רכבת the spelling Beit (a looser likeness, one consonant short, that the word בית owned). Now a word takes an English word by loose likeness only when no word of the name claims it exactly; רכבת, קו and הרכבת are in the common words' table (Rakevet, Kav). Book format 9, so the next night rebuilds the book.
- 2026-11-07: Station entrances, after the maintainer found Savidor's wrong (two missing, one twice): train stations are mapped loosely in OpenStreetMap, so `entrances.py` reads them three ways. A door is an entrance=* node on a building tagged as a station (no longer any entrance node within 120 m of a station node, which took the mall's doors by a bus terminal: 46 at one, and hotel doors at Savidor); a hall's entrance with no node at all is where an outdoor walking way meets the station building's outline (Savidor's western entrance and its pedestrian bridge); and twin doors within 25 m with the same letter and name are one entrance at their middle, each cluster measured from its first door so a row of doors cannot creep. Stations are rail only (railway=station, or public_transport=station of a rail mode): bus terminals, taxi stands and the cable car gave junk doors. An underground station's footprint gives no walk-meetings (a footway crossing it above ground enters nothing); pedestrian areas are not walking ways. 62 stations with 98 entrances, against 60 with 181 before, 26 train stations newly with an entrance. Format 3 of the file, so the next build rebuilds it.
- 2026-11-07: Bus times measured in hindsight (maintainer: "our time estimates of buses tend to change completely and quickly, users can't really trust us"). `measure/busbacktest.ts` replays Hasadna's minute files through the app's own code and scores every time shown against when the bus really passed the stop. Friday 2026-11-06 08:00-08:40, all of Israel: the time shown moves under 30 s in 62% of minutes and 2 min or more in 6%; over the 20 minutes before a bus comes it wanders 2.5 min (median, 90th percentile 6.7) and goes back and forth in 22% of cases; 4% of minutes jump 3 min or more. Of those jumps, 39% are the start of a trip: while a bus waits to start the app shows the timetable's times, and the moment it moves the learned sections' times, 6 min later in the median (the timetable is that optimistic); 46% are the bus's place on its trip jumping, a third of them the same spot read as another stretch of a looping route, half of those backwards. The live road factor costs steadiness (71% to 62% of minutes under 30 s, back-and-forth 14% to 22%) for 2 to 3 points of accuracy. Accuracy itself holds: 0-5 min ahead 80% within 2 min of the truth (the timetable alone: 27%), 20-40 min ahead 37% and 2.3 min early. Nothing changed yet; the fixes proposed are the same model while waiting to start, a projection that remembers where the bus was, and a calmer road factor.
- 2026-11-07: The three fixes from the bus backtest, built and measured on the same window (Friday 08:00-08:40). A bus waiting to start gets its times from the learned sections, from its listed departure (busAhead at the first stop), so nothing jumps when it moves; the worker remembers the stretch each ride was last placed on (`vehicles.ts` estimateFor, `places`) and the estimate reads the next report from there on (`delays.ts` placeOn: the earliest stretch from one before it that is about as near as the nearest of all), and a bus once under way is never re-read as waiting; the road factor needs two buses and leaves out a tenth either way; a bus at a stop is there now, not at the listed time plus its lateness at the next. Jumps of 3 minutes or more fell from 4% of minutes to 1%, minutes that moved the time 2 minutes or more from 6% to 4%, a stop's 20-minute wander from 2.6 to 2.3 minutes (90th percentile 7.2 to 5.5), and accuracy rose at every horizon (within 2 minutes: 0-5 min ahead 82% to 83%, 20-40 min 36% to 40%). The road factor now costs 4 points of steady minutes for 2 to 3 of accuracy and stays. Not fixed: the minute-to-minute wobble of a minute or so (back and forth in a fifth of watched stops, with or without the road factor), which is the positions' own noise. `tests/delays.test.ts` holds the four rules.
- 2026-11-07: Station entrances, after the maintainer checked the live site (Rehovot, Moshe Dayan and HaShalom "almost perfect"; Savidor's eastern entrance is at the Bursa, and at HaShalom the tickets are where the bridge meets Azrieli, not where it meets the station): a door or a footway's meeting on the station's outline that is on a bridge or in a tunnel is carried to where that comes out (`entrances.py` follow): the first node, along the elevated walking ways within 600 m, on another building's outline or on a walking way on the ground; a bridge that comes to nothing, a road bridge's sidewalk, keeps the door. Savidor now has north, west and east (the Bursa side); HaShalom the Azrieli end of its bridge and the ground on both banks. Twin doors merge within 40 m instead of 25 (a deck's two stairways 30 m apart are one entrance). File format 4.
- 2026-11-07: Tel Aviv University's entrance was gone (maintainer): its station building is mapped as an underground footprint (layer -1, the platforms in their trench), and since format 3 those were skipped whole. An underground footprint now keeps the doors tagged on its outline and only gets no footway meetings (a footway crossing it above ground enters nothing). `entrances.py` area/read_osm.
- 2026-11-07: Entrances, round three (maintainer: Moshe Dayan's doors had been right and were moved; "we must have other stations missing them too"; "there are names to train station entrances: HaShalom's are Azrieli, north and south; Moshe Dayan's north and south; Savidor's the Bursa..."). A bridge or tunnel is now carried only to another building it reaches (Azrieli, the Bursa); one that only steps down to the street keeps its door (Moshe Dayan). A station building with no door and no footway drawn to it, most of the country's small stations, gets its side nearest a path or street (27 train stations had none); a building at layer -1 but location=surface (Beit Shean, Hod HaSharon, Holon Junction, HaHagana) is not underground; the walking ways and buildings read around a station are those with any node within 700 m, not the first one (Savidor's Diamonds Bridge continues from beyond). The merge distance goes back to 25 m (Moshe Dayan's north and south doors are 29 m apart). Names: `pipeline/entrance_names.json`, the names riders know the entrances by, from the Hebrew Wikipedia articles on all 69 stations (and Moovit's page for Savidor), read 2026-11-07: nine stations have named or sided entrances (HaShalom: Azrieli, northern, southern; Savidor: Moda'i Bridge, western, Bursa; Moshe Dayan, Rehovot: northern and southern; Tel Aviv University, Netanya, Caesarea-Pardes Hanna, Beit Yehoshua, Hof HaCarmel: western and eastern); the other 60 have one hall and nothing to name. Each name goes to the file's entrance nearest a point, or the only one on a side, so a change in OpenStreetMap cannot swap them; the app says "Azrieli entrance to HaShalom railway station" and "walk 3 min to HaShalom · Azrieli entrance" (`name_en` marks a name riders use; OpenStreetMap's own names stay as the place in brackets). File format 5.
- 2026-11-07: Four from customers, by the maintainer. (1) The first open follows the phone: English for a phone in English, Hebrew for any other (`i18n.ts` phoneLang; the app has these two, and a rider in Israel on a phone in another language reads Hebrew sooner than English); a language chosen in the settings still rules. (2) In Hebrew the result cards' times and leg chips read left to right, a journey running from its start to its end (`results.css` direction: ltr on the card's top row, its chips and the strip rows); the lines' words below keep the page's direction. (3) Home and work are set from the search list itself: while unset, a "Home / Set home" row opens the chooser (the saved page's own flow) and the place lands in the row. (4) The walk to the first stop and from the last is 20 minutes by default, not 15 (maintainer: "20 or even 25"; 25 is a setting away); a rider who changed the setting keeps their value.
- 2026-11-07: Entrances, round four, after the maintainer found HaShalom's halls moved too and asked whether every station can be trusted. An audit of every station against its Wikipedia article (`entrance_names.json` now carries the hall's side for 13 one-hall stations, with sources) and a review page with a map per station showed the systematic faults: a bridge carried to the ground (HaShalom's halls, Moshe Dayan); a building's guess taken on a parking lot's service road (now a guess per face, footpaths first, the article's side choosing the building and the face); a footway bridge over the platforms read as an entrance (Savidor's "second western"); two halls on either side of the tracks merged into one (Caesarea); a footpath touching a hall on the wrong face taken over the article (Akko). An entrance the data cannot reach is put from the table with its source (Savidor's Bursa end: the mall it lands on was drawn in OpenStreetMap after the extract the build read). What remains is OpenStreetMap's own detail at small stations, where the entrance is the hall's face nearest a path. The review page is published for the maintainer to check by eye. `derive()` runs on a debug dump, so a rule is tried in seconds instead of the eight-minute read.
- 2026-11-07: A fifth from customers: the search list scrolls only on the second try. Not reproducible with emulated touch, so two likely causes were taken out: the tap ripple, drawn into the row at the first touch (`.rippling` makes the row position: relative and overflow: hidden under the finger as the scroll starts), now waits 90 ms inside any scrolling list and is dropped when the finger moves; and the list's height, re-fitted on every visual-viewport scroll event (the phone panning for the keyboard), holds still while a finger is on it (`SearchField.tsx` refit). To be confirmed on a phone; if the complaint is about the sheet's results instead, that is the sheet's own rule (half open, it drags before it scrolls).
- 2026-11-07: Customer item (2), the result rows left to right in Hebrew, reverted the same day (maintainer: Bus Nearby lays them out as we did; the customer was likely not used to the Hebrew layout). The cards' times and leg chips follow the page's direction again; the times themselves still read as a range (TimeRange, dir=ltr).
- 2026-11-07: Red traffic with hardly a bus (maintainer, Saturday 17:48, the Levanda to HaShalom corridor). Replayed from Hasadna's minute files: one 3 km section, the intercity lines' Central Bus Station to Azrieli, had two buses whose ratios to the usual time ran from 0.3 to 3.7 within the quarter hour, the large ones from positions as a bus crawled out of its terminal, and three readings from one bus outvoted the other. The road model now counts one vote per bus (`delays.ts` rideMedian, for the map's colours and the delay factor alike), a pair of positions must cover a stretch the bus usually takes 90 s or more (not 30) and be at most 6 minutes apart (`traffic.ts` COVER_S, PAIR_MAX_MS). Replayed, the section is no longer coloured and the Namir sections read free. Also found on the way: the location dot had gone back to MapLibre's blue because its stylesheet follows ours in the bundle; the rule now carries the map's class (verified turquoise live).
- 2026-11-07: The basemap's buildings fainter and its dark roads brighter (maintainer: "in dark mode the roads are not emphasized enough compared to the buildings; make the buildings less opaque"). Liberty draws buildings flat to zoom 14 and as shaded blocks from there; the blocks made the heaviness. Now the flat fill runs to zoom 16 at 0.55 opacity and the blocks begin at 16 at 0.4 (`style.ts`), and the dark palette's roads are a step lighter, the buildings a step darker. Checked side by side on Tel Aviv's centre, light and dark; a first try at 0.35 made the buildings vanish, and they give orientation, so the middle was kept.
- 2026-11-07: The 3D buildings' opacity, properly this time (maintainer: fine with where the blocks begin, only their opacity, "very very opaque"). Liberty's zooms are back (flat to 14, blocks from 14). The blocks had stayed heavy through the style's numbers because the sky-and-light setup in `basemap.ts` set them to 0.9 after the style loaded; one exported number, `style.ts` BUILDING_3D_OPACITY = 0.35, is read in both places, verified on the built app (the map reports 0.35) and by eye in both modes.
- 2026-11-07: Dark contrast of the bar and the drawer against the map (maintainer, after the buildings were made faint): the dark surface goes up a step (#1e2227 to #23282e, chip and line with it, `base.css`), the search pill gets a one-pixel edge and a deeper shadow in the dark (`topbar.css`), and the drawer an edge, a deeper shadow and a darker backdrop (`menu.css`, 0.4 to 0.6). Checked on the built app in dark over Tel Aviv's centre.
- 2026-11-08: Three from the maintainer. The dark edge and darker backdrop go off the side drawer (he meant the bottom sheet, which gets the edge and a deeper shadow in the dark instead). Enter in the search box finishes the typing: the keyboard goes and the list stays, taking the room it freed; it no longer picks the first option. The list that scrolled only on the second try: the likeliest cause is its height, measured while the keyboard was still rising, taller than the room above the keyboard, so it had nothing to scroll and the first swipe panned the page; the list is now fitted again when the keyboard has finished rising (400 ms after it opens) and the moment a finger lands on it (the earlier guard that held it still under a finger is gone, it worked against this). To be confirmed on a phone.
- 2026-11-08: Dark mode done the way Google Maps does it (maintainer: "the edge is not good enough, we need a colour difference"): the interface's surfaces go near-black and neutral (`base.css`: surface #1a1d21 on bg #111316) and the dark map's ground becomes a lighter, tinted slate (`style.ts`, teal #232d2b, neutral #262b33), everything on the map a step up with it. Two colours apart, the bar and the sheet read against the map without an edge. Checked on the built app over Tel Aviv's centre.
- 2026-11-08: The result card's "also at" (maintainer): the leave line keeps the one time that includes the walk; the chips are now when each option's first ride leaves its boarding stop, the stop named once (or on each chip when they differ), every chip coloured by how sure its time is (`text/live.ts` sureness: green, the vehicle reported within four minutes, whatever the shift from the timetable; orange, an older report or no vehicle seen for a ride leaving within 20 minutes; red, a line whose times are estimates; plain, the timetable's time of a ride still far off); the card's own option in bold. Place rows in the search carry the place's address, the nearest house number within 120 m (`search.ts`), between its kind and its city.
- 2026-11-08: "I'm in the station and it shows a walking distance", the second time (2026-10-18 was the first). Two holes: the standing-at rule (60 m of a stop, 150 m of a railway station) lived only in the street-graph access, and before the graph is in the plan took the straight line with a detour and a 30-second buffer, a minute at least; and the rule itself gave up to 30 seconds, which the chip rounds up to a minute. Now one rule in `engine/streets.ts` (standingWalk: nothing at all when standing there) serves both ways (accessStops, airAccess), a zero walk leg is dropped from the journey as before, and `tests/access.test.ts` holds it, as the maintainer asked: a regression test over the fix.
- 2026-11-08: A stop's next departures, after the maintainer at HaShalom: a train listed earlier and delayed, not yet left, was missing, since the list took only departures listed from now. The worker now returns the hour before as well, marked early (`stops.ts` departures `back`); the page asks the live data about those too and shows an early one only while its vehicle is still to come, in its live place in the order (`state/stop.ts` visibleDeps; `tests/stopdeps.test.ts`). One that left, or one no vehicle reports, stays out of sight.
- 2026-11-08: "Why didn't our platform show the upcoming near line?" (the maintainer at Nordau station, Kfar Saba, 09:19; Moovit had line 8 leaving now, the app its next ride at 09:37). Replayed with that minute's snapshot: the planner matched the bus, standing 300 m short of the station, and put its departure at 09:19:23; the list was drawn after that, and its rule for a way that starts with a ride was "past its departure, gone", so the ride went to the just-left strip. Two rules now: the planner never moves a stop the vehicle has not reached to before now (`plan.ts applyLive`), and the list reads a ride whose vehicle was still short of the boarding stop, in a report fresh within four minutes (`FRESH_S`, the one freshness constant now, in `delays.ts`), as due: leaving now at the earliest, a card with "leave now" (`results.ts due`, `leaveAt`, `standing`; the leg carries `live.ahead`). A bus seen past the stop stays gone. Rejected: a wider look-back or a grace period on the time alone, which would also keep rides whose bus was seen leaving. Test `tests/planlive.test.ts`, the planner run on the worker's own loader with a tiny timetable (`tinytt.ts tinyContainer`).
- 2026-11-08: The card's departures, done as the maintainer asked after seeing Moovit beside it: every card says when its first ride leaves its stop and the next departures of the same route after it ("Leaves Rehovot: now · 20:56 · 21:24"), nearest as minutes, the rest as times, coloured by sureness; not only cards that happened to have several grouped options (the bus cards had none, and showed the old countdown). The "leave in N min" line for setting out and the "at the stop in N min" line are gone (maintainer: "I don't want the leave in x min"); the card's start time already includes the walk. The followers come from the plan itself (`nextDeparts`, on the timetable as live-shifted for that plan, with each trip's live knowledge), so their colours agree with the plan's. The collapsed sheet's line says the first ride and when it leaves instead of the countdown.
- 2026-11-09: "The train number is wrong, I'm on the 235" (the maintainer at HaShalom, 10:03: the detail showed train 233, listed 09:28, leaving 09:59 +31). Replayed from the minute files: the 233 pulled in to HaShalom at 09:39, eleven minutes late, and was still reported standing there, speed 0, past 10:05, its departure read as "now" and its lateness growing a minute a minute; the 235 came and left on time at 09:58-10:02 and the maintainer rode it. A train standing ten minutes past its due departure is now held (`delays.ts HELD_S`, from its trail): the planner leaves its trip on the timetable, so it is not boarded or shown as the way to go, and the badges and the stop page say "held at the station". Threshold from a morning's files (2026-11-06): of trains still standing 10 minutes past due, 27 of 38 never went on; 15 minutes, 18 of 19. Rejected: dropping such reports as frozen (the position is true, the train is there), and a shorter threshold (at 5 minutes a third still go on). Also: the chip of an earlier departure that arrives later reads "now · arrives at 10:46", not "now →10:46" (maintainer: "what is this 1046?").
- 2026-11-09: The chip of an earlier departure that arrives later (the train at the platform, 2026-10-22) no longer carries its arrival ("now · arrives at 10:46" under a card arriving 10:44 read as two answers; maintainer: "keep the now, remove the arrival time"). It stays dashed, with the tooltip.
- 2026-11-09: The 233 again, with the maintainer ("it was not held at the station; let's think this together"). The later minute files: the 233 reported every minute with a fresh timestamp and one unchanging position at HaShalom, speed 0, from 09:39 to past 10:17, while its call (the station it comes to next) moved on, HaGanah, Kfar Chabad 09:49, Lod 09:55, Beer Yaakov 10:01, at the running times between them: the train passed HaShalom at about 09:39, eleven minutes late, before the maintainer was on the platform, and ran on with a dead GPS. So the "held" state of this morning is withdrawn (it read a dead fix as a train standing; the morning's "never moved again" trains were the same dead fixes), and the rule is: a train whose call has moved on while its position has not changed for two minutes is placed by its call, as a train with no GPS is. A position frozen with speed is still dropped when the call has not moved yet. The planner shifts such a train from where its call puts it, so it is not boarded at a station it has left.
- 2026-11-10: "The train I'm on is NOT from 15:34" (the maintainer at Rehovot, 17:02: the way showed train 970, listed 15:34, leaving 16:56, +83; he rode the 268, which left at 16:57). The minute files: the 970, which starts at Rehovot, reported from the platform at speed 0 from 15:15 to past 17:01 and never ran. A first fix, "a train at its first station 30 minutes past its time gets no estimate", was stopped by the maintainer before it was committed ("you're doing these stupid exceptions again; we should have general logical robust rules"): it was the third patch on one hole, after the frozen-with-speed rule and yesterday's call rule. The hole: a vehicle that has not moved was read as leaving now, again every minute, on no evidence. The rule is now one quantity for every vehicle at every stop, stillness past due (how long it has stood since it was due to move on), measured before it was set (two days, 360,000 still spans; the figures are in `docs/architecture.md`, live times rule 8): up to 5 minutes nothing changes, past 5 it is not certain and expected to stand half as long again, and past 25 it gets no estimate. Checked on the bus backtest (2026-11-06 08:00-08:40) against the code before: as steady and as accurate (66% of times moving under 30 s a minute, 21% of watched stops going back and forth against 20%, the same shares within 2 minutes of the truth); the wait added from the first minute of standing was rejected there, 2 points more accurate and 8 points less steady. The worker remembers since when each ride has stood where it is and, on a fresh open, reads the snapshots of 3, 10 and 27 minutes before so it knows at once (the relay's `ago` now goes to 30); a history that may be too short shows as not certain. The two position contradictions (speed, call) are one notion, a dead position. Rejected: the per-case cut-offs (first station, trains only, "held"), and a single cut-off with no estimate of the further wait. `plan.ts` and the line page now take `stale` from the estimate, not from the report's age alone. The bus backtest feeds the worker's memory (`remember`) as the app does.
- 2026-11-10: The maintainer, after the 970: "all the time calculations displayed in the app are a terrible big mess; map everything, then simplify; if you have increased the amount of working code, there is probably a problem with your solution", and his finding: "you take the live locations as if they were always true reports; the train ones are glitchy in general". Measured on two days of raw reports: 10% of train reports name no position, 22% name one their own speed or next-stop field contradicts, half of all train rides do so at some point (a third for ten minutes or more); buses, one ride in a thousand. First step, the engine: every rule for a position that lies (frozen with speed, dead by its call, standing with a trail, held, not started, the wait added to a standing vehicle, the handover of an early number) is replaced by one, no news past due (`delays.ts noNews`: the very same position for two minutes after the vehicle was due to move is no estimate; standing within 100 m is uncertain past 5 minutes and no estimate past 25). The train-specific machinery around them is gone: placing a train by its next-stop field (measured worse than the timetable alone), the trails, the handover. `engine/delays.ts` and `worker/vehicles.ts` went from 1,136 lines to 906 and the train backtest improved on every line (typical miss 1.4 to 1.3 minutes, on-time trains shown late 0.6% to 0.2%, real delays shown 27% to 34%); the bus backtest is unchanged. `measure/trainbacktest.mjs` now runs the worker's own code instead of a copy of it. The fresh open reads the snapshots of 3 and 10 minutes before (not 27). Next: one path from that estimate to every screen.
- 2026-11-10: One path from the estimate to every screen (the second step of the simplification; the map of what was there before showed the same ride's departure worked out in ten places, five rules for "gone", two for "now", refreshes at 20, 30 and 45 s or never, and cards frozen at the moment of planning). The maintainer's line: a plan has times, and the screen works nothing out. So: a plan carries the listed times; the worker gives one answer per trip (`vehicles.ts liveTrips`: its time at each stop, how many it has passed, whether that is sure), the planner routes on it and hands the page the same; the page keeps it in one store (`state/live.ts`) filled by one look every 30 s for the trips the screens show (`controllers/live.ts`); `trip/now.ts` turns a plan into the trip as it stands now, and every screen draws that. Gone with it: each screen's own vehicle fetch, matcher and timer (`liverides`, `livepoll`, the stop, station, line, detail and follow lookups, the page's `matchTrip` and `estimate`), the plan-time `live` on legs with `due`, `leaveAt` and `rideAt`, the stop page's `early` flag, the dead "restored results" path, and the plan's live times from Hasadna's database when the relay fails (times are never drawn from data fifteen minutes old; the map's dots still fall back to it). One rule decides what a list of departures still shows (`toCome`), so the stop page no longer says "now" for ever and a late ride listed earlier is in every list. The line page's "minutes before or after your stop" are the timetable's. `src/` is 444 lines shorter than this morning (972 added, 1,416 removed); the tests are scenarios of the cases met on the road (`tests/now.test.ts`, `tests/planlive.test.ts`). Checked in a browser on live data: the card, the detail and the follow screen showed the same time for the same bus. Not done: the browser suite in `tests/e2e` needs a locally built site and was not run.
- 2026-11-11: The search results no longer refresh on their own (maintainer: "part of the weird behaviours are caused by the plans refreshing on their own; when we search and get results they shouldn't refresh automatically; maybe add a refresh button"). This takes back one part of 2026-11-10, where the cards followed the store every 30 s and the clock every 20: a card changing its time, its place or its strip under the rider's finger read as a fault. A search is an answer as of when it was asked: the list is a function of the plan, the live times it was routed on and that moment (`state/results.ts`); the words still count down, a departure whose time has gone by is struck through, the head's "live times as of" turns orange after 4 minutes, and Refresh beside it asks the same question again (a new plan, from now if it was from now, the chosen order kept). The results are no longer watched by the look; a journey opened from the list is handed what the list knew, so the detail and the follow screen open on the card's times and follow live from there, as do a stop, the trains between two stations and a line. Rejected: bringing the list up to date behind a screen opened over it (the rider comes back to a list that is not the one they left); freezing the detail too (it holds the list of each ride's other departures, which is a live board, and a frozen head over it would say two things on one screen).
- 2026-11-11, later: The line drawn again by the maintainer, after the first cut froze the results whole: "the live times and such can update on their own, that's fine, but the trips themselves I think not". So the trips of a search stay and their times follow: which ways are listed, their order, which departure each card shows and what is filed as "hurry" or "just left" are decided once, as the plan is answered (`state/results.ts frame`); the times on them come from the live store and the clock as on every other screen (the results are watched by the look again). A card whose ride has gone since stays in its place, dimmed, its chip struck through, where before it jumped to the "just left" line or became the group's next departure. Refresh stays the one way the trips change. Gone with this: the head's orange "aged" note and the hand-over of a plan's times to the screen a journey opens on (the store holds them again).
- 2026-11-12: A Hebrew word typed finds a name written in Latin letters (maintainer, after "בלוק תל אביב" did not find The Bloc TLV: "it's time to add the behaviour that does find English by searching Hebrew"). This ends the 2026-11-01 line ("no transliteration"): 40,351 of the book's 156,935 places (26%; 28% in Tel Aviv) are named in Latin letters only, in OpenStreetMap and Overture alike, and none could be found in Hebrew. The rule: the same whole word, three consonants or more, by an exact form of the consonant skeleton (ב is b or v, never w; a consonant ו is v or w, never b; a ו read as a vowel sits where the Latin word has its o or u), scored as a sound-alike below a Hebrew word found as typed; half-typed and misspelt words are left to the Hebrew names. Measured on 104 everyday searches against the live book: the 12 typed in Latin letters give the same results as before, 87 of all are unchanged, and the 16 that changed gained Latin-named places (Wolt, Google, Microsoft, Starbucks, Adidas, CrossFit, the Bloc), four of them as first result; search time unchanged (the candidates come from an index). Rejected on the way: the plain skeleton both ways (וולט listed ballet schools above Wolt, בלוק three places named Walk, ביסטרו a visitor centre, since it has one letter for ב, ו, b, v and w and no vowels), and reading the Hebrew word through the app's transliteration with typo matching (Hebrew writes few vowels: סטארבקס comes out "Starvakes"). Known limits: a Latin c said as s (סנטר does not find a Latin-only "Center"), a Latin x (פוקס does not find "Fox"), and a few look-alikes low in a list (בלט also lists "Ability").
- 2026-11-12: The timetable keeps where a trip may not be boarded or left, and the router obeys it (maintainer, with "the worst plan we've ever created", 01:24 to Bograshov Beach: the 480 to Jerusalem from Azrieli two stops to HaMasger, the 480 from Jerusalem on to Reading, the 445 back to Gordon Beach). The Ministry's feed (https://gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip, stop_times.txt) marks every Tel Aviv stop of the 480 to Jerusalem `drop_off_type=1` (boarding only) and every Tel Aviv stop of the 480 from Jerusalem `pickup_type=1` (alighting only), so neither ride exists; the compiler had never read the two columns. In the feed of 2026-11-11: 744,581 stop times boarding only and 776,969 alighting only, of 10,794,725 (14%); 77,871 of 281,983 trips (28%) have such a stop along the way, on 3,090 of 8,079 routes (all buses but 14). `compile.py` writes them as `patStopFlags` beside `patStops` (trips with different marks are different patterns; the count of patterns did not change), the router boards and arrives only where allowed, and so do a card's next departures, a leg's other rides, the easier change and a stop's departures (`canBoard`, `canAlight`). On the feed's Thursday night at the same place and hour the way "480 from Azrieli one stop, then the 445" is gone and the other ways are the same. Not done: the line page and the stop page do not yet say "boarding only" or "drop-off only" beside such a stop. Separate, and open with the maintainer: the walk limit is a hard cut (that night a direct 445 needed a 25-minute walk against a limit of 20, and walking all the way took 58 minutes against the plan's 85).
