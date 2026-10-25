#!/usr/bin/env python3
"""Learn how long trains really take between stations, from the last days' positions.

    python3 -I pipeline/railtimes.py data/gtfs.zip --history data/railhist --days 7 --out data/railtimes.json
    python3 -I pipeline/railtimes.py data/gtfs.zip --history data/railhist --score 2026-10-21   (measure, that day held out)

Hasadna's Open Bus database (open-bus-stride-api.hasadna.org.il, CC-BY) keeps every train position the Ministry's
SIRI feed reported, about one a minute. For each past ride this finds when the train arrived at and left each station
(the fixes within 300 m of it), and for each section between two stations learns the usual running time and how that
time spreads along it (time fraction at each tenth of the way: trains pull out slowly, brake, and slow down in
places), and how long a late train stands at each station (an early one waits for its time). Positions are taken along the straight line between the two
stations, exactly as the app does (src/engine/delays.js, projectOnStops), so the profile answers the app's own question.
A ride is matched to the feed's trip by its line and scheduled start; its stops come from that trip.

The history is kept an hour per file in --history and fetched only where missing (Hasadna caps a request at
15000 rows; an hour of trains is about 3500). Writes {"built", "days", "s": {"code>code": [run, g0..g10]},
"d": {code: dwell}}: seconds, the profile's fractions rounded. (A per-station catch-up, "h", learned from the drift of
the predictions on the learning days, was dropped 2026-10-25: backtested on two mornings' raw minute files it made
every prediction early, by 0.7 to 1.6 minutes in the median.)
"""
import argparse, concurrent.futures as cf, csv, datetime as dt, glob, io, json, math, os, statistics as st, sys, time
import urllib.parse, urllib.request, zipfile
from collections import defaultdict

STRIDE = "https://open-bus-stride-api.hasadna.org.il/siri_vehicle_locations/list"
AT = 300          # m: a train this close to a station is at it (the same in src/engine/delays.js)
OFF_PATH = 600    # m: further from the line between its stations, a fix is not used (as in the app)
HOURS = range(2, 23)   # UTC hours fetched per day: 05:00-02:00 Israel, the service day


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def il_offset(day):
    """Israel's UTC offset on a date: +3 from the Friday before the last Sunday of March to the last Sunday of October."""
    d = dt.date.fromisoformat(day)
    def last_sunday(m):
        x = dt.date(d.year, m, 31)
        return x - dt.timedelta(days=(x.weekday() + 1) % 7)
    start = last_sunday(3) - dt.timedelta(days=2)
    return dt.timezone(dt.timedelta(hours=3 if start <= d < last_sunday(10) else 2))


# ---------------------------------------------------------------- history
def fetch_hour(path, day, h):
    t0 = dt.datetime.fromisoformat(f"{day}T{h:02d}:00:00+00:00")
    q = {"siri_routes__operator_ref": 2, "limit": 15000,
         "recorded_at_time_from": t0.isoformat(), "recorded_at_time_to": (t0 + dt.timedelta(hours=1)).isoformat()}
    url = STRIDE + "?" + urllib.parse.urlencode(q)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=240) as r:
                rows = json.load(r)
            if isinstance(rows, list):
                if len(rows) >= 15000:
                    log(f"  {day} {h:02d}: 15000 rows, the hour is cut")   # not seen for trains; noted if it happens
                slim = [[x["siri_ride__id"], x["siri_route__line_ref"], x["siri_ride__scheduled_start_time"], x["recorded_at_time"],
                         x["lat"], x["lon"], x.get("velocity") or 0] for x in rows if x.get("lat") is not None]
                tmp = path + ".tmp"
                with open(tmp, "w") as f:
                    json.dump(slim, f, separators=(",", ":"))
                os.replace(tmp, path)
                return len(slim)
        except Exception as e:  # noqa: BLE001  (network: retried)
            log(f"  {day} {h:02d}: {e} (try {attempt + 1})")
        time.sleep(15 * (attempt + 1))
    return None


