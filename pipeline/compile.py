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
import re
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

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))

FORMAT_VERSION = 2
WALK_SPEED = 1.2        # m/s
WALK_RADIUS = 400.0     # m, generated footpaths between stops closer than this (250 was too small for big stations)
MIN_WALK = 60           # s, floor for any footpath
WALK_BUFFER = 30        # s, added to every footpath: finding the stop, the crossing, the margin
STATION_SPEED = 1.0     # m/s inside a station (stairs, floors, crowds)
STATION_MIN = 120       # s, floor for a platform-to-platform transfer inside one station
TRANSFER_SLACK = 90     # s, minimum between alighting and boarding at the same stop (applied by the router)
WALK_CHAIN_MAX = 600    # s, longest chain of footpaths the router may string together
CITY_RE = re.compile(r"עיר:\s*(.*?)\s*רציף:")
INTERCITY_KM = 15.0     # a bus line whose ends are in different cities this far apart counts as intercity (luggage compartment)
NIGHT_END = 3 * 3600        # s: trips of the next calendar day starting before this hour belong to this night


def route_cities(long_name):
    """'origin-city<->destination-city-1#' -> (city, city); the MOT feed's route_long_name convention."""
    parts = long_name.split("<->")
    if len(parts) != 2:
        return None
    out = []
    for part in parts:
        part = re.sub(r"-\d+[#א-ת]*$", "", part.strip())
        out.append(part.rsplit("-", 1)[-1].strip())
    return tuple(out)
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


