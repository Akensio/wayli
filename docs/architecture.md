# Wayli architecture

Current design as of 2026-10-16, rewritten in place when it changes. Dated
decisions are in `decisions.md`. Nothing here is built yet.

Guiding constraint: as little infrastructure as possible. Anything that
costs money or manual configuration time has to earn its place. Where
routing runs is not decided; the on-device design below is the leading
option because it needs the least infrastructure, and the feasibility test
at the end decides. The fallbacks if it fails are listed after the test.

## Shape

Three parts, in order of how much they matter:

1. **The app**: an installable web app (PWA) first, native wrappers later
   only if needed. Shows stops, lines, map, favorites, live arrivals and
   crowd reports; in the on-device design it also holds the compiled
   timetable and the street graph and runs the trip planner.
2. **The pipeline**: a nightly GitHub Action that downloads the Ministry of
   Transport GTFS feed and (less often) the OpenStreetMap extract, compiles
   them to a compact timetable and street graph, and publishes the result
   as static files (GitHub Pages or Cloudflare Pages).
3. **The worker**: the smallest possible server (Cloudflare Workers + D1,
   free tier at first) for the three things that cannot run on the phone:
   relaying real-time data (SIRI credentials cannot ship in a public app),
   collecting and serving crowd reports, and sending push alerts.

## Trip planning on the device (leading option, under test)

- Algorithm: RAPTOR (round-based public transit routing) over the timetable
  of the day. It works directly on trips and stops, needs no graph
  preprocessing, and returns Pareto-optimal answers by arrival time and
  number of transfers, which maps to "earliest arrival" and "fewest
  transfers" results. Multimodal comes for free: bus, train and light rail
  are all routes in the same timetable.
- Transfers: GTFS `transfers.txt` where present, plus walking transfers
  generated in the pipeline between stops within a short radius, shipped
  with the timetable.
- Why on the device: offline use, privacy (no request leaves the phone),
  near-zero hosting, no routing server to scale.
- Size, measured 2026-10-16: the feed is 179 MB zipped, 1.2 GB unzipped
  (`stop_times.txt` is 944 MB, 17.8M rows, for a 31-day window). One weekday
  compiles to 26 MB raw, 2.8 MB gzipped. The repeating schedules compress
  extremely well, so a day on the phone is cheaper than a photo. A whole
  validity window is a later question; one day at a time is the plan.

## Transfers, accuracy and bicycles

Priority set 2026-10-16: speed has headroom, accuracy does not, and bicycles
are a required mode. Built the same day:

- **Street network** (`pipeline/streets.py`): the OpenStreetMap extract of
  Israel and Palestine compiled into a walking and cycling graph of
  intersections: 853k nodes, 2.3M directed edges, 10.7 MB gzipped (23 MB in
  memory), built in under 3 minutes. Edges carry length, walk/bike
  permission per direction (one-way streets apply to bikes, not to walkers)
  and a kind that sets the speed (road, cycleway, footway, path, steps,
  service). No elevation yet, so Haifa and Jerusalem hills are flat for now.
- **Real walking transfers** (`compile.py --streets`): every stop snaps to
  the nearest walkable node within 250 m (30,569 of 30,654 do), and a
  bounded search from each stop gives the walking time to every stop within
  10 minutes on actual streets: 404k footpaths, replacing the straight-line
  guesses. Inside a station every platform reaches every other (the feed's
  `parent_station`, 220 stations, 4.6k pairs). Every footpath carries a 30 s
  margin; boarding at the stop you arrived at needs 90 s.
- **Profile search** (`raptor.js` `profile()`): range RAPTOR over a departure
  window, so an answer is every journey worth taking in the next hour, not
  one. Origins and destinations are sets (all platforms of a station, or
  every stop reachable from a point) with access and egress times. Ties on
  arrival that save a transfer are kept, which the textbook pruning loses.
  Ranking: Pareto by departure, arrival and transfers, then an extra
  transfer has to save at least 5 minutes. The departure shown is the latest
  that still makes the first vehicle.
- **First and last mile** (`app/streets.js`): Dijkstra on the street graph
  from a point, on foot (15 min) or by bike (20 min), to every stop it can
  reach; those become the origins or destinations. A bike-only route is
  computed alongside when a bike is involved. Three bicycle choices: none,
  ride to the stop and park it (bike access, walking egress), take it along
  (bike at both ends, only vehicles and hours that allow it), plus a
  folding-bike switch.