def update_history(hist, days):
    os.makedirs(hist, exist_ok=True)
    keep = {f"{d}-{h:02d}.json" for d in days for h in HOURS}
    for f in os.listdir(hist):
        if f.endswith(".json") and f not in keep:
            os.remove(os.path.join(hist, f))
    todo = [(os.path.join(hist, f"{d}-{h:02d}.json"), d, h) for d in days for h in HOURS if not os.path.exists(os.path.join(hist, f"{d}-{h:02d}.json"))]
    log(f"history: {len(keep) - len(todo)} hours kept, {len(todo)} to fetch")
    with cf.ThreadPoolExecutor(max_workers=2) as ex:   # two at a time: Hasadna's server is shared
        for (path, d, h), n in zip(todo, ex.map(lambda a: fetch_hour(*a), todo)):
            log(f"  {d} {h:02d}: {n if n is not None else 'failed'}")


# ---------------------------------------------------------------- the feed
class Feed:
    WD = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

    def __init__(self, path):
        z = zipfile.ZipFile(path)
        def rows(n):
            with z.open(n) as f:
                yield from csv.DictReader(io.TextIOWrapper(f, "utf-8-sig"))
        def hms(s):
            h, m, x = s.split(":")
            return int(h) * 3600 + int(m) * 60 + int(x)
        routes = {r["route_id"] for r in rows("routes.txt") if r["agency_id"] == "2"}   # Israel Railways
        self.cal = {r["service_id"]: r for r in rows("calendar.txt")}
        self.trips = {r["trip_id"]: r for r in rows("trips.txt") if r["route_id"] in routes}
        self.stops = {r["stop_id"]: (float(r["stop_lat"]), float(r["stop_lon"]), r["stop_code"]) for r in rows("stops.txt")}
        times = defaultdict(list)
        with z.open("stop_times.txt") as f:
            rd = csv.reader(io.TextIOWrapper(f, "utf-8-sig"))
            hdr = next(rd)
            ti, ai, di, si, qi = (hdr.index(k) for k in ("trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"))
            for r in rd:
                if r[ti] in self.trips:
                    times[r[ti]].append((int(r[qi]), r[si], hms(r[ai]), hms(r[di])))
        self.times = {t: sorted(v) for t, v in times.items()}
        self.by_start = defaultdict(list)
        for t, v in self.times.items():
            self.by_start[(self.trips[t]["route_id"], v[0][3])].append(t)

    def runs_on(self, sid, day):
        c = self.cal.get(sid)
        d = day.replace("-", "")
        return bool(c) and c["start_date"] <= d <= c["end_date"] and c[self.WD[dt.date.fromisoformat(day).weekday()]] == "1"

    def trip(self, route, start, day):
        """The trip of a line starting then: the one running that day, else one on another day (same stops)."""
        c = self.by_start.get((route, start)) or []
        on = [t for t in c if self.runs_on(self.trips[t]["service_id"], day)]
        return (on or c or [None])[0], bool(on)

    def stop_list(self, t):
        return [{"code": self.stops[s][2], "lat": self.stops[s][0], "lon": self.stops[s][1], "arr": a, "dep": d} for _, s, a, d in self.times[t]]


# ---------------------------------------------------------------- rides
def metres(a, b, c, d):
    return math.hypot((b - d) * 111320 * math.cos(a * math.pi / 180), (a - c) * 110540)


def project(lat, lon, S):
    """src/engine/delays.js projectOnStops: the nearest straight segment between consecutive stops, the fraction along it."""
    best = (0, 0.0, float("inf"))
    kx, ky = 111320 * math.cos(lat * math.pi / 180), 110540
    for i in range(len(S) - 1):
        ax, ay = (S[i]["lon"] - lon) * kx, (S[i]["lat"] - lat) * ky
        bx, by = (S[i + 1]["lon"] - lon) * kx, (S[i + 1]["lat"] - lat) * ky
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        f = max(0.0, min(1.0, -(ax * dx + ay * dy) / l2)) if l2 > 0 else 0.0
        d = math.hypot(ax + f * dx, ay + f * dy)
        if d < best[2]:
            best = (i, f, d)
    return best


