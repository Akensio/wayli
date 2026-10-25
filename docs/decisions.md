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
- 2026-10-18 Gadi: the phone's back button must go back inside the app, and
  rides must follow their real course, not straight lines between stops.
  Overlays and tab changes became history entries (popstate closes them);
  the feed's shapes.txt is compiled to a 3.6 MB courses file loaded last,
  and each day's file records where every stop falls on its pattern's
  course. Rejected: routing rides along the street graph (wrong for rail,
  approximate for buses) and per-day shape files (the courses hardly change,
  one cached file serves every day).
- 2026-10-18 Gadi: search by line number; tap a station on the map to see
  its lines. Line search and a line page (course, stops, the line's
  vehicles now with their delays, other directions); the live map's stops
  open the stop page with its lines and departures. Gadi also floated a
  map-first home screen; not decided, see the discussion in the session.
- 2026-10-18 The feed has no shapes for trains, so train courses come from
  OpenStreetMap railways routed station to station (`pipeline/rail.py`),
  stored once per station pair in the day's file. Rejected: drawing trains
  stop to stop (Gadi's own example was a train) and asking Israel Railways
  for geometry (no open source of it).
- 2026-10-18 Gadi: the dark map lacks the light map's detail (3D shapes,
  road types, stops); show each live vehicle's direction; the build time
  must be Israel time. The dark map is now Liberty itself recoloured at
  runtime (Fiord dropped); vehicles carry heading arrows; times shown are
  Israel time everywhere. Rejected: hand-maintaining a dark style JSON
  (Liberty changes under us) and a server-side style (a server).
- 2026-10-18 Gadi: the ride's map must show the whole line, faded where he
  is not on it, and every live vehicle of it. Done on the journey and
  follow maps; the planned trip's vehicle is ringed. Also fixed the same
  morning: vehicle markers stretched across the map (a stray position
  rule), train courses dotted at every bend (dots now come from the stop
  list), and the service worker's shell cache is keyed by the build so
  every deploy refreshes the app on the phone.
- 2026-10-18 Gadi: tapping a vehicle on a map must show a bubble on the map,
  not open a page. Bubbles (MapLibre popups) for vehicles and stops on every
  map, with buttons to the pages; the live map's bottom card is gone.
- 2026-10-18 Gadi, at Rehovot station: "why a 2-minute walk, I'm in the
  station?" and "the train is 18:24, delayed to 18:29; where does 18:28
  come from?" Standing at a stop (150 m for a railway station) now counts
  as being there, and nearby walks are capped by the straight line. 18:28
  was the position-based delay estimate (+4, the official figure was +5);
  the detail now shows the scheduled time struck through next to the live
  one, and a bug that lost the live badge on refresh (the shifted first
  departure was used as the matching key) is fixed.
- 2026-10-18 Gadi, on the proposal for a map-oriented interface: "let's do
  it". v0.3 is map first: one map under everything with the live vehicles
  always on it, a floating search bar for places and line numbers (a
  destination plans from where you are), a bottom sheet with three heights
  for every panel, a menu instead of tabs, picking a point and following a
  trip on the same map. Rejected: keeping the tab bar with a map tab (the
  map is the home, not a destination), one map per panel as before (five
  maps on a phone, each refitting), and a framework for the sheet (a few
  pointer events do it).
- 2026-10-18 Gadi: the accent colour is turquoise, not orange (and not
  cyan): #12998b in light mode, #2fcfbc in dark, a darker shade for text
  links; icons and the theme colour follow.
- 2026-10-18 Gadi: while following a trip, "recalculate" when delays on
  the road make it better to get off early and take another line. Built as
  a periodic re-plan from the next stop with live vehicles, proposed as a
  card with one tap to switch (details in architecture.md). Rejected:
  switching automatically (the rider is on a vehicle; a surprise change is
  worse than a late one) and re-planning every minute regardless (data use
  on the phone; it runs when the ride is late, the vehicle is missing, or
  every five minutes).
- 2026-10-18 Gadi: a friend could not find her street הל"ה in Givatayim
  ("לה", "הלה"). The normaliser turned the gershayim into a space, making
  two words, while her spelling lost its leading ה and matched "לה
  גוארדיה". Now a quote inside a word is part of the word (streets, stops,
  places, cities, in the app and the pipeline), and stops and places are
  ranked together on one scale (whole words over prefixes, full names over
  partial ones, nearness, a stop ahead of a street at equal strength)
  instead of five stops always first. Rejected: fuzzy matching (edit
  distance) for now; the misses so far were normalisation, not typos.
- 2026-10-18 Gadi: on the map, show only the lines relevant to the current
  search, and when he taps a ride and sees its course, only that line. The
  live layer now follows the view (the results' lines; nothing while a
  journey, line or followed trip draws its own vehicles), and a tap on a
  ride leg in the journey detail focuses it. Rejected: a manual filter
  switch on the map (one more control; the view already says what is
  relevant).
- 2026-10-18 Gadi: "we have search both on top and below the map; only on
  top". The top bar is now the whole planner (destination field; origin
  row once a place is set; swap), and the sheet's plan screen keeps only
  the options, results and recent searches. Rejected: a single field with
  the origin as a chip inside it (too tight on a phone).
- 2026-10-18 Gadi, same evening: "I meant the live dots too, no need for
  tons of irrelevant buses", and "why a 21:57 dot at 22:19?". With nothing
  searched the home map now shows only the lines of the stops within
  500 m of him (everything when he looks elsewhere), and a vehicle more
  than five minutes behind the feed's newest report is dropped. Rejected:
  an absolute age cutoff (the feed itself lags by 10 to 20 minutes, so it
  would blank the map).
- 2026-10-18 Gadi: operators have their colours, Egged green, Metropoline
  orange; colour lines by operator. Done with one table of approximate
  brand colours (architecture.md lists them and their sources); light
  rail is red now so Kavim can be purple. Rejected: the feed's
  route_color (set for few routes, and the same FF9933 across operators).
- 2026-10-18 Gadi: "why does the compilation take 9 minutes?" Every push
  recompiled seven days. The compiled days are now cached by the feed,
  the graphs and the compiler's source; app-only pushes deploy in about
  two minutes. Rejected: a separate app-only workflow (two deploy paths
  to keep consistent) and committing the compiled data (100 MB a day in
  git).
- 2026-10-18 Gadi: the planner must not sit below the map at all ("stop
  reusing that element"). The options moved into the top bar as a third
  row of chips (when; bicycle) with their details in a card hanging off
  the bar; the sheet's plan screen is results and recent searches only.
- 2026-10-18 Gadi: station dots need icons; the longest walk needs a finer
  setting. Stations (rail, light rail, bus stations) are badges with the
  mode's glyph, one per station; the walk is a stepper (minus, the
  number, plus; the number can be typed). A slider was tried first and
  rejected by Gadi at once: an exact value among forty is not a slider's
  job on a phone.