Measured in headless Chromium, 60-minute window, up to 3 transfers:

| Query | Median | Notes |
|---|---|---|
| HaMifratz (Haifa) to Be'er Sheva central, 08:00 | 339 ms | 3 journeys, 23 destination platforms; cold run 516 ms |
| Point in Givatayim by bike to Jerusalem central, 07:30 | 314 ms | 912 stops within 20 min by bike; bike 11 min to Savidor then bus 480 |
| Single departure instead of a window | 50 to 65 ms (Node) | |
| Bike reach, 20 min, from Givatayim | 44 ms | walk reach 15 min: 2 ms |
| Bike route Givatayim to Savidor | 5 ms | 2.5 km, 13 min; on foot 2.4 km, 33 min |

Known gaps, in rough order of importance:

- Bike on transit: the feed has no `bikes_allowed`, so the rules are coded
  in `raptor.js` (`BIKE_RULES`, `bikeAllowed`) from public sources, checked
  2026-10-16: folding bikes ride on any bus, light rail and train at any
  hour; other bikes ride on trains outside the weekday peaks (Sun-Thu
  06:00-09:00 and 15:00-19:00, Israel Railways notice, 2019) and in the
  luggage compartment of intercity buses (Ministry of Transport directive,
  space permitting), not on city buses or light rail. "Intercity" is a
  heuristic in `compile.py`: the route's two end cities differ and its ends
  are at least 15 km apart (1,776 of 6,464 patterns). Sources: Israel
  Railways via Moovit (updates.moovit.com/bicycles-train-jan19-en), Globes
  2019-10, Walla Finance 1629067, Kol Zchut "העלאת אופניים לאוטובוס".
  Peak rules are checked at boarding time; holidays and Fridays are not
  modelled yet. Bike-share is not modelled.
- No elevation: cycling times in Haifa and Jerusalem are optimistic (Bat
  Galim up to the Technion shows as 12 minutes).
- The window query should run in a Web Worker with the first answer shown
  at once; a phone will take about 1 s for a full hour.
- The street graph could be about half its size with varint-coded edges.
- The 10-minute cap on stop-to-stop walks and the 15/20-minute caps on
  access are guesses to revisit with real use.

## The app (v0.3, `app/`)

An installable web app, Hebrew and right-to-left first with an English
toggle, no framework and no build step. Files: `index.html` (shell),
`app.js` (UI), `worker.js` (a Web Worker that holds the data and answers
every query, so the UI never blocks), `raptor.js` and `streets.js` (the
router and street graph, shared with the test harness), `places.js` (the
address book), `live.js` (real-time client and delay estimate), `follow.js`
(the trip-following state machine, pure functions), `store.js` (settings,
history, saved places and the trip in progress, all in localStorage),
`sw.js` (service worker: the shell and every downloaded data file are
cached, so the app works offline once loaded; a new build reloads the page
once, and notification taps reopen the app), `styles.css`,
`manifest.webmanifest`, icons. Maps are MapLibre GL (cdnjs) over OpenFreeMap
vector tiles (no key, no cost): the Liberty style by default in every theme,
and in dark mode, when chosen in settings, the same Liberty recoloured on
the device (`darkmap.js`: every colour in the style turned by its role,
ground near black, roads mid grey with lighter casings, buildings a shade
above the ground, text light with a dark halo), so the dark map keeps all
of Liberty's detail: road classes, 3D buildings, stops, places.
OpenFreeMap's own dark styles were rejected as too bare. The RTL text
plugin shapes Hebrew and Arabic labels. Lines are coloured by mode and
operator: trains navy, light rail red (both lines running are "the red
line"), buses in their operator's colour, approximate brand colours kept
in one table in `app.js` (Egged green and Dan blue read off their sites;
Metropoline orange, Kavim purple, Superbus orange-red, Nateev Express lime,
Electra Afikim dark blue, Tnufa light blue, Extra magenta, Galim teal, Bet
Shemesh Express brown from memory, to be corrected as seen on the road),
other operators slate green; chips, legs, map lines, vehicle dots and
markers all use the same colour. Vehicles on every map carry a
triangle on their rim pointing where they head (SIRI's bearing; none when
a standing vehicle reports zero).

Layout (v0.3, map first): one map under everything, showing every vehicle
reporting in view with its line number and heading, the stops when zoomed
in, the rider's position (MapLibre's locate control, started on its own once
location was allowed before), and whatever the open panel is about. Over it,
a floating top bar that is the planner: a menu button, the destination
field (places, addresses and line numbers; its quick menu offers my
location, a point on the map, saved and recent places), the language
toggle, and, once a place is set, a second row with the origin field
(empty means my location) and a swap button, then a row of two chips for
the options (when; bicycle) whose details open in a card hanging off the
bar. A destination plans at once; changing either field plans again;
nothing of the planner sits in the sheet. A bottom sheet with three heights (a
strip, about half the screen, nearly full) carries every panel: the plan
screen (results and recent searches only), nearby, saved, settings,
and the panels for a journey, a stop, a trip's stops, a line, the place
chooser and the trip being followed. The sheet is dragged by its
handle or tapped to cycle; a tap on empty map collapses it. Picking a point
is a mode of the same map: the sheet and bar give way to a crosshair and a
choose bar. The strip at the bottom when nothing is open offers plan, home,
work, recent places and nearby stops. Picking a destination in the top bar
plans from the rider's location at once. The panels form a stack, and only
the top one is shown with its map content (a panel registers what it draws;
revealing a panel underneath redraws its content); every panel and screen
change is a history entry, so the phone's back button closes the panel or
returns to the previous screen instead of leaving the app. Closing a panel
edits the stack first and lets history catch up, so programmatic closes and
the back button never disagree. The basemap is restyled in place when the
theme changes (a full style reload, after which the app's layers are added
again).