def rides(feed, hist, day):
    """Each ride of a service day: its stops, when it arrived at and left each station, and its fixes between them."""
    raw = defaultdict(dict)
    for f in sorted(glob.glob(os.path.join(hist, f"{day}-*.json"))):   # 02-22 UTC: 05:00 to 02:00 in Israel
        try:
            for rid, line, start, rec, lat, lon, vel in json.load(open(f)):
                raw[rid][rec] = (line, start, lat, lon, vel)
        except Exception:  # noqa: BLE001  (a file cut short: that hour is skipped)
            continue
    tz = il_offset(day)
    out = []
    for rid, recs in raw.items():
        keys = sorted(recs)
        line, start = recs[keys[0]][0], recs[keys[0]][1]
        s0 = dt.datetime.fromisoformat(start).astimezone(tz)
        if s0.strftime("%Y-%m-%d") != day:
            continue
        midnight = dt.datetime.fromisoformat(day).replace(tzinfo=tz)
        t, exact = feed.trip(str(line), int((s0 - midnight).total_seconds()), day)
        if not t:
            continue
        S = feed.stop_list(t)
        fixes, prev = [], None
        for k in keys:
            _, _, lat, lon, vel = recs[k]
            if prev == (lat, lon) and vel > 5:
                continue   # the same fix again while said to move: a frozen position
            prev = (lat, lon)
            t = int((dt.datetime.fromisoformat(k) - midnight).total_seconds())
            # a ride's record can carry its train's fixes from hours before (the set's previous trip): only its own time
            if S[0]["dep"] - 1800 <= t <= S[-1]["arr"] + 5400:
                fixes.append((t, lat, lon))
        at = []
        for _, lat, lon in fixes:
            j = min(range(len(S)), key=lambda i: metres(lat, lon, S[i]["lat"], S[i]["lon"]))
            at.append(j if metres(lat, lon, S[j]["lat"], S[j]["lon"]) <= AT else None)
        arr, dep = {}, {}
        for n, j in enumerate(at):   # a station's arrival and departure: halfway between the fixes either side
            if j is None:
                continue
            if j not in arr and n > 0 and at[n - 1] != j:
                arr[j] = (fixes[n - 1][0] + fixes[n][0]) / 2
            if n + 1 < len(fixes) and at[n + 1] != j:
                dep[j] = (fixes[n][0] + fixes[n + 1][0]) / 2
        # an event hours away from the timetable is a glitch (a fix from another time, a set standing in a yard)
        sane = lambda j, v, sched: -900 <= v - sched <= 5400
        arr = {j: v for j, v in arr.items() if sane(j, v, S[j]["arr"])}
        dep = {j: v for j, v in dep.items() if sane(j, v, S[j]["dep"])}
        moving = []
        for (tt, lat, lon), j in zip(fixes, at):
            if j is None:
                i, f, d = project(lat, lon, S)
                late = tt - (S[i]["dep"] + f * max(0, S[i + 1]["arr"] - S[i]["dep"]))
                # before it left its first station a moving train is still on the trip before (it takes the next
                # trip's number early): not this trip's
                if tt < dep.get(0, S[0]["dep"] - 120):
                    continue
                if d <= OFF_PATH and -900 <= late <= 5400:   # the app's own bounds on a delay
                    moving.append((tt, i, f))
        out.append({"S": S, "arr": arr, "dep": dep, "moving": moving, "exact": exact})
    return out


# ---------------------------------------------------------------- learning
def learn(all_rides):
    runs, prof, dwell = defaultdict(list), defaultdict(list), defaultdict(list)
    for R in all_rides:
        S = R["S"]
        for k in range(len(S) - 1):
            if k in R["dep"] and k + 1 in R["arr"]:
                d0, a1 = R["dep"][k], R["arr"][k + 1]
                run, sched = a1 - d0, S[k + 1]["arr"] - S[k]["dep"]
                if not (0.4 * sched <= run <= 3 * sched + 300):
                    continue   # a mismatch or a stop that was missed
                key = f'{S[k]["code"]}>{S[k + 1]["code"]}'
                runs[key].append(run)
                prof[key] += [(f, (t - d0) / run) for t, i, f in R["moving"] if i == k and d0 < t < a1]
        for k in range(1, len(S) - 1):
            # the stand a late train needs: an early one waits for its time, which says nothing about a late one
            if k in R["arr"] and k in R["dep"] and R["dep"][k] > S[k]["dep"] + 60:
                dwell[S[k]["code"]].append(R["dep"][k] - R["arr"][k])
    sections = {}
    for key, rr in runs.items():
        if len(rr) < 3:
            continue
        bins = [[] for _ in range(11)]
        for f, g in prof[key]:
            bins[min(10, round(f * 10))].append(g)
        g = [0.0] + [st.median(b) if len(b) >= 3 else None for b in bins[1:10]] + [1.0]
        known = [i for i, v in enumerate(g) if v is not None]
        for i in range(11):   # tenths with too few fixes: straight between their neighbours
            if g[i] is None:
                lo, hi = max(j for j in known if j < i), min(j for j in known if j > i)
                g[i] = g[lo] + (g[hi] - g[lo]) * (i - lo) / (hi - lo)
        for i in range(1, 11):
            g[i] = min(1.0, max(g[i], g[i - 1]))
        sections[key] = [round(st.median(rr))] + [round(v, 3) for v in g]
    stands = {c: round(st.median(v)) for c, v in dwell.items() if len(v) >= 3}
    return sections, stands


