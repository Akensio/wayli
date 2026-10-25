# pipeline: the nightly data build

Python scripts that turn open data into the small files the app downloads.
`.github/workflows/build.yml` runs them every night; `bustimes.yml` and
`railtimes.yml` learn the travel times.

| Script | What |
|---|---|
| `compile.py` | The Ministry's GTFS feed to one service day's compact timetable (walking transfers, courses, train tracks). |
| `streets.py`, `streetgraph.py`, `elevation.py` | OpenStreetMap to the street graph with climbs from open elevation tiles; its reader for the compiler. |
| `shapes.py` | GTFS shapes to simplified courses. |
| `rail.py` | OpenStreetMap railways to a rail graph, for drawing trains along the track. |
| `places.py` | OpenStreetMap to the offline address book. |
| `weekend.py` | The municipalities' weekend lines (Na'im BeSofash), which no feed carries. |
| `bustimes.py`, `railtimes.py` | Bus and train section times learned from Hasadna's recorded positions; `--score DAY` measures them. |
| `build_site.py` | Joins the app build and the data files into `site/`. |
| `container.py` | The container the data files come in (a JSON header, then typed arrays), written and read; the app reads it with `src/engine/container.js`. |
| `common.py` | What the scripts share: the log line, reading the GTFS feed (`rows`, `stop_times`, `hms`), Israel's UTC offset, `haversine`. |