Planning: from and to can be a stop or station, an address, a street, a
place, a city, the device's location or a point picked on the map. From a
point, the walk to each stop within reach is the street-network walk plus
a 30 s buffer, except that standing within 60 m of a stop (150 m of a
railway station, which the feed keeps as one point) counts as being there,
and within 300 m the straight walk with a 1.3 detour factor caps a network
path that wanders off to reach the stop's node; the
search box lists saved and recent places when empty. Depart-at or arrive-by
(a two-hour window ending at the target, latest departure first); day
picker over the published service days, with "tonight" until 03:00 since a
service day runs past midnight; bicycle choice; the longest walk to a stop
is a setting (a slider, 3 to 45 minutes by the minute). Results come back grouped: journeys that
board and alight at the same stops are one card with its departure times
("also at 08:17, 08:32") and the alternative lines of a leg shown together
("5 / 18"); "leave in 4 min" counts down and departed options grey out;
earlier/later buttons shift the window; no results offers an hour later or
a longer walk. The last search and its results come back when the app is
reopened within six hours, with one tap to plan it again from now; the
eight most recent searches sit under the form and re-plan from now.

Journey detail: the legs drawn on the map, pins at boarding and alighting stops and
dots at the stops between (a tap on a ride leg focuses it: its course alone, only
its vehicles, the map fitted to it; a second tap releases), the whole line of every ride drawn faded
beneath it with all its stops (where the bus comes from and goes on), and
every reporting vehicle of those lines with its delay and heading, the one
running the planned trip ringed; every ride leg expands to its stops and
times; live badge per ride leg; start trip; share (Web Share with a text
summary and a link that opens the app with the same query); star to save.
Following a trip draws the same, with the rider's position.

Trip following ("start a trip"): the journey is stored on the device and
followed with the geolocation watch, a screen wake lock and a five-second
clock. `follow.js` advances through the legs from the rider's position
(within 60 m of a stop, nearest stop along the ride with hysteresis, never
backwards) and falls back to the timetable clock when there is no position.
It raises "one more stop" when the alighting stop is next or within 350 m,
"get off here" at the stop, and "arrived" at the end: vibration, a short
beep and a notification (through the service worker, so it shows with the
screen off), each switchable in settings. The screen shows the current
step in large type, the vehicle's live position and delay, the remaining
legs and a "next step" button for when GPS is wrong. Closing the app does
not end the trip: a floating bar at the top offers to resume it, and if the
app was on the follow panel it reopens there. A trip ends by the rider's
"end", by arrival, or by going stale (45 minutes past its arrival).

