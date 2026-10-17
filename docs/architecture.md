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

## The app (v0.1, `app/`)

An installable web app, Hebrew and right-to-left first with an English
toggle, no framework and no build step. Files: `index.html` (shell),
`app.js` (UI), `worker.js` (a Web Worker that holds the data and answers
every query, so the UI never blocks), `raptor.js` and `streets.js` (the
router and street graph, shared with the test harness), `sw.js` (service
worker: the shell and every downloaded data file are cached, so the app
works offline once loaded; a new build reloads the page once), `styles.css`,
`manifest.webmanifest`, icons. Maps are MapLibre GL (cdnjs) over OpenFreeMap
vector tiles (no key, no cost), the Liberty style in every app theme (a dark
basemap was tried and rejected as too dark), with the RTL text plugin for
Hebrew and Arabic labels.

Screens: plan (search with station grouping, "my location", day picker,
time, bicycle choice, results with line chips, journey detail with map and
legs, star to save), nearby (stops around the device with the lines serving
them, tap for the next departures, "from here"/"to here"), favorites (saved
trips and stops, this device only), about.

Search and addresses: `pipeline/places.py` compiles an offline address book
from OpenStreetMap (streets with their city from the nearest transit stop,
house numbers, cities from the feed, notable places such as hospitals,
universities, malls, parks and stations): about 45k streets, 170k house
numbers, 16k places, 1.8 MB. `app/places.js` parses free text ("הורדים 4,
גבעתיים", "קניון עזריאלי", "תל אביב"), understands common city aliases, and
ranks stops, addresses, streets, places and cities together, nearer ones
first when the user's location is known. A missing house number resolves to
the nearest known one on that street and says so. A point can also be picked
on a map (crosshair, choose), and gets its name from the same book in reverse:
nearest house number, place or street, else the nearest stop. Nothing leaves
the device.

Data: `data/manifest.json` lists one timetable file per service day
(`timetable-YYYYMMDD.bin.gz`, about 3 MB; the app downloads only the day
being planned) and the street graph (10.7 MB, loaded after the first answer;
until it is in, points use straight-line access with a detour factor).

Deployment: `pipeline/build_site.py` assembles `site/`; the GitHub Actions
workflow in `.github/workflows/build.yml` runs nightly (and on push to
`main`): downloads the feed, rebuilds the street graph weekly, compiles the
next 7 days, and deploys `site/` to GitHub Pages, turning Pages on by itself the first
time (`actions/configure-pages` with `enablement: true`). No server, no cost.

Not in v0.1: real-time, crowd reports, elevation, trips that cross midnight,
stop name translations, Arabic, line pages, the bike-on-board rules for
light rail.

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
  manifest and downloads only when something changed.
- Hosting: GitHub Pages or Cloudflare Pages, both free. Torrent/IPFS were
  considered and rejected for now (a CDN is free; peer-to-peer in a browser
  still needs servers). An optional mirror can come later.

## Real-time

- Preferred: the Ministry of Transport SIRI feed, relayed by the worker
  because its credentials cannot be embedded in a public app. Registration
  with the Ministry can take time, so it starts early.
- Alternative or complement: Hasadna's Open Bus project
  (open-bus-stride-api.hasadna.org.il) records the same SIRI feed and
  publishes it openly. Whether it is fresh enough for live arrivals is an
  open question to measure.

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