# ---------------------------------------------------------------- measuring (the app's two estimates, side by side)
def ahead(sections, stands, S, k, x, t):
    """src/engine/delays.js railAhead for a train between stations k and k+1: its arrival at each later station."""
    run = lambda j: sections[f'{S[j]["code"]}>{S[j + 1]["code"]}'][0] if f'{S[j]["code"]}>{S[j + 1]["code"]}' in sections else max(0, S[j + 1]["arr"] - S[j]["dep"])
    m = sections.get(f'{S[k]["code"]}>{S[k + 1]["code"]}')
    if m:
        p = x * 10
        i = min(9, int(p))
        done = m[i + 1] + (m[i + 2] - m[i + 1]) * (p - i)
    else:
        done = x
    arr, a = {}, t + (1 - done) * run(k)
    for j in range(k + 1, len(S)):
        arr[j] = a
        if j == len(S) - 1:
            break
        d = max(S[j]["dep"], a + stands.get(S[j]["code"], S[j]["dep"] - S[j]["arr"]))
        a = d + run(j)
    return arr


def score(sections, stands, test):
    errs = {"timetable pace": defaultdict(list), "learned": defaultdict(list)}
    for R in test:
        if not R["exact"]:
            continue
        S = R["S"]
        for t, k, x in R["moving"]:
            old = t - (S[k]["dep"] + x * max(0, S[k + 1]["arr"] - S[k]["dep"]))
            new = ahead(sections, stands, S, k, x, t)
            for n in (1, 2, 3, 5):
                j = k + n
                if j < len(S) and j in R["arr"]:
                    errs["timetable pace"][n].append(S[j]["arr"] + old - R["arr"][j])
                    errs["learned"][n].append(new[j] - R["arr"][j])
    for n in (1, 2, 3, 5):
        line = [f"{n} station{'s' if n > 1 else ''} ahead ({len(errs['learned'][n])}):"]
        for name, e in errs.items():
            v = e[n]
            if v:   # medians and shares: a few rides stuck for an hour (no estimate foresees those) would rule a mean
                a, b = sorted(abs(x) for x in v), sorted(v)
                line.append(f"{name}: half within {a[len(a) // 2] / 60:.2f} min, 90% within {a[int(len(a) * 0.9)] / 60:.2f}, "
                            f"{sum(x <= 60 for x in a) / len(a):.0%} within a minute, median {b[len(b) // 2] / 60:+.2f}")
        print("  " + " | ".join(line))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("gtfs")
    ap.add_argument("--history", default="data/railhist")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--out", default="data/railtimes.json")
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--score", help="a day (YYYY-MM-DD) to measure on, held out of the learning")
    a = ap.parse_args()
    # the service days just over (until 03:00 the night belongs to the day before), newest first
    today = (dt.datetime.now(il_offset(dt.date.today().isoformat())) - dt.timedelta(hours=3)).date()
    days = [(today - dt.timedelta(days=i)).isoformat() for i in range(1, a.days + 1)]
    if not a.no_fetch:
        update_history(a.history, days)
    days = sorted({f[:10] for f in os.listdir(a.history) if f.endswith(".json")} - {a.score})
    feed = Feed(a.gtfs)
    learnt = [r for d in days for r in rides(feed, a.history, d)]
    sections, stands = learn(learnt)
    log(f"learned from {len(learnt)} rides on {len(days)} days: {len(sections)} sections, {len(stands)} stations")
    if a.score:
        score(sections, stands, rides(feed, a.history, a.score))
        return
    built = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(a.out, "w") as f:
        json.dump({"built": built, "days": days, "s": sections, "d": stands}, f, separators=(",", ":"))
    log(f"wrote {a.out}: {os.path.getsize(a.out)} bytes")


if __name__ == "__main__":
    main()
