# Wayli

Wayli is a public-transport app for Israel: buses, trains and light rail, with
trip planning that runs on your phone. It is meant to be the app you reach for
instead of Moovit or Bus Nearby.

The name sounds like וואי לי. The project is free software under the
GNU AGPL-3.0 (see `LICENSE`).

**Status (October 2026): live at https://akensio.github.io/wayli/.** One
service day of the national timetable compiles to a 3 MB file and the street
network of the whole country to 10 MB. The app in `app/` plans trips (with
bikes, depart-at or arrive-by), groups the ways to go, plans with live
delays and shows live times and a live map from Hasadna's Open Bus data,
follows a trip and says when to get off, has line pages, remembers
recent and saved places, shows nearby stops and departures, draws the journey
on a map, shares a trip as a link and works offline. A GitHub Action rebuilds
the data every night and publishes to GitHub Pages. No crowd reports yet; see
"Roadmap" below.

## What it will do

- Plan trips with any number of transfers across modes, bus to train to light
  rail in one query. This is the feature everything else is built around.
- Live arrivals at a stop, nearby stops, line search, a map, favorites.
- Search that understands addresses, streets, cities and places, offline,
  from OpenStreetMap: nothing you type leaves your phone.
- Hebrew and right-to-left as first-class, not an afterthought.
- Bicycles as a real mode: ride to the station, ride between legs, take the
  bike on the train where allowed.
- Work offline, if routing ends up on the device: then the whole timetable
  is on the phone and planning a trip never needs the network.
- Crowd reports, one tap each: the bus arrived, it never came, it was full,
  the air conditioning was broken, it skipped my stop. Reports are anonymous,
  show once more than one rider agrees, and fade after about fifteen minutes.
  Monthly "skipped trips" statistics make operators' reliability visible.

## How it is different

- **As little infrastructure as possible.** Timetables are static files on a
  CDN, rebuilt every night by a GitHub Action. A tiny worker exists only
  where it cannot be avoided: relaying real-time data, collecting crowd
  reports, sending push alerts. Nothing that costs money or needs
  babysitting gets in without a reason.
- **Routing on the device, if it holds up.** The option being tested first:
  compile the national GTFS timetable into a compact file and run the RAPTOR
  algorithm inside the app, so trip planning needs no server, works offline,
  and no trip request leaves your phone. If a phone cannot do it fast
  enough, routing moves to the cheapest setup that works.
- **Privacy is the product.** Wayli does not sell location data and does not
  run tracking ads.
- **Open source, AGPL.** Anyone can audit it, run it or fork it, and a hosted
  fork has to stay open too.

## How it works

```
Ministry of Transport GTFS --nightly--> compiler --> compact timetable --> CDN
                                                                           |
                                                phone downloads it <-------+
                                                and plans trips locally

SIRI real-time (via a small relay) or Hasadna Open Bus --> live arrivals
Crowd reports --> worker + small database --> other riders nearby
```

That is the on-device variant, the one being tested first. The design,
including the open questions and the fallbacks, is in `docs/architecture.md`.
Decisions and their dates are in `docs/decisions.md`.

## Roadmap

1. **Feasibility test.** Compile the Israel GTFS feed to a compact format and
   plan Haifa to Be'er Sheva with three transfers in the browser, in under
   one second on a phone. This decides whether routing stays on the device
   or moves to the cheapest server setup that works. Desktop part passed
   on 2026-10-16 (details in `docs/architecture.md`); phone part pending.
   Same day: real walking transfers from OpenStreetMap, station transfers,
   departure-window answers, bike and walk first/last mile, bike-only
   routes.
2. Nightly pipeline: fetch GTFS and OpenStreetMap, compile, publish. Done
   as a GitHub Actions workflow (`.github/workflows/build.yml`).
3. The app: planner, stops, map, favorites, Hebrew/RTL, offline. Done
   (`app/`), then grown into v0.2: grouped results, arrive-by, history and
   saved places, trip following with get-off alerts, a trip that survives
   closing the app, sharing, settings. Translations of stop names and line
   pages still to come.
4. Real-time: done with Hasadna's Open Bus data, read straight from the
   phone (no key, no relay). The Ministry's SIRI feed would only be worth
   a relay if Hasadna's copy turns out too stale or unreliable.
5. Crowd reports and the reliability statistics.

## Run the test yourself

```
pip install numpy osmium
curl -o data/gtfs.zip https://gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip
curl -o data/osm/israel-and-palestine-latest.osm.pbf https://download.openstreetmap.fr/extracts/asia/israel_and_palestine-latest.osm.pbf
python3 -I pipeline/streets.py data/osm/israel-and-palestine-latest.osm.pbf   # ~3 min -> data/streets.bin.gz
python3 -I pipeline/compile.py data/gtfs.zip --date 20261019 --streets data/streets.bin.gz   # ~80 s -> data/timetable.bin.gz
node app/bench.mjs data/timetable.bin.gz "מרכזית המפרץ" "מרכזית באר שבע" 08:00 60
node app/bench.mjs data/timetable.bin.gz "32.0720,34.8100:bike" "ת. מרכזית ירושלים" 07:30 60
```

`app/feasibility.html` is the same router as a page: `node app/browser_bench.mjs`
runs it in headless Chromium, or serve `app/` with the two `data/*.bin.gz`
files next to it and open it in a browser.

## Run the app

```
python3 -I pipeline/shapes.py data/gtfs.zip --out data/shapes.bin.gz     # ~1 min: the courses of the lines
python3 -I pipeline/compile.py data/gtfs.zip --date 20261019 --streets data/streets.bin.gz --shapes data/shapes.bin.gz --out data/timetable-20261019.bin.gz
python3 pipeline/build_site.py --out site        # app + data + data/manifest.json
python3 -m http.server --directory site 8080     # then open http://localhost:8080/
```

Deployment is the GitHub Actions workflow: it builds the data for the next
7 days every night and publishes `site/` to GitHub Pages, enabling Pages on
the first run.

## Data sources

- Timetable: the Israel Ministry of Transport GTFS feed, published daily at
  gtfs.mot.gov.il.
- Streets: OpenStreetMap, the Israel and Palestine extract (Geofabrik or the
  openstreetmap.fr mirror), ODbL.
- Real-time: Hasadna's Open Bus project (open-bus-stride-api.hasadna.org.il),
  which records the Ministry's SIRI vehicle feed and publishes it openly
  with open CORS, so the phone asks it directly. While live times are on,
  the only thing that leaves the phone is which lines and which area it is
  looking at; one switch in settings turns them off.

## Sustainability

Routing, live arrivals, offline use and privacy are free, forever. Income is
planned from a Pro tier (commute alerts, widgets, no ads, a supporter tier)
and from business use (white-label apps for municipalities and operators,
widgets for employers, venues and tourism). Never from your location.

## License

GNU Affero General Public License v3.0. See `LICENSE`.