- 2026-10-18 Gadi: label the two rows (to / from), start clean and let
  back clear the fields, a clear Go button on top, and the clock reads
  "now" unless he sets a time. All four done; a plan is a history entry
  so back clears it.
- 2026-10-18 Gadi: the bar should first ask "where do you want to go?" and
  open into the two rows on a tap; the language toggle belongs in
  settings. Done; the EN button is gone from the bar.
- 2026-10-18 Gadi: the hamburger menu "opens kinda weirdly" (a floating
  dropdown with no motion, detached from the button). It is a side drawer
  now, over a dimmed map, closed by a tap outside, its ✕ or back. Found
  on the way: a pushState right after a programmatic history step back is
  swallowed by it; pushes now wait for that step to land.
- 2026-10-18 Gadi: a button to align the compass, and the tilt with it.
  MapLibre's compass control does both; it is shown only while the map is
  rotated or tilted.
- 2026-10-18 Gadi: picking on the map by moving the map under a crosshair
  is annoying; tap a spot, get a pin with a bubble and a confirm, tap
  elsewhere to keep looking. Done; a tap on a stop picks the stop itself.
- 2026-10-18 Gadi: the train's course near HaShalom was a tangle. Cause: the
  rail router snapped each station to its single nearest track node, which
  on the four-track Ayalon corridor could only be reached past the station
  and back over a crossover. Now a station meets every nearby parallel
  track at the closest point and the search chooses the track; the gap from
  the station to the track counts double so it meets the track beside the
  station.
- 2026-10-18 Gadi: modernise the settings and every icon. One hand-drawn
  stroke icon set as an SVG sprite replaces all emoji, including the
  station badges on the map (drawn from the same paths on canvas), and
  ordinary bus stops get a small badge close up; settings are grouped lists
  with switches and pill segments.
- 2026-10-18 Gadi: the sheet was hard to pull up by its thin handle. It is
  now dragged from anywhere while collapsed or half open (the half size no
  longer scrolls; a pull opens it fully), the handle is taller.
- 2026-10-18 Gadi: a user icon attached to the search bar instead of the
  floating hamburger. The round button sits inside the pill at its start
  edge and opens the same drawer, now headed by the avatar and "no account,
  everything stays on the phone". He also said the two-row to/from bar can
  stay as designed (he had asked for a single box earlier).
- 2026-10-18 Gadi: once a plan is made the top bar should fold into one
  summary box over the to/from/time/bike rows (the folded card he had once
  told me to scrap was, he says, the one good thing in that batch; the rest
  deserved scrapping). Done, on top: a tap reopens the rows.
- 2026-10-18 Gadi: stops on the plain map are hard to tap and not clearly
  stops, and the basemap shows its own squares for them. The basemap's
  transit symbols are hidden, our bus-stop badges start at zoom 15, station
  names sit under our badges, and a tap within 14 px of a stop opens it.
- 2026-10-18 Gadi: "something like the plan-a-trip view for simply tapping
  where you want to go". A tap on the bare map (sheet collapsed) drops a pin
  with the place's name and "to here" (plans at once) / "from here" (opens
  the bar on the destination field).
- 2026-10-18 Gadi asked whether suggestions should hang below all the boxes
  rather than under the field being typed in; he was unsure. Recommended and
  done: it never hides the other field and the list does not jump between
  rows; one CSS rule to undo.
- 2026-10-19 Gadi: "why is everything reported 15 min ago and still on the
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
- 2026-10-19 Gadi: when the bar opens, the "from" row goes above the "to"
  row, and "from" starts filled with "my location". Done; the location is
  resolved when the plan is made, so an empty-handed open costs no GPS fix.
- 2026-10-19 Gadi: dragging the sheet is still tough. Cause: the chip strip,
  which fills most of the collapsed sheet, was excluded from the drag to keep
  its sideways scroll, so only the thin handle grabbed. Now a start on the
  strip drags unless it moves sideways, a 40 px pull steps one size, and
  the fully open sheet is pulled down by its top 96 px as well as the handle.
- 2026-10-19 Gadi: the green "leave in n min" on a result card should be
  green only when the line has a live location. Done: green when the first
  ride's vehicle reports (and is not stale), plain ink otherwise; the
  results header still says which time the live data is from.
- 2026-10-19 Gadi: orange when the live location carries big uncertainty.
  Live colours now mean confidence everywhere (result cards, legs, stop
  departures, bubbles, the follow badge): green a report under four
  minutes old, orange an older one (still marked ?), plain the schedule.
  Lateness is the number alone; orange no longer means "3+ minutes late".
- 2026-10-19 Gadi: with the sheet fully open and the list at its top, a
  scroll down should fold the sheet. Done with touch events (the pull is an
  overscroll the browser does nothing with); a swipe that starts scrolled
  down scrolls as before.
- 2026-10-19 Gadi, on a train that had left before the list's "now": how
  to resurface the ride he is on, to start following it. Done: a plan from
  now looks ten minutes back, what left goes in an "already left, on
  board?" strip above the list with an "I'm on it" button, and a trip
  started after its first ride left begins on board (the follower used to
  wait up to 15 minutes at the walk to the stop). Considered for later: "I'm
  on this one" from a vehicle's bubble on the map, planning the rest of the
  way from that very vehicle.
- 2026-10-19 Gadi: the strength of the pull should decide midway or all
  the way. A flick goes all the way; a slow pull steps or lands where let go.
- 2026-10-19 Gadi: recents that keep the time of the search and "search
  backwards", because "my location" moves with him once he is on the
  vehicle. Chosen instead: the last search is restored as it was for an
  hour (own origin, own time, on-board strip applied), also from its recent
  chip; a fresh plan is "plan again from now". No backwards search needed.
- 2026-10-19 Gadi: the locate and compass buttons go in a bottom corner.
  Bottom-right, above the sheet, hidden with the map under a full sheet.
- 2026-10-19 Gadi: the +1/+6 on the buses of a journey's map were unclear.
  They are minutes late per vehicle; now only the vehicle running the
  rider's ride carries its number, the others show it in their bubble.
