#!/usr/bin/env python3
"""Compile one service day of a GTFS feed into Wayli's compact timetable.

    python3 -I pipeline/compile.py data/gtfs.zip --date 20261019 --out data/timetable.bin.gz

Reads the zip in place (no extraction). The output is a gzip'd container:

    u32 header length | header JSON (utf-8, padded to 4 bytes) | sections

Each section is a little-endian typed array; the header lists its name,
dtype, byte offset (from the start of the sections area) and length.
Times are stored compressed: per trip an absolute start time, then per stop
the departure delta from the previous stop (u16) and the dwell (u16).
The app expands them to absolute arrival/departure arrays on load.
"""
import argparse
import csv
import datetime
import gzip
import io
import json
import math
import struct
import sys
import time
import zipfile
from collections import defaultdict

import numpy as np

FORMAT_VERSION = 1
WALK_SPEED = 1.2        # m/s
WALK_RADIUS = 400.0     # m, generated footpaths between stops closer than this (250 was too small for big stations)
MIN_WALK = 60           # s, floor for any footpath
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr, flush=True)


def member(zf, name):
    return io.TextIOWrapper(zf.open(name), encoding="utf-8-sig", newline="")


def rows(zf, name):
    with member(zf, name) as f:
        yield from csv.DictReader(f)


def hms(s):
    h, m, sec = s.split(":")
    return int(h) * 3600 + int(m) * 60 + int(sec)


def default_date():
    """Next Sunday..Thursday (an Israeli weekday) after today."""
    d = datetime.date.today() + datetime.timedelta(days=1)
    while d.weekday() in (4, 5):  # Friday, Saturday
        d += datetime.timedelta(days=1)
    return d.strftime("%Y%m%d")