def project_stops(slat, slon, plat, plon):
    """Where each stop falls along a polyline (degrees): segment index and fraction along it, never
    going backwards from one stop to the next. Returns (segments, fractions, worst distance in m)."""
    kx = 111320.0 * math.cos(math.radians(float(plat.mean())))
    ky = 110540.0
    x, y = plon * kx, plat * ky
    ax, ay = x[:-1], y[:-1]
    dx, dy = x[1:] - ax, y[1:] - ay
    seg2 = dx * dx + dy * dy
    seg2[seg2 == 0] = 1e-9
    segs, fracs, worst, prev = [], [], 0.0, 0
    for lat, lon in zip(slat, slon):
        sx, sy = lon * kx, lat * ky
        px, py = sx - ax[prev:], sy - ay[prev:]
        t = np.clip((px * dx[prev:] + py * dy[prev:]) / seg2[prev:], 0.0, 1.0)
        d = np.hypot(px - t * dx[prev:], py - t * dy[prev:])
        # a course can pass the same place twice (loops): take the first segment that is close
        # enough, and only otherwise the nearest one ahead
        close = np.flatnonzero(d < 60.0)
        j = int(close[0]) if len(close) else int(np.argmin(d))
        worst = max(worst, float(d[j]))
        prev += j
        segs.append(prev)
        fracs.append(float(t[j]))
    return segs, fracs, worst


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
    ap.add_argument("--streets", default=None, help="compact street graph from streets.py: real walking times between stops")
    ap.add_argument("--max-walk", type=int, default=600, help="seconds: longest stop-to-stop walk on the street graph")
    ap.add_argument("--shapes", default=None, help="compact shapes from shapes.py: each pattern's course and where its stops fall on it")
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

    if not feed_info and "calendar.txt" in names:
        starts, ends = [], []
        for r in rows(zf, "calendar.txt"):
            starts.append(r["start_date"]); ends.append(r["end_date"])
        if starts:
            feed_info = {"feed_start_date": min(starts), "feed_end_date": max(ends), "feed_version": f"calendar {min(starts)}-{max(ends)}"}
    log(f"service day {args.date}")
    active = active_services(zf, args.date)
    # the night after: the feed codes trips after midnight on the next calendar day (00:10, not 24:10),
    # so they are added to this service day shifted by 24 h, and the day runs until about 03:00
    next_date = (datetime.datetime.strptime(args.date, "%Y%m%d") + datetime.timedelta(days=1)).strftime("%Y%m%d")
    active_next = active_services(zf, next_date)
    log(f"{len(active)} active service ids, {len(active_next)} on the next day")

    agencies = {}
    if "agency.txt" in names:
        for r in rows(zf, "agency.txt"):
            agencies[r["agency_id"]] = r["agency_name"]

    routes_raw = {}
    for r in rows(zf, "routes.txt"):
        routes_raw[r["route_id"]] = (r.get("route_short_name", ""), r.get("route_long_name", ""),
                                     r.get("agency_id", ""), int(r.get("route_type", "3") or 3))

    trips_raw = {}  # trip_id -> (route_id, headsign)
    trips_next = {}  # next-day trips; kept only if they start before NIGHT_END, shifted by a day
    for r in rows(zf, "trips.txt"):
        if r["service_id"] in active:
            trips_raw[r["trip_id"]] = (r["route_id"], r.get("trip_headsign", ""), r.get("shape_id", ""))
        if r["service_id"] in active_next:
            trips_next[r["trip_id"]] = (r["route_id"], r.get("trip_headsign", ""), r.get("shape_id", ""))
    log(f"{len(trips_raw)} trips on that day, {len(trips_next)} on the next (of all trips in the feed)")

    # ---- stop_times: stream the big file, keep only the day's trips ----
    per_trip = defaultdict(list)
    n_lines = 0
    with member(zf, "stop_times.txt") as f:
        header = next(csv.reader([f.readline()]))
        col = {name: i for i, name in enumerate(header)}
        ti, ai, di, si, qi = (col["trip_id"], col["arrival_time"], col["departure_time"],
                              col["stop_id"], col["stop_sequence"])
        skip_next = set()   # next-day trips that start too late to belong to this night
        for line in f:
            n_lines += 1
            tid = line[:line.find(",")]
            today = tid in trips_raw
            if not today and (tid not in trips_next or tid in skip_next):
                continue
            if '"' in line:
                parts = next(csv.reader([line]))
            else:
                parts = line.rstrip("\r\n").split(",")
            ev = (int(parts[qi]), parts[si], hms(parts[ai]), hms(parts[di]))
            if not today and tid not in per_trip and ev[3] >= NIGHT_END:
                skip_next.add(tid)   # rows of a trip come in sequence order: the first one is its start
                continue
            per_trip[tid].append(ev)
            if n_lines % 5_000_000 == 0:
                log(f"  stop_times: {n_lines/1e6:.0f}M lines read")
    # next-day trips starting before NIGHT_END join this day a day later; the rest of them go
    n_night = 0
    for tid in list(per_trip):
        if tid not in trips_next:
            continue
        evs = per_trip[tid]
        if min(e[3] for e in evs) < NIGHT_END:
            per_trip[tid + "+"] = [(q, s_, a + 86400, d + 86400) for q, s_, a, d in evs]
            trips_raw[tid + "+"] = trips_next[tid]
            n_night += 1
        if tid not in trips_raw:
            del per_trip[tid]
    log(f"stop_times: {n_lines} lines, {sum(len(v) for v in per_trip.values())} kept ({n_night} trips of the night after), {time.time()-t0:.0f}s")

    # ---- stops: index only the ones used that day ----
    stops_raw = {}
    for r in rows(zf, "stops.txt"):
        m = CITY_RE.search(r.get("stop_desc", "") or "")
        city = m.group(1).strip() if m else ""
        stops_raw[r["stop_id"]] = (r["stop_name"], float(r["stop_lat"]), float(r["stop_lon"]),
                                   r.get("stop_code", ""), r.get("parent_station", ""), city)
    stop_index = {}
    stop_list = []  # (id, name, lat, lon, code, parent_id, city)

    def sidx(stop_id):
        i = stop_index.get(stop_id)
        if i is None:
            i = len(stop_list)
            stop_index[stop_id] = i
            s = stops_raw[stop_id]
            stop_list.append((stop_id, s[0], s[1], s[2], s[3], s[4], s[5]))
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

    # ---- shapes: each pattern's course, and where every stop of it lies along that course ----
    pat_shape = np.full(len(patterns), -1, np.int32)
    pat_shape_seg, pat_shape_frac = [], []
    n_shaped = n_noshape = n_off = 0
    if args.shapes:
        from shapes import read_shapes
        shapes = read_shapes(args.shapes)
        log(f"{len(shapes)} shapes loaded from {args.shapes}")
        # every shape a route's trips name, so a pattern whose own trips name none (a few variant
        # runs lack a shape_id) can borrow a sibling's course when its stops lie on it
        route_shapes = defaultdict(list)
        for _tid, (rid, _hs, sid) in trips_raw.items():
            if sid.isdigit() and sid not in route_shapes[rid]:
                route_shapes[rid].append(sid)
        for pi, (route_id, seq, trips) in enumerate(patterns):
            own = next((trips_raw[tr[1]][2] for tr in trips if trips_raw[tr[1]][2].isdigit()), "")
            candidates = ([own] if own else []) + [x for x in route_shapes.get(route_id, []) if x != own]
            slat, slon = [stop_list[i][2] for i in seq], [stop_list[i][3] for i in seq]
            segs, fracs, sid = None, None, ""
            for cand in candidates:
                sh = shapes.get(int(cand))
                if sh is None or len(sh[0]) < 2:
                    continue
                sg, fr, worst = project_stops(slat, slon, sh[0], sh[1])
                if worst <= 400:  # every stop near the course: this shape fits the pattern
                    segs, fracs, sid = sg, fr, cand
                    break
            if segs is None:
                if candidates:
                    n_off += 1
                else:
                    n_noshape += 1
            if segs is None:
                pat_shape_seg.extend([0] * len(seq))
                pat_shape_frac.extend([0] * len(seq))
            else:
                pat_shape[pi] = int(sid)
                pat_shape_seg.extend(segs)
                pat_shape_frac.extend(fracs)
                n_shaped += 1
        log(f"{n_shaped} of {len(patterns)} patterns follow a shape ({n_noshape} without a shape, {n_off} off their shape)")

    # ---- routes used ----
    route_index = {}
    route_list = []
    for route_id, _, _ in patterns:
        if route_id not in route_index:
            route_index[route_id] = len(route_list)
            short, long_, ag, rtype = routes_raw[route_id]
            # the GTFS route_id last: it is the SIRI line_ref, which real-time data is keyed by
            route_list.append([short, long_, agencies.get(ag, ag), rtype, int(route_id) if route_id.isdigit() else route_id])

    # ---- arrays ----
    P = len(patterns)
    S = len(stop_list)
    pat_stops_off = np.zeros(P + 1, np.int32)
    pat_trips_off = np.zeros(P + 1, np.int32)
    trip_times_off = np.zeros(P + 1, np.int32)
    pat_route = np.zeros(P, np.int32)
    pat_intercity = np.zeros(P, np.uint8)
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
        short, long_, ag, rtype = routes_raw[route_id]
        if rtype == 3:
            cities = route_cities(long_)
            a, b = seq[0], seq[-1]
            far = haversine(stop_list[a][2], stop_list[a][3], stop_list[b][2], stop_list[b][3]) >= INTERCITY_KM * 1000
            pat_intercity[p] = 1 if (cities and cities[0] != cities[1] and far) else 0
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

    # ---- footpaths: nearby stops by straight line, plus platform-to-platform inside stations ----
    lat = np.array([s[2] for s in stop_list], np.float64)
    lon = np.array([s[3] for s in stop_list], np.float64)
    cell = WALK_RADIUS / 111000.0  # degrees per cell, roughly WALK_RADIUS metres
    grid = defaultdict(list)
    for i in range(S):
        grid[(int(lat[i] / cell), int(lon[i] / cell))].append(i)
    tr = {}  # (i, j) -> seconds
    for i in range(S):
        cx, cy = int(lat[i] / cell), int(lon[i] / cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in grid.get((cx + dx, cy + dy), ()):
                    if j == i:
                        continue
                    d = haversine(lat[i], lon[i], lat[j], lon[j])
                    if d <= WALK_RADIUS:
                        tr[(i, j)] = max(MIN_WALK, int(d / WALK_SPEED) + WALK_BUFFER)
    n_geo = len(tr)
    # station siblings: every platform of a station reaches every other, whatever the distance
    siblings = defaultdict(list)
    for i, s in enumerate(stop_list):
        if s[5]:
            siblings[s[5]].append(i)
    n_station = 0
    for members in siblings.values():
        for i in members:
            for j in members:
                if i == j:
                    continue
                d = haversine(lat[i], lon[i], lat[j], lon[j])
                t = max(STATION_MIN, int(d / STATION_SPEED) + WALK_BUFFER)
                if (i, j) not in tr or tr[(i, j)] > t:
                    tr[(i, j)] = t
                n_station += 1
    stop_node = np.full(S, -1, np.int32)
    n_street = 0
    if args.streets:
        import streetgraph
        g = streetgraph.load(args.streets)
        log(f"street graph: {g['M']} nodes, {len(g['edgeTo'])} edges")
        stop_node, street_tr = streetgraph.walking_times(
            g, lat, lon, args.max_walk, WALK_BUFFER,
            on_progress=lambda i, n, t: log(f"  walking times: {i}/{n} stops, {t:.0f}s"))
        # street times replace straight-line guesses; station transfers stay as the floor
        for i in range(S):
            if stop_node[i] < 0:
                continue
            for j, t in street_tr[i].items():
                t = int(max(MIN_WALK, t))
                old = tr.get((i, j))
                if old is None or (stop_node[j] >= 0 and not (stop_list[i][5] and stop_list[i][5] == stop_list[j][5])):
                    tr[(i, j)] = t
                    n_street += 1
        # straight-line pairs where both stops are on the street graph but no street path was found: drop
        for (i, j) in list(tr):
            if stop_node[i] >= 0 and stop_node[j] >= 0 and j not in street_tr[i] and not (stop_list[i][5] and stop_list[i][5] == stop_list[j][5]):
                del tr[(i, j)]
        log(f"{n_street} footpaths from the street graph (max {args.max_walk} s)")
    n_tr = len(tr)
    tr_lists = [[] for _ in range(S)]
    for (i, j), t in tr.items():
        tr_lists[i].append((j, t))
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
    stop_parent = np.full(S, -1, np.int32)
    parent_index = {}
    for i, s in enumerate(stop_list):
        if s[5]:
            stop_parent[i] = parent_index.setdefault(s[5], len(parent_index))
    log(f"{n_tr} footpaths: {n_geo} within {WALK_RADIUS:.0f} m, {n_station} inside {len(siblings)} stations")

    # ---- container ----
    sections = []
    body = bytearray()

    def add(name, arr, dtype):
        a = np.ascontiguousarray(np.asarray(arr, dtype=dtype))
        while len(body) % 4:
            body.append(0)
        sections.append({"name": name, "dtype": dtype, "offset": len(body), "length": int(a.size)})
        body.extend((a.astype("<" + np.dtype(dtype).str[1:]) if a.dtype.itemsize > 1 else a).tobytes())

    add("patStopsOff", pat_stops_off, "int32")
    add("patStops", pat_stops, "int32")
    add("patTripsOff", pat_trips_off, "int32")
    add("tripTimesOff", trip_times_off, "int32")
    add("patRoute", pat_route, "int32")
    add("patIntercity", pat_intercity, "uint8")
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
    add("stopParent", stop_parent, "int32")
    add("stopNode", stop_node, "int32")
    if args.shapes:
        add("patShape", pat_shape, "int32")
        add("patShapeSeg", np.array(pat_shape_seg, np.int32), "int32")
        add("patShapeFrac", np.array([int(round(f * 65535)) for f in pat_shape_frac], np.uint16), "uint16")

    header = {
        "format": FORMAT_VERSION,
        "date": args.date,
        "feed": feed_info,
        "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "counts": {"stops": S, "patterns": P, "trips": T, "events": n_events, "footpaths": n_tr,
                   "routes": len(route_list), "stations": len(parent_index),
                   "intercity_patterns": int(pat_intercity.sum())},
        "walk": {"radius_m": WALK_RADIUS, "speed_mps": WALK_SPEED, "min_s": MIN_WALK, "buffer_s": WALK_BUFFER,
                 "station_min_s": STATION_MIN, "transfer_slack_s": TRANSFER_SLACK, "chain_max_s": WALK_CHAIN_MAX},
        "sections": sections,
        "routes": route_list,
        "stops": [[s[0], s[1], s[4], s[6]] for s in stop_list],
        "stations": [[pid, stops_raw[pid][0] if pid in stops_raw else ""] for pid in parent_index],
        "streets": {"file": args.streets.split("/")[-1], "max_walk_s": args.max_walk, "footpaths": n_street} if args.streets else None,
        "shapes": {"file": args.shapes.split("/")[-1], "patterns": int(n_shaped)} if args.shapes else None,
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
