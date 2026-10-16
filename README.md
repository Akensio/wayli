# Wayli

Wayli is a public-transport app for Israel: buses, trains and light rail, with
trip planning that runs on your phone. It is meant to be the app you reach for
instead of Moovit or Bus Nearby.

The name sounds like וואי לי. The project is free software under the
GNU AGPL-3.0 (see `LICENSE`).

**Status (October 2026): just started.** Nothing runs yet. The first milestone
is a feasibility test of on-device routing; see "Roadmap" below.

## What it will do

- Plan trips with any number of transfers across modes, bus to train to light
  rail in one query. This is the feature everything else is built around.
- Live arrivals at a stop, nearby stops, line search, a map, favorites.
- Hebrew and right-to-left as first-class, not an afterthought.
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
   or moves to the cheapest server setup that works.
2. Nightly pipeline: fetch GTFS, compile, publish.
3. The app: planner, stops, lines, map, favorites, Hebrew/RTL, offline.
4. Real-time arrivals (SIRI access from the Ministry of Transport, or
   Hasadna's Open Bus data).
5. Crowd reports and the reliability statistics.

## Data sources

- Timetable: the Israel Ministry of Transport GTFS feed, published daily at
  gtfs.mot.gov.il.
- Real-time: the Ministry's SIRI feed (needs registration), and Hasadna's
  Open Bus project (open-bus-stride-api.hasadna.org.il), which records the
  same feed and publishes it openly.

## Sustainability

Routing, live arrivals, offline use and privacy are free, forever. Income is
planned from a Pro tier (commute alerts, widgets, no ads, a supporter tier)
and from business use (white-label apps for municipalities and operators,
widgets for employers, venues and tourism). Never from your location.

## License

GNU Affero General Public License v3.0. See `LICENSE`.