def active_services(zf, date):
    d = datetime.datetime.strptime(date, "%Y%m%d").date()
    dow = DAYS[d.weekday()]
    names = set(zf.namelist())
    active = set()
    if "calendar.txt" in names:
        for r in rows(zf, "calendar.txt"):
            if r["start_date"] <= date <= r["end_date"] and r[dow] == "1":
                active.add(r["service_id"])
    if "calendar_dates.txt" in names:
        for r in rows(zf, "calendar_dates.txt"):
            if r["date"] == date:
                if r["exception_type"] == "1":
                    active.add(r["service_id"])
                else:
                    active.discard(r["service_id"])
    return active


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def main():
    global WALK_RADIUS
    ap = argparse.ArgumentParser()
    ap.add_argument("gtfs")
    ap.add_argument("--date", default=default_date(), help="service day, YYYYMMDD")
    ap.add_argument("--out", default="data/timetable.bin.gz")
    ap.add_argument("--debug-out", default=None, help="write trip ids etc. as JSON for checking")
    ap.add_argument("--walk-radius", type=float, default=WALK_RADIUS, help="footpaths between stops closer than this, metres")
    args = ap.parse_args()
    WALK_RADIUS = args.walk_radius

    t0 = time.time()
    zf = zipfile.ZipFile(args.gtfs)
    names = set(zf.namelist())
    feed_info = {}
    if "feed_info.txt" in names:
        for r in rows(zf, "feed_info.txt"):
            feed_info = {k: v for k, v in r.items() if k in ("feed_publisher_name", "feed_start_date", "feed_end_date", "feed_version")}
            break

    log(f"service day {args.date}")
    active = active_services(zf, args.date)
    log(f"{len(active)} active service ids")

    agencies = {}
    if "agency.txt" in names:
        for r in rows(zf, "agency.txt"):
            agencies[r["agency_id"]] = r["agency_name"]

    routes_raw = {}
    for r in rows(zf, "routes.txt"):
        routes_raw[r["route_id"]] = (r.get("route_short_name", ""), r.get("route_long_name", ""),
                                     r.get("agency_id", ""), int(r.get("route_type", "3") or 3))

    trips_raw = {}  # trip_id -> (route_id, headsign)
    for r in rows(zf, "trips.txt"):
        if r["service_id"] in active:
            trips_raw[r["trip_id"]] = (r["route_id"], r.get("trip_headsign", ""))
    log(f"{len(trips_raw)} trips on that day (of all trips in the feed)")

    # ---- stop_times: stream the big file, keep only the day's trips ----
    per_trip = defaultdict(list)
    n_lines = 0
    with member(zf, "stop_times.txt") as f:
        header = next(csv.reader([f.readline()]))
        col = {name: i for i, name in enumerate(header)}
        ti, ai, di, si, qi = (col["trip_id"], col["arrival_time"], col["departure_time"],
                              col["stop_id"], col["stop_sequence"])
        for line in f:
            n_lines += 1
            tid = line[:line.find(",")]
            if tid not in trips_raw:
                continue
            if '"' in line:
                parts = next(csv.reader([line]))
            else:
                parts = line.rstrip("\r\n").split(",")
            per_trip[tid].append((int(parts[qi]), parts[si], hms(parts[ai]), hms(parts[di])))
            if n_lines % 5_000_000 == 0:
                log(f"  stop_times: {n_lines/1e6:.0f}M lines read")
    log(f"stop_times: {n_lines} lines, {sum(len(v) for v in per_trip.values())} kept, {time.time()-t0:.0f}s")

    # ---- stops: index only the ones used that day ----
    stops_raw = {}
    for r in rows(zf, "stops.txt"):
        stops_raw[r["stop_id"]] = (r["stop_name"], float(r["stop_lat"]), float(r["stop_lon"]),
                                   r.get("stop_code", ""), r.get("parent_station", ""))
    stop_index = {}
    stop_list = []  # (id, name, lat, lon, code)

    def sidx(stop_id):
        i = stop_index.get(stop_id)
        if i is None:
            i = len(stop_list)
            stop_index[stop_id] = i
            s = stops_raw[stop_id]
            stop_list.append((stop_id, s[0], s[1], s[2], s[3]))
        return i

    # ---- patterns: group trips by (route, stop sequence), split overtaking trips ----
    dropped = 0
    groups = defaultdict(list)  # (route_id, stops tuple) -> [(start, tid, deps, dwells)]
    for tid, evs in per_trip.items():
        evs.sort()
        deps = [e[3] for e in evs]
        arrs = [e[2] for e in evs]
        ok = len(evs) >= 2 and all(arrs[i] <= deps[i] for i in range(len(evs))) \
            and all(deps[i] <= arrs[i + 1] for i in range(len(evs) - 1)) \
            and all(deps[i + 1] - deps[i] < 65536 for i in range(len(evs) - 1))
        if not ok:
            dropped += 1
            continue
        seq = tuple(sidx(e[1]) for e in evs)
        groups[(trips_raw[tid][0], seq)].append((deps[0], tid, deps, [d - a for d, a in zip(deps, arrs)]))
    del per_trip
    log(f"{len(groups)} route patterns, {dropped} malformed trips dropped, {len(stop_list)} stops used")

    patterns = []  # (route_id, stops, [trip tuples])
    for (route_id, seq), trips in groups.items():
        trips.sort(key=lambda t: (t[0], t[1]))
        subs = []  # each: [last_deps, [trips]]
        for tr in trips:
            placed = False
            for sub in subs:
                last = sub[0]
                if all(a <= b for a, b in zip(last, tr[2])):
                    sub[0] = tr[2]
                    sub[1].append(tr)
                    placed = True
                    break
            if not placed:
                subs.append([tr[2], [tr]])
        for sub in subs:
            patterns.append((route_id, seq, sub[1]))
    patterns.sort(key=lambda p: (p[0], p[1]))
    log(f"{len(patterns)} patterns after splitting overtaking trips")

    # ---- routes used ----
    route_index = {}
    route_list = []
    for route_id, _, _ in patterns:
        if route_id not in route_index:
            route_index[route_id] = len(route_list)
            short, long_, ag, rtype = routes_raw[route_id]
            route_list.append([short, long_, agencies.get(ag, ag), rtype])

    # ---- arrays ----
    P = len(patterns)
    S = len(stop_list)
    pat_stops_off = np.zeros(P + 1, np.int32)
    pat_trips_off = np.zeros(P + 1, np.int32)
    trip_times_off = np.zeros(P + 1, np.int32)
    pat_route = np.zeros(P, np.int32)
    pat_stops = []
    trip_start = []
    trip_ids = []
    dep_delta = []
    dwell = []
    stop_pats = [[] for _ in range(S)]
    n_events = 0
    for p, (route_id, seq, trips) in enumerate(patterns):
        pat_stops_off[p] = len(pat_stops)
        pat_trips_off[p] = len(trip_start)
        trip_times_off[p] = n_events
        pat_route[p] = route_index[route_id]
        pat_stops.extend(seq)
        for pos, s in enumerate(seq):
            stop_pats[s].append((p, pos))
        for start, tid, deps, dw in trips:
            trip_start.append(start)
            trip_ids.append(tid)
            prev = start
            for d in deps:
                dep_delta.append(d - prev)
                prev = d
            dwell.extend(dw)
            n_events += len(deps)
    pat_stops_off[P] = len(pat_stops)
    pat_trips_off[P] = len(trip_start)
    trip_times_off[P] = n_events
    T = len(trip_start)

    stop_pats_off = np.zeros(S + 1, np.int32)
    stop_pats_flat = []
    for s in range(S):
        stop_pats_off[s] = len(stop_pats_flat) // 2
        for p, pos in stop_pats[s]:
            stop_pats_flat.extend((p, pos))
    stop_pats_off[S] = len(stop_pats_flat) // 2

    # ---- footpaths between nearby stops ----
    lat = np.array([s[2] for s in stop_list], np.float64)
    lon = np.array([s[3] for s in stop_list], np.float64)
    cell = WALK_RADIUS / 111000.0  # degrees per cell, roughly WALK_RADIUS metres
    grid = defaultdict(list)
    for i in range(S):
        grid[(int(lat[i] / cell), int(lon[i] / cell))].append(i)
    tr_lists = [[] for _ in range(S)]
    n_tr = 0
    for i in range(S):
        cx, cy = int(lat[i] / cell), int(lon[i] / cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in grid.get((cx + dx, cy + dy), ()):
                    if j == i:
                        continue
                    d = haversine(lat[i], lon[i], lat[j], lon[j])
                    if d <= WALK_RADIUS:
                        tr_lists[i].append((j, max(MIN_WALK, int(d / WALK_SPEED))))
                        n_tr += 1
    tr_off = np.zeros(S + 1, np.int32)
    tr_to = np.zeros(n_tr, np.int32)
    tr_time = np.zeros(n_tr, np.int32)
    k = 0
    for i in range(S):
        tr_off[i] = k
        for j, t in sorted(tr_lists[i]):
            tr_to[k] = j
            tr_time[k] = t
            k += 1
    tr_off[S] = k
    log(f"{n_tr} footpaths within {WALK_RADIUS:.0f} m")

    # ---- container ----
    sections = []
    body = bytearray()

    def add(name, arr, dtype):
        a = np.ascontiguousarray(np.asarray(arr, dtype=dtype))
        while len(body) % 4:
            body.append(0)
        sections.append({"name": name, "dtype": dtype, "offset": len(body), "length": int(a.size)})
        body.extend(a.astype("<" + np.dtype(dtype).str[1:]).tobytes())

    add("patStopsOff", pat_stops_off, "int32")
    add("patStops", pat_stops, "int32")
    add("patTripsOff", pat_trips_off, "int32")
    add("tripTimesOff", trip_times_off, "int32")
    add("patRoute", pat_route, "int32")
    add("tripStart", trip_start, "int32")
    add("depDelta", dep_delta, "uint16")
    add("dwell", dwell, "uint16")
    add("stopPatsOff", stop_pats_off, "int32")
    add("stopPats", stop_pats_flat, "int32")
    add("trOff", tr_off, "int32")
    add("trTo", tr_to, "int32")
    add("trTime", tr_time, "int32")
    add("stopLat", lat, "float32")
    add("stopLon", lon, "float32")

    header = {
        "format": FORMAT_VERSION,
        "date": args.date,
        "feed": feed_info,
        "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "counts": {"stops": S, "patterns": P, "trips": T, "events": n_events, "footpaths": n_tr,
                   "routes": len(route_list)},
        "walk": {"radius_m": WALK_RADIUS, "speed_mps": WALK_SPEED, "min_s": MIN_WALK},
        "sections": sections,
        "routes": route_list,
        "stops": [[s[0], s[1], s[4]] for s in stop_list],
    }
    hjson = json.dumps(header, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    while (4 + len(hjson)) % 4:
        hjson += b" "
    raw = struct.pack("<I", len(hjson)) + hjson + bytes(body)
    with gzip.open(args.out, "wb", compresslevel=9) as f:
        f.write(raw)
    import os
    gz = os.path.getsize(args.out)
    log(f"wrote {args.out}: {len(raw)/1e6:.1f} MB raw, {gz/1e6:.1f} MB gzip, "
        f"header {len(hjson)/1e6:.1f} MB, in {time.time()-t0:.0f}s")
    print(json.dumps({"date": args.date, "stops": S, "patterns": P, "trips": T, "events": n_events,
                      "footpaths": n_tr, "routes": len(route_list), "dropped": dropped,
                      "raw_bytes": len(raw), "gz_bytes": gz, "seconds": round(time.time() - t0)}))

    if args.debug_out:
        with open(args.debug_out, "w", encoding="utf-8") as f:
            json.dump({"tripIds": trip_ids}, f)


if __name__ == "__main__":
    main()
