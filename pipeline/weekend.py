#!/usr/bin/env python3
"""Add the weekend lines the Ministry's feed does not carry ("Na'im BeSofash", the municipalities' free Friday and
Saturday buses in Gush Dan) to a GTFS zip, in place, with estimated times.

    python3 -I pipeline/weekend.py data/gtfs.zip --cache data/weekend.json

The lines run by the municipalities through a contractor are not licensed by the Ministry of Transport, so neither its
GTFS feed nor its SIRI real-time feed has them (checked 2026-10-23: none of lines 705-729 of the service in the feed,
59 vehicles reporting nationally on Friday night). Tel Aviv's municipality publishes their routes and stops on its GIS
server, behind the official map (https://busofash.co.il): layer 992 (one line per direction, named "from X to Y") and
layer 993 (a stop per line, with the Ministry's stop code). No timetable is published. What is known, and used:
  - hours: Friday 16:30 to 02:00, Saturday 09:00 to 17:30 (https://busofash.co.il, 2026-10-23);
  - frequency: every 20 minutes (https://en.wikipedia.org/wiki/Na'im_Busofash), the same for every line here;
  - speed, an estimate: on Saturday daytime the buses in Gush Dan covered 24 km/h stop to stop in a straight line
    (Hasadna's positions, 2026-10-17); on Thursday evening 15 (2026-10-22). Friday evening is taken as 20.
So every trip here is an estimate: the agency's id starts with "est-", which the compiler records on the route and the
app shows ("about every 20 minutes, times estimated"). The routes are drawn along the municipality's lines.

Stops are given per line, not per direction, within 40 m of both courses on a two-way street, the twins across the
street within metres of each other: a stop goes with the direction travelling the way the feed's own buses leave it
(most of these stops serve other lines too); a stop only these lines use, with the direction passing it on the right
(buses keep right), or on the line itself when no stop stands across the street. A course drawn against its travel is
turned round first. Stops follow in the order the course reaches them. A line drawn backwards (most of its stops on its left) is
turned round first. The answers are kept in --cache, used when the municipality's server does not answer (it times out
at times); with neither, the feed is left as it is.
"""
import argparse, csv, io, json, math, os, re, shutil, sys, time, urllib.parse, urllib.request, zipfile
from collections import defaultdict

GIS = "https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer"
LINES, STOPS = 992, 993
HOURS = {"fri": (16 * 3600 + 1800, 26 * 3600), "sat": (9 * 3600, 17 * 3600 + 1800)}
HEADWAY = 20 * 60
SPEED = {"fri": 20 / 3.6, "sat": 24 / 3.6}   # m/s, straight line from stop to stop (estimates, see above)
NEAR = 40      # m: a stop this close to a line's course is on it
AGENCY = "est-naim"
CITY_RE = re.compile(r"עיר:\s*(.*?)\s*רציף:")


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(layer, **q):
    q = {"where": "1=1", "outFields": "*", "outSR": 4326, "f": "geojson", **q}
    url = f"{GIS}/{layer}/query?" + urllib.parse.urlencode(q)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001  (a slow server: retried)
            log(f"  layer {layer}: {e} (try {attempt + 1})")
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"layer {layer} did not answer")


def fetch():
    lines = get(LINES, maxAllowableOffset=0.00002)["features"]   # the full lines time out; 2 m of simplification does not
    stops, off = [], 0
    while True:
        page = get(STOPS, resultOffset=off, resultRecordCount=300, orderByFields="oid")["features"]
        stops += page
        if len(page) < 300:
            break
        off += 300
    if not lines or not stops:
        raise RuntimeError("empty answer")
    return {"fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "lines": lines, "stops": stops}


def xy(lat, lon, lat0):
    return lon * 111320 * math.cos(math.radians(lat0)), lat * 110540


def place(course, lat, lon):
    """Where a point falls on a course: (metres along, metres off, on its right, the course's direction there)."""
    lat0 = course[0][1]
    px, py = xy(lat, lon, lat0)
    best, along = None, 0.0
    for (a_lon, a_lat), (b_lon, b_lat) in zip(course, course[1:]):
        ax, ay = xy(a_lat, a_lon, lat0)
        bx, by = xy(b_lat, b_lon, lat0)
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        f = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2)) if l2 else 0.0
        d = math.hypot(ax + f * dx - px, ay + f * dy - py)
        if best is None or d < best[1]:
            n = math.sqrt(l2) or 1
            best = (along + f * math.sqrt(l2), d, dx * (py - ay) - dy * (px - ax) < 0, (dx / n, dy / n))
        along += math.sqrt(l2)
    return best


def dist(a, b):
    return math.hypot((a["lon"] - b["lon"]) * 111320 * math.cos(math.radians(a["lat"])), (a["lat"] - b["lat"]) * 110540)


