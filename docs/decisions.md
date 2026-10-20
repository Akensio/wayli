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