Re-planning on the way (v0.3.1): delays can make another way faster, so
while a trip is followed the app plans again from the stop the rider
reaches next (the next stop of the ride at its expected arrival, delay
included; the boarding stop while waiting; the stop a walk leads to, when
the walk ends) to the same destination, with the live vehicles around it,
whenever the ride runs three or more minutes late, its vehicle is missing
within ten minutes of departure, or five minutes have passed (never more
than once per 90 s). An answer whose rides (trip and alighting stop each)
are the ones already followed is the same plan, and its arrival is the
best estimate of staying; any other answer is proposed only if it arrives
at least four minutes earlier, plus three per extra transfer. The proposal
is a card in the follow panel ("get off at X, line Y towards Z at T, arrive
at T', n min earlier") with one tap to switch: the followed journey is
spliced (the current ride cut at the next stop when the vehicle changes,
the new ride from the next stop when only the alighting stop changes, the
current walk kept), the follower's state is rebuilt on board or waiting,
the map redrawn, the stored trip updated. A dismissed proposal stays away
for fifteen minutes. The pure parts (origin, plan identity, splice) live in
`follow.js`.

Search and addresses: `pipeline/places.py` compiles an offline address book
from OpenStreetMap (streets with their city from the nearest transit stop,
house numbers, cities from the feed, notable places such as hospitals,
universities, malls, parks and stations): about 45k streets, 170k house
numbers, 16k places, 1.8 MB. `app/places.js` parses free text ("הורדים 4,
גבעתיים", "קניון עזריאלי", "תל אביב"), understands common city aliases, and
ranks stops, addresses, streets, places and cities together, nearer ones
first when the user's location is known (distance breaks ties even among
places close by). A quote mark inside a word belongs to the word, so הל"ה,
צה"ל, ג'וליס and כפר חב"ד match whether typed with the mark, without it,
or with the keyboard's ״ or ''; the same rule normalises stop names. Stops
and places are ranked on one scale in the worker: match strength (a whole
word over a prefix, a name typed in full over a partial one; a street is
named by its first word, a place's words count alike), nearness, a point
ahead of a street at equal strength, an address ahead of everything when a
number was typed. A missing house number resolves to
the nearest known one on that street and says so. A point can also be picked
on the map (it moves under a crosshair; choose), and gets its name from the same book in reverse:
nearest house number, place or street, else the nearest stop. Nothing leaves
the device.

Lines: the top bar finds a line by number (exact first, then prefix; "רכבת"
lists the trains), one row per direction with its agency and today's trip
count, listed above the places for short queries. A line page shows the
direction's course on the map with every stop as a dot and the line's
vehicles reporting now, each with its delay (tap one for its trip's stops), the other
directions as buttons, today's trip count and first and last departure,
and the stop list (tap a stop for its page). Line chips everywhere (stop
cards, a stop's lines, a ride in a journey, a vehicle bubble) open the line
page.

Nearby and stops: stops around the device with the lines serving them and
the walk in minutes; a stop shows its next departures with live times
(below), refreshed every 45 seconds while open; a departure opens the
trip's full stop list with where the vehicle is now; the map eases to the
stop with a pin; "to here" plans from the rider's location at once and
"from here" opens the form; stars save stops. Saved: home and work (one
tap plans a trip there from the device's location), other saved places,
saved trips, saved stops. Settings: language, dark-mode map, longest walk,
live times on/off with a plain statement of what is sent, alerts, sound and
vibration, a test alert, add to home screen, clear history.

Time is Israel time whatever the phone's zone (`Intl` with
`Asia/Jerusalem`), and "now" is expressed in seconds on the selected
service day, so countdowns, live matching and following all agree past
midnight.

Data: `data/manifest.json` lists one timetable file per service day
(`timetable-YYYYMMDD.bin.gz`, about 3 MB; the app downloads only the day
being planned), the street graph (10.7 MB, loaded after the first answer;
until it is in, points use straight-line access with a detour factor), the
address book, and the courses (`shapes.bin.gz`, 3.6 MB: the feed's 6,749
shapes simplified to 6 m, 1.26M points as int32 1e-5 degrees, loaded last).
Each day's file says which shape every pattern runs on and where each of
its stops falls along it (segment and fraction, computed by projecting the
stop on the simplified course, never backwards; a pattern whose trips name
no shape borrows a sibling's when its stops lie on it), so a ride between
two stops is drawn along the road; until the courses are loaded, rides are
drawn stop to stop. Trains have no shapes in the feed at all (every rail
trip lacks a shape_id), so `pipeline/rail.py` turns OpenStreetMap's
`railway=rail` ways (yards, sidings and spurs excluded) into a rail graph,
and the compiler routes every pair of consecutive stations over it with
A*, stores each pair's track once in the day's file (8 m simplification)
and draws a train ride by chaining its pairs. A
service day's file also carries the next calendar day's trips that start
before 03:00, shifted by 24 hours, because the feed codes a 00:10 night bus
on the next date; so the night is complete in one file.

Deployment: `pipeline/build_site.py` assembles `site/`; the GitHub Actions
workflow in `.github/workflows/build.yml` runs nightly (and on push to
`main`): downloads the feed, rebuilds the street graph weekly, compiles the
next 7 days, and deploys `site/` to GitHub Pages, turning Pages on by itself the first
time (`actions/configure-pages` with `enablement: true`). No server, no cost.

Not yet: crowd reports, elevation, stop name translations, Arabic, line
pages beyond a trip's stop list, the bike-on-board rules for light rail,
fares.

## Compact timetable (format 2, built by `pipeline/compile.py`)

One file per service day, gzipped: a u32 header length, a JSON header, then
little-endian typed arrays the app views in place:

- header: feed dates, counts, the section table, routes (line number, long
  name, operator, type) and stops (id, name, code).
- route patterns RAPTOR-style: `patStopsOff`/`patStops` (stop sequence per
  pattern), `patTripsOff` (trip range per pattern), `tripTimesOff`.
  In the Israel feed every `route_id` is one direction of one line, so a
  pattern is a route; trips that would overtake are split into sub-patterns.
- times: per trip an absolute `tripStart`, then per stop the departure delta
  from the previous stop (u16) and the dwell (u16). The app expands these to
  absolute arrival/departure `Int32Array`s on load (about 80 ms). Dwell is
  all zeros in this feed and deltas repeat across trips, which is why gzip
  gets 26 MB down to 2.8 MB.
- `stopPats`: for each stop, the (pattern, position) pairs it appears in.
- footpaths: `trOff`/`trTo`/`trTime`: street-graph walking times within 10
  minutes (straight-line within 400 m when built without `--streets`), plus
  platform-to-platform inside stations. The feed has no `transfers.txt`.
- `stopLat`/`stopLon` as f32, `stopParent` (station index), `stopNode` (the
  stop's node in the street graph, for the first and last mile).
- header extras: stations, each stop's city (from `stop_desc`), the walk and
  slack parameters the router reads.

Not yet in the format: stop name translations, headsigns per trip, fares.
Search is done in the app over names and cities (`searchStops`), grouping a
station's platforms into one result.

## Pipeline

- Source: Israel Ministry of Transport GTFS, published daily at
  gtfs.mot.gov.il (`israel-public-transportation.zip`). Data terms still to
  be checked.
- Nightly GitHub Action: fetch, validate, compile, publish static files plus
  a manifest (feed date, format version, checksums). The app reads the
  manifest and downloads only when something changed. Every push to `main`
  deploys too; the street and rail graphs are cached for a week and the
  seven compiled days are cached by feed, graphs and compiler source, so
  an app-only push skips the six-minute compile and is live in about two
  minutes.
- Hosting: GitHub Pages or Cloudflare Pages, both free. Torrent/IPFS were
  considered and rejected for now (a CDN is free; peer-to-peer in a browser
  still needs servers). An optional mirror can come later.

## Real-time

Done in v0.2 with Hasadna's Open Bus project (open-bus-stride-api.hasadna.org.il),
which records the Ministry of Transport's SIRI vehicle feed every minute and
serves it with `Access-Control-Allow-Origin: *`, so the phone asks it
directly: no key, no relay, no server of ours. Measured facts (2026-10-17):

- `siri_vehicle_locations/list` answers in 1 to 3 s with a closed
  `recorded_at_time` window (from and to) and `order_by=recorded_at_time
  desc`, for line, area and operator queries alike; without the closed
  window, or unsorted, it times out. A few rows carry impossible future
  times and are dropped.
- SIRI's `line_ref` is the GTFS `route_id`, which the timetable now stores
  per route, and a ride's `scheduled_start_time` (UTC) is the trip's first
  departure, so a vehicle maps to a timetable trip by (route, first
  departure) with no extra data. Night trips are matched on the service day
  they are shown on.
- Delay is estimated on the device: the vehicle's position is projected on
  its trip's stop sequence, the scheduled time at that point is compared
  with when it was seen, and the result is applied to the stops ahead;
  past the rider's stop it reads "passed". A vehicle more than 600 m off
  its stop sequence gives no estimate; one older than four minutes is
  marked stale. Mismatches between the feed and the operator's actual
  schedule show up as implausible delays; rough, but honest about it.
- Where it shows: badge per ride leg in a journey around now (and the
  vehicle on the map), live times for a stop's next departures (one area
  query, then by line for what it missed), the vehicle's place in a trip's
  stop list, the current vehicle while following a trip (every 30 s), and
  the map itself: every vehicle reporting in view, coloured by mode with
  its line number, refreshed every 20 s and on every pan (not while the
  sheet covers the map or the app is in the background), with the stops
  when zoomed in. The layer follows the view: with nothing searched and
  the map around the rider, only the lines serving stops within 500 m of
  them (what can be taken from there; elsewhere on the map, everything in
  view); while results are shown, only the lines of those journeys (the
  note says which); hidden while a journey, a line or a followed trip
  draws its own vehicles with their delays. A vehicle whose last report is
  more than five minutes behind the newest report of the feed is not drawn
  at all (the feed lags as a whole; a single stale vehicle is noise).
  Stops carry a kind: railway stations, light rail stops and bus stations
  (a parent with platforms) are badges with the mode's glyph from zoom 11,
  one per station at the centre of its platforms (a tap shows the lines of
  all its platforms); ordinary stops and platforms are the small circles
  from zoom 14. The same badges mark stations along a drawn line or
  journey. A tap on any vehicle, on any map, opens a bubble
  on the map (line, direction, agency, when it reported, speed, delay) with
  buttons to its trip's stops and its line page; a tap on any stop dot opens
  a bubble with the stop's lines and departures / from here / to here. No
  tap on a map jumps to a page by itself.
- Planning with live data: a plan from now (the current service day,
  within 20 minutes of the clock) first fetches the vehicles within 12 km of
  the origin and every train in the country (Israel Railways is SIRI
  operator 2, one query), hands them to the worker, which matches each to
  its trip, estimates its delay and shifts that trip's times from where the
  vehicle is onwards before routing. A trip never moves past the next trip
  of its pattern or before the previous one, so the router's sorted-trip
  searches still hold; a vehicle so late that the next one catches up shows
  as departing with it. Everything is undone after the plan. So a train
  whose scheduled departure has passed but which is still on its way is
  offered at its real time, and a bus running early is not. The results
  say "live times as of HH:MM" or "schedule only"; each planned ride shows
  its delay, and the journey detail shows the scheduled time struck through
  next to the live one. A leg's identity for later matching (its first
  departure) is always the scheduled one, read from the stored start and
  deltas, never the shifted arrays.
- Freshness: Hasadna's ingestion sometimes lags by 20 minutes and backfills
  old snapshots, so queries look back half an hour, sort by recorded time
  (not id), and every screen shows how old the newest report is; a report
  older than four minutes is marked with "?", and one more than five
  minutes behind the feed's newest report is left off the map.
- Privacy: while on, the phone sends Hasadna the line numbers and the area
  it looks at, and Hasadna sees its IP, as any website does. The settings
  screen says exactly this, and one switch turns live times off.

The Ministry's own SIRI feed stays a fallback: it would need a relay with
credentials, worth building only if Hasadna's copy proves too stale or
unreliable in daily use. What is known about it (2026-10-18): the current
interface is SIRI-SM 2.8 over plain HTTPS GET,
`https://moran.mot.gov.il/Channels/HTTPChannel/SmQuery/2.8/json?Key=<key>&MonitoringRef=<stop code or AllActiveTripsFilter>&StopVisitDetailLevel=normal`
(a `moran-t.mot.gov.il` twin exists), as used by Hasadna's requester
(github.com/hasadna/open-bus-siri-requester, `requester.py`); the key
comes from the Ministry after sending its signed SIRI-SM form to
ptsupport@mot.gov.il, and the Ministry registers the caller's IP, so a
browser cannot call it directly. The Ministry's page is
https://www.gov.il/he/Departments/General/real_time_information_siri (its
2017 FAQ still names the older SOAP endpoint
`http://siri.motrealtime.co.il:8081/Siri/SiriServices`). It covers buses
and trains, not the Jerusalem light rail, and answers with predicted
arrival times per stop, which Hasadna's positions do not carry.

## Crowd reports

Structured, one tap each, never free text (moderation, safety and cost ruled
chat out):

- Kinds: arrived, never came (ghost bus), full, air conditioning broken,
  skipped my stop.
- Gated by location (you report from where you are), anonymous, shown once
  more than one rider agrees, fading after about 15 minutes.
- Waze-style "thanks" counters are the only social element.
- Monthly "skipped trips" statistics per line and operator, as an
  accountability tool.
- Built after routing works: reports need riders, so they come second.

## Costs

Static hosting: free. Worker + D1: free tier at first, in the order of five
dollars a month once the app is popular. No routing servers at any scale.

## The feasibility test (first milestone)

Goal: show that on-device routing for Israel is viable before building
anything else. Pass criterion: a correct plan in under one second on a
phone, with a timetable small enough to download over mobile data.

Done 2026-10-16 (feed of 2026-10-15, service day Monday 2026-10-19), on a
4-core cloud container, desktop part:

| Step | Result |
|---|---|
| Compile one day (`pipeline/compile.py`, Python + numpy) | 35 s; 123,036 trips, 4,462,084 stop times, 30,654 stops, 6,464 patterns, 306,426 footpaths |
| Timetable size | 2.8 MB gzipped, 26 MB decompressed, plus 36 MB of expanded time arrays in memory |
| Load in headless Chromium | page usable 0.3 to 1.2 s after open: unzip 80 to 540 ms, parse 50 to 290 ms |
| Haifa HaMifratz to Be'er Sheva, 08:00, up to 3 transfers | 23 to 38 ms median in Chromium, 38 to 77 ms for the first (cold) run |
| Other queries in Node 22 (warm median) | Jerusalem to Tel Aviv 10 ms, Givatayim to Haifa 19 ms, Eilat to Nahariya 28 ms |
| Correctness | the planned train (trip `1_521131`) matches the raw `stop_times.txt` and its calendar row exactly |

Verdict so far: on-device routing is comfortably viable on desktop, with two
orders of magnitude to spare against the 1 s goal. Phone timing is pending:
`app/feasibility.html` is published as a private Claude artifact for that.

Things the test surfaced, for later:

- Footpaths within 250 m could not connect the HaMifratz bus platforms to
  the train station; 400 m fixes that case. Big stations probably want
  explicit station-to-station transfers rather than a bigger radius.
- RAPTOR's Pareto set happily adds a transfer to save one minute (a two-stop
  bus hop at the end of a trip). Ranking or a transfer penalty is needed
  before showing results to people.
- Stop search is a substring match; "אילת" finds streets named Eilat before
  the city. A proper index with city names is needed.
- Rail routes have no line number; the page shows "Train".
- The artifact host serves text but not binaries, so the published test page
  ships the timetable as base64 (3.7 MB instead of 2.8 MB).

Reproduce:

```
curl -o data/gtfs.zip https://gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip
python3 -I pipeline/compile.py data/gtfs.zip --date 20261019
node app/bench.mjs data/timetable.bin.gz "מרכזית המפרץ" "מרכזית באר שבע" 08:00
node app/browser_bench.mjs "מרכזית המפרץ" "מרכזית באר שבע" 08:00   # needs Playwright + Chromium
```

## If on-device routing fails the test

Options, none chosen, cheapest first:

- Hybrid: keep the compact timetable on the device for the common case (a
  region, nearby trips) and send only the hard queries to a small routing
  endpoint.
- The same RAPTOR code on a serverless free tier (Cloudflare Workers), with
  the compact timetable loaded from the CDN, if the timetable fits the
  free-tier limits. Costs nothing until it is popular, no machines to
  maintain.
- A hosted open-source router (OpenTripPlanner, MOTIS) on a small VPS: the
  most capable and the most expensive in money and configuration time, so
  last.