def headings(gtfs, codes, stops_by_code):
    """Which way buses leave each of these stops, from the feed's own lines (the mean direction to their next stop, in
    metres east and north), for the stops other lines use too."""
    want = {stops_by_code[c]["id"]: c for c in codes}
    by_id = {s["id"]: s for s in stops_by_code.values()}
    acc = defaultdict(lambda: [0.0, 0.0])
    z = zipfile.ZipFile(gtfs)
    with z.open("stop_times.txt") as f:
        rd = csv.reader(io.TextIOWrapper(f, "utf-8-sig"))
        hdr = next(rd)
        ti, si, qi = hdr.index("trip_id"), hdr.index("stop_id"), hdr.index("stop_sequence")
        prev = None
        for r in rd:
            if prev and prev[0] == r[ti] and prev[1] in want and int(r[qi]) == prev[2] + 1 and r[si] in by_id:
                a, b = by_id[prev[1]], by_id[r[si]]
                dx, dy = (b["lon"] - a["lon"]) * 111320 * math.cos(math.radians(a["lat"])), (b["lat"] - a["lat"]) * 110540
                n = math.hypot(dx, dy)
                if n > 0:
                    acc[want[prev[1]]][0] += dx / n; acc[want[prev[1]]][1] += dy / n
            prev = (r[ti], r[si], int(r[qi]))
    out = {}
    for c, (x, y) in acc.items():
        n = math.hypot(x, y)
        if n > 0:
            out[c] = (x / n, y / n)
    return out


def directions(data, stops_by_code, heading):
    """Each direction of each line: its course and its stops in order. A stop goes with the direction travelling the
    way the feed's buses leave it; one only these lines use, by the side of the road (right; on the line itself only
    when no stop stands across the street within 80 m)."""
    per_line = defaultdict(list)
    for f in data["stops"]:
        p = f["properties"]
        if p.get("stop_code") in stops_by_code:
            per_line[int(p["Line"])].append(p["stop_code"])
    out, missing = [], 0
    for f in data["lines"]:
        p, g = f["properties"], f["geometry"]
        course = g["coordinates"] if g["type"] == "LineString" else [c for part in g["coordinates"] for c in part]
        line = int(p["Line"])
        def cands_of(course):
            res = []
            for code in dict.fromkeys(per_line.get(line, [])):
                s = stops_by_code[code]
                along, off, right, seg = place(course, s["lat"], s["lon"])
                if off <= NEAR:
                    h = heading.get(code)
                    res.append((along, off, right, code, None if h is None else seg[0] * h[0] + seg[1] * h[1]))
            return res
        def stops_on(course):
            cands = cands_of(course)
            keep = []
            for c in cands:
                if c[4] is not None:
                    if c[4] > 0.3:
                        keep.append(c)
                    continue
                if c[2]:
                    keep.append(c)
                    continue
                twin = any(o[2] and abs(o[0] - c[0]) <= 80 and dist(stops_by_code[o[3]], stops_by_code[c[3]]) <= 80 for o in cands)
                if not twin and c[1] <= 8:
                    keep.append(c)
            # how many of its stops the feed's buses leave the way this course runs, and how many the other way
            return [c[3] for c in sorted(keep)], sum(1 for c in cands if (c[4] or 0) > 0.3), sum(1 for c in cands if (c[4] or 0) < -0.3)
        seq, fwd, back = stops_on(course)
        if back > fwd:   # drawn against its travel
            course = course[::-1]
            seq = stops_on(course)[0]
        # the other direction of the same line, drawn the same way round (both courses agree on most stops): this one
        # is the way back
        other = next((o for o in out if o["line"] == line), None)
        if other and len(set(seq) & set(other["stops"])) > 0.5 * min(len(seq), len(other["stops"])):
            course = course[::-1]
            seq = stops_on(course)[0]
        if len(seq) < 2:
            missing += 1
            continue
        out.append({"line": line, "name": p.get("Name") or "", "color": (p.get("route_color") or "").strip("#"), "course": course, "stops": seq})
    log(f"{len(out)} directions of {len({d['line'] for d in out})} lines, {missing} left out (fewer than two stops)")
    return out