- 2026-10-19 Gadi likes the tilt and rotation; "make it look 3D-like".
  Done with what MapLibre 4.7 gives for free: a sky and horizon haze when
  tilted, the pitch limit raised to 72°, a low side light that shades the
  extruded buildings. Not done: 3D terrain or hillshade (needs elevation
  tiles, e.g. AWS Terrain Tiles, a few MB per session; flat in Tel Aviv,
  worth it for Haifa and Jerusalem, Gadi's call).
- 2026-10-19 bug from a friend on iPhone: "Can't find variable: when" on
  every plan. A leftover `void when` in the recent-searches renderer read a
  loop-scoped name; Safari threw it into the plan's error handler, which
  wiped the results. Removed; an eslint no-undef scan of every module is
  now part of the checks.
- 2026-10-19 Gadi: "add to home screen" does not work on iPhone. iOS never
  fires the install prompt; the row now shows on iPhones with Safari's own
  steps. Pull-to-refresh did not work anywhere: the collapsed sheet now
  leaves a pull down to the browser, and the drawer has "reload the app".
  The 3D ask was about the compass button, not the map: a needle with depth
  in real perspective; the map's sky and light stay, they cost nothing.
- 2026-10-19 Gadi asks about a future stack (TypeScript, React, strict
  lint) so such bugs cannot happen. Answer in the conversation and here:
  the bug class is "undeclared name", which eslint no-undef (now in CI) and
  TypeScript both catch; React would not have, and the no-framework,
  no-build-step rule stays. Path if wanted: TypeScript's checkJs with JSDoc
  first (no build step), then .ts with tsc in CI; measured today: checkJs
  with strict off reports 114 findings, 97 of them DOM typing.
- 2026-10-19 Gadi: screens that need no map (settings, saved, the place
  chooser) should be whole-screen pages, not the sheet over a map. Done:
  the sheet becomes the page, with its own header.
- 2026-10-19 Gadi: the half-open sheet could not be scrolled; his earlier
  ask had been misread. Now half and full both scroll, and only a pull past
  the top edge folds the sheet or past the bottom edge opens it.
- 2026-10-19 Gadi: the live note "אין רכבים בשידור באזור הזה · רק קווי
  החיפוש" was broken Hebrew (two fragments glued). It is now a sentence per
  case, in both languages.
- 2026-10-19 Gadi: map look should be light / dark / like the device, and
  the menus should have the same setting. Done; the old map value "auto"
  (light) reads as "device".
- 2026-10-19 Gadi: pull-to-refresh still did not work. Cause: the sheet
  body's overscroll containment stopped the gesture from chaining to the
  page even when collapsed, and the handle said touch-action none. Lifted
  for the collapsed sheet; the pull up there moved to touch events.
- 2026-10-19 Gadi: after the pull-to-refresh fix, pulling the sheet up got
  "stuckish and inconsistent". Cause: `pan-y` let Chrome claim the upward
  drag too (nothing scrolls, but the gesture is taken and touch events are
  throttled), and a tiny quick nudge counted as a flick. Now `pan-up`, which
  hands Chrome only the finger-down swipe, and a flick needs 30 px of travel.
- 2026-10-19 Gadi: the "already left, on board?" rows on top of every plan
  were confusing; most of the time the rider wants the next departures.
  Now a fresh plan shows one quiet line that opens on a tap; a plan
  restored from earlier shows the rows at once (that is the rider who
  boarded and came back); the rows are calmer, four at most.
- 2026-10-19 Gadi: the sheet is still stuckish and oversensitive for the
  full opening. The flick rule ("fast means all the way") was wrong for a
  phone, where every pull is fast: speed now steps one size, like
  Android's sheets, and only a long drag past the midpoint goes all the
  way; the dead zone at the start of a drag shrank from 8 px to 4.
- 2026-10-19 Gadi: the sheet still sticks when the drag starts on the chip
  strip, and pulling down on the search box does not refresh. Cause of
  both: the browser claimed gestures (the strip is a horizontal scroller;
  its pull-to-refresh never fires on this fixed page). Decided: the app owns
  them. touch-action none on the bar's controls and the collapsed sheet; the
  strip scrolls by script; pull-to-refresh is the app's own circle on the
  bar and the collapsed sheet. Rejected: more touch-action tuning (three
  rounds spent).
- 2026-10-19 Gadi: the bluish flash on tapped buttons (the browser's tap
  highlight) goes; feedback of our own instead: press-down, tint, ripple.
- 2026-10-19 Gadi: the friend's "add to home screen" was Chrome on iPhone.
  Covered by the iPhone row (same user agent family), but the hint named
  Safari; it now names the browser in hand and where its share button is.
- 2026-10-19 Gadi: the sheet's slide is not smooth, "how many hacks did we
  add?" Five gesture layers, but the stutter was the oldest piece: the sheet
  moved by animating its height, a layout on the main thread every frame.
  It now slides by a transform (composited); the gesture rules stay.
- 2026-10-19 Gadi: "no way there are no buses around there right now"
  (Azrieli, 15:33, the map said no vehicles reporting). A real bug: a
  vehicle counted as fresh only within five minutes of the newest report
  seen anywhere, and Hasadna's lag is uneven by area (Tel Aviv's newest was
  20 minutes old, the country's 6), so a whole area fell off the map. Each
  set is now judged against its own newest report; the note still says how
  old the data is.
- 2026-10-19 Gadi: "do they always lag so badly?" Measured on Hasadna's own
  snapshot log: the ETL of each minute's snapshot starts 10 to 25 minutes
  after it (median 15, p90 19) in every daytime hour today, the same
  yesterday and on 2026-10-15, and a quarter of today's minutes had not
  loaded at all by the afternoon. It is the cadence of their pipeline, not an
  incident, so a position on the map is a quarter of an hour old by design;
  the delay a bus reported then is still the best estimate we have. Fresher
  data means MOT's SIRI feed directly (a key and a relay), which stays the
  fallback plan.
- 2026-10-19 Gadi: station names on the map are Hebrew while the app is in
  English. The feed's translations.txt has English and Arabic for most stop
  names, so the compiler carries English names (stops, stations, cities,
  headsigns) in the timetable header, the worker hands out names in the
  app's language, search matches Hebrew and English alike, and the basemap's
  own labels follow the setting too (one name per label instead of Latin plus
  Hebrew). Arabic waits for an Arabic interface; the data side is a flag.
  Rejected: a separate names file translated in the app at runtime (one more
  download and a map by stop id for no gain).
- 2026-10-19 Gadi: "it doesn't find an existing address" (Havradim 4
  Givatayim, typed in Latin letters) and the from/to boxes were "a mish
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
- 2026-10-19 Gadi: tapping the search bar did not open the recents and "my
  location" list; it opened only from the From box. The list did open, and
  the tap that handed the box focus (the clear button, the Go button) closed
  it again as a tap outside it. A tap within half a second of the focus no
  longer closes it.
- 2026-10-19 Gadi: with the keyboard open the list is taller than the
  visible screen, so scrolling it pans the page and the from/to boxes slide
  away. The list now ends above the keyboard (the visual viewport) and
  scrolls inside itself, without scroll chaining to the page.
- 2026-10-19 Gadi: "maybe it's time we remove" the chips in the collapsed
  sheet (plan, home, work, recents, nearby). Agreed: the search pill and its
  list offer the same, nearby stays in the drawer. The collapsed sheet is
  now a handle, plus one line about the highlighted way when there are
  results. The strip's sideways-scroll gesture code went with it.
- 2026-10-19 Gadi: show the alternative ways on the map, as road-planning
  apps do, with a per-route toggle in the list. Built the Google Maps model
  plus his toggle: the first three ways drawn together, one highlighted in
  colour, the others grey with a minutes pill; a tap on a grey route or pill
  highlights it; a card's map button shows, highlights or hides its way.
  Rejected: a highlight-only tap on the card (a card tap opens the detail,
  as before) and drawing every way (clutter; the toggles add more).
- 2026-10-19 Gadi: the top search "more pill-like"? Yes: the field, the
  summary box, the chips and the Go button are full pills now.
- 2026-10-19 Gadi: a small x inside each text box to clear the text while
  searching. Added to every search box (to, from, the place chooser): shown
  while the box has text and focus, it clears the text, keeps the keyboard
  and brings the recents list back. The round X beside the To box still
  clears the whole plan.
- 2026-10-19 Gadi: the search pill jumps down when the From row opens above
  it, and the X and swap placement "is weird". The pill (and the summary
  box) now sit one row lower at rest, so opening the From row above them
  moves nothing; while editing, a back arrow starts the From row and the
  swap sits at the end, centred between the two rows, as in Google Maps.
  Back returns to the summary when a plan is shown, else to the plain pill;
  clearing a plan is the summary's X.
- 2026-10-19 Gadi: the collapsed sheet sits too low for Android's swipe-up
  gesture strip; the collapsed height gains 16 px (plus the bottom inset of
  an installed app) so the handle clears it. Filling the collapsed sheet
  with content: "maybe not needed", left as the one line.
- 2026-10-19 Gadi could not find the line search and the nearby stops.
  Both exist (a number typed in the search box lists lines; "stops near me"
  is in the menu), so the menu gets a "search a line by number" entry that
  opens the box with a numeric keyboard, and the nearby screen now opens as
  a half sheet with the map showing the rider's position, a ring out to the
  farthest listed stop and the stops highlighted. The lines near the rider
  are the live layer's "lines near me" already.
- 2026-10-19 Gadi: sorting and filtering of results ("single-stop"). Chips
  over the list: Direct, Train, and a sort that cycles by departure,
  arrival, fastest, fewest changes; remembered across plans. Rejected: a
  filter panel (the chips are one tap each).
- 2026-10-19 Gadi: trip tracking "a little messed up", with a screenshot at
  00:51 of a plan for "Tonight 08:00" whose Start said the trip was over.
  After midnight the planner stays on the night's service day, so a morning
  time landed on the past morning; a time from 03:00 on typed at night now
  moves the day to the coming one. Start is disabled, with the reason, when
  the trip is over, instead of a toast after the tap. The ride line read
  "1 · דן stops" in English: a bidi artefact of a Hebrew operator name in an
  English sentence; operators now show English names (a table in the app)
  isolated with <bdi>, and "1 stop" is singular.
- 2026-10-19 Gadi: home and work need a choose-on-map option. The chooser
  had it as a chip under the box; it is now also a row in the list that
  opens with the box, like the To box's own.
- 2026-10-20 Gadi: the municipal weekend (Shabbat) buses are missing.
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
  mean inventing headways; Gadi decides between asking the municipality or
  HopOn for the schedule file, estimated headways labelled as such, or
  showing the lines on the map without times.
- 2026-10-20 Gadi: lowering the search pill at rest was "a bad design
  proposition"; what he wanted is the installed app's look of map apps,
  the map continuing under the phone's status bar instead of a coloured app
  bar, while the website keeps the pill at the top. Reverted the lowering
  (the From row now slides in above the pill instead); the status bar takes
  the map's ground colour (theme-color follows the map setting, light
  #f8f4f0 or dark #141210) and on iPhone it is translucent over the map.
- 2026-10-20 Gadi: the options panel (clock, bike, "plan trip" next to Go)
  is "a weird old relic". Rethought: the two chips each open a small
  popover, when (depart or arrive, the days as pills, now or a time) and
  bicycle (none, to the stop, take it along; folding appears when a bike is
  chosen). Changes apply to the chip at once; a tap elsewhere closes the
  popover and, when a plan is showing, re-plans it. The "plan trip" button
  is gone: Go is the one button. Rejected: a full options sheet (too much
  for two choices).
- 2026-10-20 Gadi, on third thought: the lowered pill is nice, it was the
  coloured top in the installed app that annoyed him; with the status bar
  now continuing the map, the pill stays a row lower at rest. The pill
  carries the app's logo at its end beside the user button at its start,
  ahead of accounts. Entering search mode animates: the origin row slides
  in above, the options row under, back and swap pop in, the pill narrows
  smoothly; the summary box and the suggestion list slide in too.
- 2026-10-20 Gadi: a better colour palette for the roads and such, light and
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
- 2026-10-20 Gadi: the app icon at the start of the pill and the user at
  its end; a tap on the icon starts a search like the rest of the pill, a
  tap on the user opens the menu. Done.
- 2026-10-20 Gadi: the map palette should carry the app's turquoise rather
  than yellow. Motorways, water, parks, casings and labels now take a tint
  of the brand colour (#12998b) in both modes; land, streets and buildings
  stay neutral so the transit lines keep the strongest colour on the map.
- 2026-10-20 Gadi, installed app: "the map doesn't continue all the way to
  the top". On Android it cannot: Chrome keeps the status bar as a strip of
  one colour and no web app draws under it (only display "fullscreen"
  removes it, taking the clock with it). The strip now takes the exact
  ground colour of the current palette, so it continues the map's ground;
  on iPhone the status bar is translucent and the map runs under it.
- 2026-10-20 Gadi: the neutral palette "is not bad" either. Both stay: a
  "map colours" setting, turquoise (default) or neutral, each light and
  dark, so he can compare on the phone.
- 2026-10-20 Gadi, two screen recordings: a reload "is jumpy as hell" and
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
- 2026-10-20 Gadi, on the reload again: "something from the side gets
  drawn and removed very jumpily". That was the menu drawer: the page
  starts right-to-left, English flips the direction a moment later, and
  the drawer's transform animated from the right edge to the left edge
  across the screen. The language and direction are now set before the
  first paint, and the drawer has no transition until the app has booted.
- 2026-10-20 Gadi: both option chips glowed when one popover opened (only
  the open one now); bus stops on the map are small and some seem missing
  (the dots and badges are a third larger, badges never yield to labels; a
  stop without service that day is still left off, by design).
- 2026-10-20 Gadi: "we lost the ability to clear an active search": the
  user button, moved to the pill's end, covered the summary box's clear X.
  In the summary the user sits at the start and the X at the end. And the
  search-mode motion "still not as smooth as I imagine": the pills changed
  width when the side buttons appeared, a layout animation the browser
  cannot keep smooth while the keyboard rises. The pills now keep their
  width: the back arrow sits inside the origin pill, the swap floats over
  the pills' end between the rows, and only transforms and opacity animate.
- 2026-10-20 Gadi: the user button hid the summary's X ("the person icon can
  disappear for that"): gone from the summary box. Search mode is now a
  sequence: the pill shortens, the origin row slides in, the time chip, the
  bike chip and Go grow in one after another, then the recents list unfolds;
  the keyboard is held for a third of a second so it never rises during the
  layout change; leaving plays it back in reverse. The day pills wrap onto
  two rows so every day shows (half seemed "blocked" off the edge of a
  scroller); a calendar was considered and rejected for seven days of data.
- 2026-10-20 Gadi: "let's do the Preact refactor, as modular and readable
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
  casing and ride) since Gadi found the operator colour too faint; the other
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
- 2026-10-20: From Gadi's test of an arrive-by-19:00 trip (Rehovot to Tzavta):
  arrive-by now ranks only the journeys that arrive in time; ranked with the
  rest, a later journey with fewer changes arriving a few minutes past the
  deadline knocked out one in time and was then dropped itself, so the latest
  workable departures went missing. The back arrow in search mode ends the
  search like the summary's X (Gadi: leaving the boxes should clear it); a
  tap on the map still folds the rows back to the summary. Departure and
  arrival times read left to right with the arrow between them in both
  languages (Gadi: early time on the left). The sort chip opens a small menu
  instead of cycling. The logo in the search pill is drawn from the theme's
  colours, so it follows light and dark (the home-screen icon stays fixed:
  the system draws it).
- 2026-10-20: The address book takes everyday places too (Gadi could not find
  the restaurant האחים: it is in OpenStreetMap, but the pipeline kept only
  landmarks). Added: food and drink, hotels, hostels and guest houses, any
  named shop or office, pharmacies, banks, post offices, schools,
  kindergartens, places of worship, galleries, gyms, pools, bike and car
  rental: 16k places become 49k, 2.1 to 2.9 MB gzipped. They rank level with
  streets (landmarks keep their lead), checked over twenty searches: street,
  address and landmark answers are unchanged. Left out: fuel, parking,
  playgrounds and the like (rarely named, rarely a destination by transit).
- 2026-10-20: Trains are never hidden behind buses (Gadi's arrive-by-19:00 trip
  from Rehovot: the 17:34 and 17:56 trains were missing; only the 17:24 came
  through). The router keeps, per departure, only the earliest arrival, and
  ranking dropped a journey when another left later and arrived earlier or
  saved a change: a bus 277 a minute faster hid each later train. Now every
  plan also runs a train-only search, and journeys with a train and without
  one are ranked apart. Measured over 70 random morning trips: 10.2 to 10.5
  journeys on average, 6 trips gain a train option, planning time unchanged
  (about 135 ms in Node). Rejected: lowering the transfer penalty (it would
  not bring back the direct train, which a faster bus beats outright).
- 2026-10-20: From Gadi's notes: a tap on the map no longer drops a pin that
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
- 2026-10-20: From Gadi's notes: the time choice is Now / Depart at / Arrive
  by; the last two show three scroll wheels (day, hour, minute) in one row,
  like an alarm clock, replacing the day pills and the time field. The chip
  stays short ("By 19:30", the day only when not today). Changing the day no
  longer resets a chosen time to the default.
- 2026-10-20: From Gadi's screenshot (a walk drawn straight through the
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
- 2026-10-21: From Gadi's notes: leaving search mode no longer flashes the
  rows away for a frame before they play out (the play-out now starts in the
  same moment); the user button is a three-line menu button and the drawer
  is headed by the logo; the drawer closes with a swipe towards its edge;
  settings is a page sliding in over everything and out again, leaving the
  drawer open under it. Saved stays a screen in the sheet for now: its
  place chooser and map picker live in the sheet and would open under a
  layer. Also: with only "my location" set, closing a panel leaves the sheet
  folded instead of half open and empty.
- 2026-10-21: From Gadi: the menu button takes the old user button's look
  (a turquoise disc), now with three lines, and moves to the start of the
  pill with the logo at its end; its press is the disc giving and the lines
  drawing together, springing back on release, instead of the "bump down"
  (which was the press shrink replacing the centring transform; every
  centred button in the bar had it).
- 2026-10-21: From Gadi's screenshot: "from → to" lines (recent searches,
  saved trips, a ride's summary) isolate each name (`ui/FromTo`, `<bdi>`), so
  a Hebrew name in English or an English one in Hebrew no longer reorders
  the line, and the arrow points the way the interface reads (it pointed
  backwards in Hebrew on the ride summary); a recent search too long for its
  card ends in an ellipsis instead of running past it. Names stay in the
  language they were picked in.
- 2026-10-21: From Gadi's screenshot: a trip started from its detail showed
  no route on the map. The panel swap redrew the map before the follow
  drawing existed, and the drawing's own redraw then saw the same panel and
  skipped; now it forces the draw. Also "5 stop" is "5 stops" (and the
  detail's ride line isolates its names like the rest).
- 2026-10-21: Live data comes through a relay of our own (Gadi agreed): a
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
- 2026-10-21: From Gadi: entering search mode, the menu button and the logo
  pop out (the chips' effect) before the pill shortens, and the "to" tag pops
  in where the menu was; the rest of the sequence moves 0.16 s later (the
  keyboard too). Leaving, the pill grows back while the rows play out (the
  rule meant for that never applied: the shortened padding stayed until the
  play-out ended) and the icons pop back in once it is whole.
- 2026-10-21: From Gadi ("only full English or only full Hebrew"): stored
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
- 2026-10-21: From Gadi (13 minutes' walk planned while standing on the
  Rehovot platform; from there the walk is 0-30 s): "my location" no longer
  falls back to a position up to 10 minutes old when GPS fails (inside a
  station, often); it tries a coarse network fix first and then accepts the
  last position only under 2 minutes old. And choosing the same destination
  again reuses the last search from "my location" only while the rider is
  still within 150 m of where it started and it is under 10 minutes old.
- 2026-10-21: A new build that arrives while a trip is followed now goes in
  once the trip is over (it waited for the next cold start), and coming back
  to the front checks for a new build (Gadi's phone kept the old one, live
  times 15 minutes behind, after the relay went live).
- 2026-10-21: Gadi still saw live data 15 minutes old. Found: the data worker
  refused every question until the day's timetable was in, so the map's
  first live request at start went to Hasadna's database; live queries and
  place names no longer wait for it. And the map's note now says when live
  data came from the database and why the relay was not used, so a failing
  relay on a phone shows instead of hiding behind the fallback.
- 2026-10-21: On Gadi's phone the relay always failed with "signal is aborted":
  the 12 s limit covered the whole read, and at start-up the read competes
  with the data downloads and waits behind their unpacking in the same
  worker. Now 15 s for the relay to start answering and a minute for the
  body, and the first load fetches only the current snapshot (the one of 3
  minutes before follows in the background for frozen positions). The
  relay is not blocked: a phone gets 188 KB (brotli) or 255 KB (gzip).
- 2026-10-21: Gadi's mobile carrier answers NXDOMAIN for
  wayli-relay.wayli.workers.dev (Google's and Cloudflare's DNS resolve it),
  so the relay also gets our own address, relay.waynet.app (waynet.app's DNS
  moving to Cloudflare, the relay attached as a custom domain). The app tries
  relay.waynet.app, then workers.dev, then Hasadna's database, and accepts
  an address only when it answers with a snapshot (x-snapshot header).
- 2026-10-21: From Gadi, four fixes. (1) Android's back no longer plays
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
- 2026-10-22: From Gadi: the locate button only ever shows where you are (a tap
  while following re-centres; MapLibre's control turned location off on that
  tap; turning location off is the phone's permission). And a hidden settings
  row no longer draws as an empty row (the rows' own display overrode the
  hidden attribute: the install hint, empty, under "The app").
- 2026-10-22: From Gadi: the drawer also swipes shut from the dimmed map
  beside it, and the settings page swipes shut the way it came in. "Add to
  home screen" shows whenever the app runs in the browser, not only when
  Chrome offers its prompt (it held the prompt back on his phone, and the
  row had only shown before through the empty-row bug); without the prompt
  a tap explains the browser menu's way.
- 2026-10-22: From Gadi (the time didn't apply; "Tonight / Today / Tomorrow"
  confused): Go after setting a time planned "from now" (it took the path of a
  freshly picked destination); now Go and the popover plan with the time set.
  The time popover gets a Done button and works on a draft, set on any close.
  The day wheel shows calendar days only; the night after midnight is the
  previous service day at 24:00+, internal ("25:30"). Rejected: keeping
  "Tonight" as a separate day (it is the GTFS service day leaking out).
- 2026-10-22: From Gadi (no live vehicles on the map for a friend's search,
  on mobile data): the live note says "loading" until the first answer
  instead of nothing, a slow answer still shows unless a newer one already
  has (overlapping requests discarded every answer on a slow connection),
  and a finished trip leaves the resume bar on return to the app and within
  a minute (it was checked only at start, so an app open overnight kept it).
- 2026-10-22: The Ministry's GTFS server did not answer GitHub's runners for a
  morning and the deploy failed, app change and all. The build keeps the last
  feed that downloaded (Actions cache, one a day) and builds with it, with a
  warning, when the download fails.
- 2026-10-22: From Gadi ("trains don't move at the same speed between
  stations; fit an expected ride time per section from recent data"): train
  delays from learned section times (pipeline/railtimes.py, nightly, last 7
  days of Hasadna's positions): running time and its spread along each
  section, late trains' stands, and a learned 20 s made up per station.
  Held-out day, arrivals within a minute: next station 86% vs 46%, two ahead
  57% vs 32%, five ahead 37% vs 29%. Rejected: using the Ministry's
  per-station SIRI predictions (a key and a fixed-IP server) for now, and
  the railway's own API (Israel Railways threatened Better Rail with a
  lawsuit over it, 2026-09).
- 2026-10-22: Gadi asked whether trains reuse old positions: they take the
  next trip's number early (18% of train fixes; 94% standing at the first
  station). Gadi: the rest look like a train finishing one trip and going on
  as the next, handle it smartly. Measured: about a tenth do (another trip
  goes quiet close by), a quarter are one train reporting two numbers at
  once, the rest empty runs. The worker hands a fix back to the trip it
  continues when time, place, path, progress and delay all agree and only
  one trip fits (no wrong handover in two days replayed), and drops the
  rest. Rejected: handing back to the trip ending at the next one's first
  station (a quarter fitted, at an hour's delay), and taking the closest
  delay when several fit (two wrong in a day).
- 2026-10-22: Gadi saw no buses on his map while friends did. The live site
  showed them from his area with and without the relay; an empty map with no
  word was possible only with live times off or the phone offline, and now
  the note says which.
- 2026-10-22: Gadi's map lost its buses while friends elsewhere saw theirs:
  a vehicle with a wrong clock (reports stamped up to two days ahead; 13 of
  8,915 in one snapshot) became its area's "newest report", so every true
  report there looked over five minutes old and was hidden. Reports stamped
  over 2 minutes after the snapshot are dropped, and the newest report
  skips a lone one far ahead of the rest.
- 2026-10-22: Gadi's phone showed a blank page while the site loaded fine
  elsewhere. MapLibre now comes bundled with the app instead of from cdnjs (a
  network that cannot reach the CDN, or a cleared cache, left the page blank;
  and one less third party), and a safety net in index.html says when the
  app has not started after 12 s, shows the error, and offers "try again" and
  "clear stored files and reload" (service worker and caches; history and
  saved places stay).
- 2026-10-22: From Gadi on the HaHagana platform: the 19:30 to Moshe Dayan,
  running at 19:37, was missing; late, it arrived after the 19:45 express,
  so the router dropped it as beaten. A direct way's card now also lists the
  earlier departures between the same two stops that arrive later (up to
  two, reachable, at most 30 minutes later), marked with their arrival: the
  train at the platform is never hidden.
- 2026-10-22: From Gadi ("19:34 vs 19:38 next to each other?"): the trip
  detail showed the planned departure (the delay when planning) in bold and
  the live check's time in the badge. Now the newest live look sets the bold
  time and the badge says only how late (and "?" when the report is old).
- 2026-10-22: Confirmed with Gadi: his phone's DNS on mobile data answered
  "no such name" for wayli-relay.wayli.workers.dev (a filter blocking
  *.workers.dev); switching Android's Private DNS to dns.google fixed it.
  Riders behind the same filter fall back to Hasadna's database (minutes
  behind); relay.waynet.app remains the fix for them, waiting on Gadi.
- 2026-10-22: From Gadi on the 173: "get off at the next stop" came a stop
  early. The follower took the nearest stop as reached, often the one ahead,
  and also alerted within 350 m of the alighting stop whatever stood between.
  Now the rider is placed on the stretch between two stops (the stop at its
  start is reached, the one at its end once within 60 m), and the alert comes
  once the stop before the last is passed. On board, the live badge gives the
  time at the alighting stop, not "passed" for the boarding one.
- 2026-10-22: From Gadi: a notification that stays, with the stops left and
  when to get off. While following, a silent notification (one tag, updated
  in place, gone at the end) says the step: walking, waiting ("leaves X at
  21:48"), riding ("3 stops left · get off at Y ~22:13"), with "as of" the
  last update. A web page gets no position with the phone locked and is
  paused in the background, so the line leads with clock times that stay
  true when it stops updating. Uses the trip alerts' permission and switch.
- 2026-10-22: From Gadi: the locate button went grey after a tap, and the
  position dot should be turquoise. Bundling MapLibre had put its styles
  after ours; on a phone a tap leaves :hover on the button, and MapLibre's
  hover grey then won the tie over the following button's turquoise. The
  app's styles load after MapLibre's again (imported in main.ts), and the
  position dot, its halo and its accuracy circle are the app's turquoise.
- 2026-10-22: From Gadi: a compass fan on the position dot. A turquoise cone
  turned by the phone's compass (absolute orientation on Android; on an
  iPhone after permission asked from the locate button's tap) and the map's
  rotation, smoothed, hidden when no reading came for two seconds or the
  position is stale. Its own element in the dot (the dot's ::after is its
  ring). The heading never leaves the phone.
- 2026-10-22: From Gadi and a friend's screenshot: (1) "walk 15 min, then walk
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
- 2026-10-22: From Gadi: a friend raised her longest walk from 15 to 30
  minutes and the same search came back as before. Searching the same place
  again within the hour shows the saved result; it now does so only when it
  was planned by this build and with the same longest walk, and the same
  holds for the result shown at start.
- 2026-10-22: Gadi: remove "the same search again shows the saved result":
  live times change in between, one can never know. Removed; every search
  plans afresh. At start the last search (six hours) opens again with its
  places and options and is planned afresh too, from now if it was from now
  and from where the rider is if it was from "my location"; its old results
  are never shown. Rejected: keeping the reuse with tighter conditions.
- 2026-10-23 Gadi: build the search by line, styled by kind of vehicle. Built
  as a Trip / Line switch above the bar's rows (shown while editing, hidden
  at rest), the line search keeping the To box with chips for the kind of
  line; lines grouped by the feed's line code (makat) rather than one row
  per direction, the nearest first. Trains, which have no numbers, are
  their two end stations. Rejected: a separate line-search page (the top
  asks, the bottom answers), city pairs as the grouping (a line from Holon
  to Tel Aviv split in two).
- 2026-10-23 Gadi: a search by stop, and for trains it should work differently:
  riders of trains care about where they can get from here and when, not
  lines; choose a station, then a destination, and get the times. Built as
  the third search type: bus and light rail stops open their departures by
  line; a station lists the stations reachable without a change, and a
  chosen one the direct trains between the two with live times. Rejected:
  a second box in the bar for the destination station (the station's page
  already holds the list, and the bar stays one box for line and stop).
- 2026-10-23 Gadi, on the first version: a "to station" box in the sheet breaks
  the layout (the top asks, the bottom answers), and the reason for from/to is
  that many riders plan their own trips from the train schedule. Changed: the
  train chip gives the bar two station boxes and a swap; the sheet only lists
  answers (where trains from the From station go, then the trains between the
  two). The To box lists only stations reachable without a change.
- 2026-10-23 Gadi: build the three stages of live traffic estimation. Built
  and measured before switching on: learned bus section times by hour and
  kind of day from Hasadna's minute snapshots (nightly, passage logs kept 14
  days); a live correction from the buses that just ran a section; traffic
  on the map from the same. Every delay estimate moved into the data worker
  (one owner for the learned and live times). Rejected: commercial traffic
  feeds (terms, cost, the map area sent out), Waze (agencies only), Hasadna's
  database for the live part (15 minutes behind made it worse than none),
  the bus's own recent pace (measured, no gain), night free flow as the map's
  baseline (every road read slow at 10:00).
- 2026-10-23 Gadi: the nightly download of Hasadna's minute files needs no
  separate ask; it is the same public data the relay already passes on all
  day. Rejected: having the relay keep the snapshots itself (it would need
  storage and still fetch the same files).
- 2026-10-23 Gadi: animate switching between the search types, without an
  if-else per transition. Built as one layout-animation helper (FLIP,
  `src/ui/flip.ts`) keyed on what the bar searches for, and a sliding
  highlight in the switch. Also: the kind-of-line chips scroll with a finger
  (the bar's buttons had touch gestures off).
- 2026-10-23 Gadi: a tap on the time chip while it says "now" should open on
  "depart at". Done: it opens on depart at the time now, wheels showing;
  closed without a change it stays "now" (no frozen minute).
- 2026-10-23 Gadi: the line search should not be numbers only, and the
  keyboard should stay up when switching. Done: the full keyboard, a number
  plus words for where the line runs, words alone for the lines there
  (Hebrew spelling with or without the extra yod or vav matches); the switch
  and chips no longer take the focus. Rejected: switching keyboards by kind.
- 2026-10-23 Gadi: add the weekend buses (Na'im BeSofash; the grassroots
  "Sababus" shuttles have no data anywhere). Built from Tel Aviv's GIS
  (routes, stops) with estimated times from the official hours and a 20
  minute frequency, labelled as estimates wherever they show. Rejected: no
  weekend lines until a timetable is published (riders use them every
  weekend, and an honest estimate beats nothing); scraping an app.
- 2026-10-23 Gadi: a line's stops should be visible from further out. Now
  from zoom 9, solid in the line's colour while far out, white with a ring of
  it up close (a journey's stops stay from zoom 12). And the compass cone he
  asked for did not show on his phone: it hid after 2 s without a reading,
  and a still phone may send none; it now keeps the last direction for half
  a minute and also takes an absolute plain orientation event.
- 2026-10-24: From Gadi's notes. The search boxes offered saved passwords
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
- 2026-10-24: Gadi saw a "?" vehicle on HaTayasim on Saturday: shared taxi
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
- 2026-10-24: Gadi's back rule: the keyboard closes first, then the open
  list, and only then the usual stack. Built as one close watcher for the
  bar that undoes a piece and is made again (measured in Chrome: watchers
  made from one tap are grouped, so a watcher per piece closed two at once;
  rejected). Android only; elsewhere back stays history. Switching search
  kinds keeps the keyboard and the list as they were (his ask). The list's
  jitter on a switch was the rows' glide: a fixed element inside a
  transformed one is placed against that one, so the list jumped, slid and
  snapped back; the lists now hang from the bar itself.
- 2026-10-24: Results, from Gadi: the open sheet showed the highlighted
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
  serving a stop within 500 m; Gadi saw vehicles vanish as he zoomed in on
  himself (right after Shabbat none of his lines ran yet, and the note that
  said so is folded now). They are shown faded instead, his lines in front.
- 2026-10-24: From Gadi: a stop's page shows on the map only what it is
  about (the principle): the vehicles of the lines calling there and their
  courses, faint; it showed every vehicle around. Results sort by arrival
  first, each plan starting so (the order is the plan's, no longer a kept
  setting); the sort chip no longer turns coloured when another order is
  chosen. Comparing ways, each ride carries its line's chip on the map (in
  its colours on the highlighted way, grey on the others). The faint whole
  lines before and after a ride were there but too faint on the dark map
  (0.3); now 0.45. "My location to my location" is no recent search.
- 2026-10-24: One view per stop (Gadi: "merge all to a single page"). A
  stop tapped on the map opens in the sheet directly, no bubble first (the
  bubble's lines, from here and to here are in the view); the station view
  (where its trains go) is folded into it under the departures, across all
  the station's platforms, so a station is a stop like any other; the train
  timetable's From station opens it too. Vehicles keep their bubbles.
- 2026-10-24: Built the agreed "one place decides the map" (deck slide 6,
  agreed 2026-10-23; Gadi: go, with the centring). `map/view.ts` is the
  decision as a pure table, tested in Node (`tools/mapview.test.mjs`);
  `map/render.ts` carries it out for every panel; the six panels no longer
  draw the map, and the camera has one owner, aiming between the bar and
  the sheet (the locate button too: it centred behind a half-open sheet).
  The camera fits a thing once: highlights, live updates and courses
  arriving no longer refit it. docs/principles.md starts with this rule.
- 2026-10-24: Gadi: Route 4 and half of Route 1 had no traffic colour. A bus
  was placed on the straight line between its two stops, and on a highway
  section (stops kilometres apart) the road curves away from it: positions
  over 120 m off were dropped. Buses are now placed on the pattern's course.
  And a section needed two buses in 15 minutes; on highways each line has
  its own pair of stops, so a long section (2 km or more) now takes one bus
  seen along it three times. Replaying Thursday 08:00-08:20 (Oct 22) through
  the worker: road coloured 3,146 km before, 3,868 with the course alone,
  5,304 with both; long sections 130 to 369; the city unchanged.
- 2026-10-24: Gadi: Route 4 and half of Route 1 lacked the map's turquoise
  (he meant the basemap, not traffic). OpenStreetMap tags those stretches
  trunk, which Liberty draws in one layer with primary roads, white; trunk
  now takes the motorway's colours, by class, primary keeps its own.
- 2026-10-24: Gadi: the basemap's "Palestinian Territories" country label
  must go; Wayli is an app for riders in Israel and the label would put
  people off using it. Left out of the country and state label layers by
  its code (PS) and its English and Hebrew names; the rest of the map,
  borders included, is as OpenStreetMap draws it.
- 2026-10-24: Gadi saw two bus-stop badges with no stop circles in Neve
  Sha'anan: OpenStreetMap's own bus stops from the basemap's points of
  interest (poi_r1/r7), at stops the feed still lists (codes 4002, 26967)
  but no line serves today. The basemap's bus and rail points are no longer
  drawn: the map's stops are the feed's, served that day.
- 2026-10-25: Gadi: a line should show the day's times, and how long it
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
- 2026-10-25: Gadi: with the map tilted and the buildings in 3D, the ground
  should have its heights too, as a setting off by default; no contour
  lines (redundant). Terrain from AWS's open Terrain Tiles (free, no key,
  the same kind of static tiles as the basemap; attribution in the map's
  credits), exaggerated 1.5 times, with a light hill shading, only while
  the map is tilted past 10°. Rejected: MapTiler's terrain (needs a key and
  an account), a hillshade on the flat map (changes the 2D look nobody
  asked to change), and contour lines.
- 2026-10-25: Gadi: time to count elevation in walking and cycling times.
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
- 2026-10-25: Gadi: the train search starts at From (a station picked in
  To while From is empty becomes From); the light rail gets the same
  station-to-station search (its two direction stops are one station);
  a setting picks the stop search's opening chip (friends who use it for
  trains); one look control for the whole app with a switch to set the map
  and menus apart.
- 2026-10-25: Gadi: a tap on another stop in the stop view acted oddly
  (the sheet changed, the map kept the old stop: a panel opened again was
  not redrawn), and a departure opened an old, redundant view (the trip's
  stop list, no map). Re-opening a panel now redraws the map; the trip
  page is gone: a departure, a train row and a vehicle open the line at
  that stop with that trip chosen.
- 2026-10-25: Gadi: the 3D heights are slow and clunky on his phone; the
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
  way), so Gadi judges on the phone. Rejected: another map library (the
  whole map, its style and every layer are MapLibre's: a rewrite, and a
  different look), a lower pixel density while tilted (changes the look),
  hiding the 3D buildings while tilted (same).
- 2026-10-25: Gadi: tapping a stop on a line's page was jittery, and the
  timetable should expand. The times shown now stay (dimmed) until the new
  stop's arrive, instead of the box collapsing to "loading" and every row's
  time blinking; the timetable shows a few hours and opens to the whole day
  at a tap. The jitter he meant was more likely the search list itself: on
  a stop or line picked there, the sheet slid and the map eased while the
  bar stayed tall, then dropped 32 px (and the pill 11 px) half a second
  later when its rows were removed. Now the rows that go fold during the
  play-out and the kind row holds the pill's resting height, so the bar
  shrinks with the sheet and nothing moves at the end (measured frame by
  frame in headless Chromium). Gadi also asked for a thorough cleanup of code nobody uses:
  removed the old trip page (earlier today), the feasibility harness
  (`tools/feasibility.html`, `browser_bench.mjs`, `build_artifact.py`),
  four dead functions, 13 strings and 7 style rules nothing read, and 44
  exports nothing imported (now module-private). Found with a scan of
  every export, `t()` key, class name and worker op against its uses, plus
  `tsc --noUnusedLocals`; dynamic keys (`t('sort' + …)`, `m-${mode}`) were
  checked by hand before anything went.
- 2026-10-25: Gadi: a train shown 6 minutes late at Hashalom came on time;
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
- 2026-10-25: Gadi: the timetable should expand (he had not found the "All
  day" button: it was under the box, below the half-open sheet's edge). The
  toggle is now a chip above the box, in sight whenever the times are.
- 2026-10-25: Gadi: the timetable comes closed by default (it stayed open
  across stops and lines once opened: the component outlived them). The
  locate button moves the map to the rider without changing the zoom; a
  second tap, on the rider already, sets a fixed zoom (15). Following the
  rider moves the map the same way, its zoom left alone.
