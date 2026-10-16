# Wayli architecture

Current design as of 2026-10-16, rewritten in place when it changes. Dated
decisions are in `decisions.md`. Nothing here is built yet.

## Shape

Three parts, in order of how much they matter:

1. **The app**: an installable web app (PWA) first, native wrappers later
   only if needed. Holds the compiled timetable, runs the trip planner, shows
   stops, lines, map, favorites, live arrivals and crowd reports.
2. **The pipeline**: a nightly GitHub Action that downloads the Ministry of
   Transport GTFS feed, compiles it to a compact timetable, and publishes the
   result as static files (GitHub Pages or Cloudflare Pages).
3. **The worker**: the smallest possible server (Cloudflare Workers + D1,
   free tier at first) for the three things that cannot run on the phone:
   relaying real-time data (SIRI credentials cannot ship in a public app),
   collecting and serving crowd reports, and sending push alerts.

## Trip planning on the device

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
- Open question: size. The Israel feed is large: about 179 MB zipped as of
  2026-10-16 (`stop_times.txt` is the
  bulk). The compact format has to bring a day's timetable, or the whole
  validity window, down to something a phone will download and keep. The
  feasibility test measures this.

## Compact timetable (sketch)

The pipeline turns GTFS text into typed arrays the app can load directly:

- stops: id, names as the feed has them, lat/lon, parent station.
- route patterns RAPTOR-style: for each distinct stop sequence, its trips
  sorted by departure time, each trip a row of arrival/departure times in
  seconds since midnight.
- calendar: which patterns run on which service day, so the app can load one
  day at a time.
- transfers: stop pairs with walking times.
- a search index over stop and line names.

The exact encoding (one binary blob or several files, compression, delta
times) is for the feasibility test to settle. Version the format from the
first build so the app can refuse a timetable it does not understand.

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
anything else.

1. Download the current Ministry of Transport GTFS feed.
2. Compile it to a compact timetable for one service day; record output size
   and compile time.
3. Run RAPTOR in a browser (desktop first, then a mid-range Android phone)
   for Haifa to Be'er Sheva allowing three transfers.
4. Pass criterion: a correct plan in under one second on the phone, with a
   timetable small enough to download over mobile data without complaint.
   Record the numbers in `decisions.md` either way.