def merge(gtfs, dirs, stops_by_code):
    z = zipfile.ZipFile(gtfs)
    cal = list(csv.DictReader(io.TextIOWrapper(z.open("calendar.txt"), "utf-8-sig")))
    start, end = min(r["start_date"] for r in cal), max(r["end_date"] for r in cal)
    add = defaultdict(list)
    add["agency.txt"].append({"agency_id": AGENCY, "agency_name": 'נעים בסופ"ש', "agency_url": "https://busofash.co.il",
                              "agency_timezone": "Asia/Jerusalem", "agency_lang": "he"})
    for k, day in (("fri", "friday"), ("sat", "saturday")):
        add["calendar.txt"].append({"service_id": f"{AGENCY}-{k}", **{d: "1" if d == day else "0" for d in
                                    ("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")}, "start_date": start, "end_date": end})
    n_trips = 0
    for i, d in enumerate(dirs):
        S = [stops_by_code[c] for c in d["stops"]]
        rid, shape = f"{AGENCY}-{d['line']}-{i}", f"{AGENCY}-{d['line']}-{i}"
        end_of = lambda s: f"{s['name']}-{s['city']}"
        add["routes.txt"].append({"route_id": rid, "agency_id": AGENCY, "route_short_name": str(d["line"]),
                                  "route_long_name": f"{end_of(S[0])}<->{end_of(S[-1])}-1#", "route_desc": f"99{d['line']}-{i % 2 + 1}-#",
                                  "route_type": "3", "route_color": d["color"]})
        for n, (lon, lat) in enumerate(d["course"]):
            add["shapes.txt"].append({"shape_id": shape, "shape_pt_lat": f"{lat:.6f}", "shape_pt_lon": f"{lon:.6f}", "shape_pt_sequence": str(n + 1)})
        gaps = [math.hypot(*(a - b for a, b in zip(xy(S[j + 1]["lat"], S[j + 1]["lon"], S[0]["lat"]), xy(S[j]["lat"], S[j]["lon"], S[0]["lat"]))))
                for j in range(len(S) - 1)]
        for k, (h0, h1) in HOURS.items():
            runs = [max(30, round(g / SPEED[k])) for g in gaps]
            total = sum(runs)
            t0 = h0
            while t0 + total <= h1:   # the last trip ends by the end of the service
                tid = f"{rid}-{k}-{t0 // 60}"
                add["trips.txt"].append({"route_id": rid, "service_id": f"{AGENCY}-{k}", "trip_id": tid, "trip_headsign": S[-1]["name"],
                                         "direction_id": str(i % 2), "shape_id": shape})
                t = t0
                for j, s in enumerate(S):
                    if j:
                        t += runs[j - 1]
                    hms = f"{t // 3600:02d}:{t % 3600 // 60:02d}:{t % 60:02d}"
                    add["stop_times.txt"].append({"trip_id": tid, "arrival_time": hms, "departure_time": hms, "stop_id": s["id"], "stop_sequence": str(j + 1)})
                n_trips += 1
                t0 += HEADWAY
    tmp = gtfs + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as out:
        for info in z.infolist():
            with z.open(info) as src:
                data = src.read()
            if info.filename in add:
                head = next(csv.reader(io.StringIO(data[:4096].decode("utf-8-sig"))))
                buf = io.StringIO()
                w = csv.DictWriter(buf, fieldnames=head, extrasaction="ignore", lineterminator="\r\n")
                w.writerows(add[info.filename])
                text = data.decode("utf-8-sig")
                data = ("﻿" + text + ("" if text.endswith("\n") else "\r\n") + buf.getvalue()).encode("utf-8")
            # the members keep their own times: the same lines give the same zip, so the build's caches still hold
            out.writestr(zipfile.ZipInfo(info.filename, date_time=info.date_time), data, compress_type=zipfile.ZIP_DEFLATED)
    os.replace(tmp, gtfs)
    log(f"added {len(dirs)} directions, {n_trips} estimated trips to {gtfs}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("gtfs")
    ap.add_argument("--cache", default="data/weekend.json")
    a = ap.parse_args()
    try:
        data = fetch()
        with open(a.cache, "w") as f:
            json.dump(data, f)
    except Exception as e:  # noqa: BLE001
        if not os.path.exists(a.cache):
            log(f"the municipality's server did not answer ({e}) and nothing is kept: no weekend lines this time")
            return
        log(f"the municipality's server did not answer ({e}): the answer kept from before is used")
        data = json.load(open(a.cache))
    z = zipfile.ZipFile(a.gtfs)
    if any(r.get("agency_id") == AGENCY for r in csv.DictReader(io.TextIOWrapper(z.open("agency.txt"), "utf-8-sig"))):
        log("the weekend lines are in this feed already")
        return
    stops_by_code = {}
    for r in csv.DictReader(io.TextIOWrapper(z.open("stops.txt"), "utf-8-sig")):
        try:
            m = CITY_RE.search(r.get("stop_desc", "") or "")
            stops_by_code[int(r["stop_code"])] = {"id": r["stop_id"], "lat": float(r["stop_lat"]), "lon": float(r["stop_lon"]),
                                                  "name": r["stop_name"], "city": m.group(1) if m else ""}
        except ValueError:
            continue
    codes = {f["properties"].get("stop_code") for f in data["stops"]} & set(stops_by_code)
    merge(a.gtfs, directions(data, stops_by_code, headings(a.gtfs, codes, stops_by_code)), stops_by_code)


if __name__ == "__main__":
    main()
