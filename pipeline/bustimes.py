#!/usr/bin/env python3
"""Learn how long buses really take between stops, by hour and kind of day, from the last days' positions.

    python3 -I pipeline/bustimes.py data/gtfs.zip --history data/bushist --days 14 --out data/bustimes.bin.gz
    python3 -I pipeline/bustimes.py data/gtfs.zip --history data/bushist --score 2026-10-22   (measure, that day held out)

The timetable gives a stretch of road the same time all day, and buses do not keep it: on Namir Road southbound
the feed says 6.5 minutes at every hour, buses took 6.5 at 06:00 and 18 at 16:00 (2026-10-18..22). Predicting from
it, the app was 2.5 minutes optimistic in the median.

Source: Hasadna's copy of the Ministry's SIRI feed, one snapshot of every vehicle a minute
(https://open-bus-siri-requester.hasadna.org.il/, YYYY/MM/DD/HH/MM.br in UTC; the same files the app's relay passes on).
For each service day just over its minutes are read once, 04:00 to 03:00 the next morning (about 1,380 files,
~300 MB), and every bus ride (a line and its scheduled start; trains have pipeline/railtimes.py) is matched to its
trip in the feed. Each position is placed along the trip's stops as the app does (src/live.js, projectOnStops: the
nearest straight segment between consecutive stops), searched forward from the last one so a loop is not read
backwards; where the ride passed each stop is interpolated between the positions either side, at most 3 minutes
apart. That is the day's passage log, kept in --history (one gzipped JSON line per ride: its route, start, stop codes,
scheduled arrivals and passing times; the day's raw files are not kept). Everything else is computed from the logs.

Learning: for each section between two consecutive stops (stop code > stop code), all lines on it pooled (they move
alike: their medians are within about 5% of each other), the median time buses took, per hour of the day (05..23,
then the night) and kind of day (Sunday to Thursday, Friday, Saturday). A cell with fewer than 3 runs borrows the
hours either side; still short, it stays empty and the app uses the timetable there. Holidays count as their weekday.

Output: a gzipped binary, a JSON header {"built", "days", "bands", "kinds", "n"} after its u32 length, then n u32
codes of the sections' first stops, n u32 codes of their second stops, and n x kinds x bands u8 times
(0 unknown; v <= 150 is 2v seconds, above that 300 + 15 (v - 150)).
"""
import argparse, array, bisect, concurrent.futures as cf, csv, datetime as dt, gzip, io, json, math, os, statistics as st
import struct, sys, time, urllib.request, zipfile
from collections import defaultdict

BASE = "https://open-bus-siri-requester.hasadna.org.il"
FIRST_H, LAST_H = 4, 27          # service-day hours read: 04:00 to 03:00 the next morning, Israel time
BANDS = 20                       # hours 05..23 (band 0 also takes the hours before 05), band 19 the night
KINDS = 3                        # Sunday to Thursday, Friday, Saturday
ON_PATH = 120                    # m: further from its trip's stops, a position is not used
GAP = 180                        # s: a stop is passed between two positions at most this far apart
TRAIN_OPERATOR = "2"


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


def kind_of(day):
    """0 Sunday to Thursday, 1 Friday, 2 Saturday."""
    w = dt.date.fromisoformat(day).weekday()   # Monday 0
    return 1 if w == 4 else 2 if w == 5 else 0


def band_of(sec):
    h = int(sec // 3600)
    return 0 if h < 5 else min(BANDS - 1, h - 5)


def enc(s):
    """Seconds to one byte (0 is unknown): 2 s steps to 5 minutes, 15 s steps to 31 minutes."""
    if s is None or s <= 0:
        return 0
    v = round(s / 2) if s <= 300 else 150 + round((s - 300) / 15)
    return max(1, min(255, v))


def dec(v):
    return None if not v else 2 * v if v <= 150 else 300 + 15 * (v - 150)


# ---------------------------------------------------------------- the day's positions
def minute_file(day, sec):
    """The snapshot of the minute `sec` seconds after the midnight that starts the service day."""
    tz = il_offset(day)
    t = dt.datetime.fromisoformat(day).replace(tzinfo=tz) + dt.timedelta(seconds=sec)
    u = t.astimezone(dt.timezone.utc)
    return f"{u:%Y/%m/%d/%H/%M}.br"


def fetch(path):
    import brotli
    for attempt in range(4):
        try:
            with urllib.request.urlopen(f"{BASE}/{path}", timeout=60) as r:
                return json.loads(brotli.decompress(r.read()))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None   # a minute the requester missed
            log(f"  {path}: {e} (try {attempt + 1})")
        except Exception as e:  # noqa: BLE001  (network: retried)
            log(f"  {path}: {e} (try {attempt + 1})")
        time.sleep(5 * (attempt + 1))
    return None


def positions(day):
    """Every bus ride's positions on a service day: {(line_ref, start_sec): [(t, lat, lon), ...]} in seconds from the
    midnight that starts the day, each report once (a vehicle's last report repeats in the minutes it is quiet)."""
    tz = il_offset(day)
    midnight = dt.datetime.fromisoformat(day).replace(tzinfo=tz)
    secs = lambda s: (dt.datetime.fromisoformat(s) - midnight).total_seconds()
    rides = defaultdict(lambda: array.array("d"))
    reports = 0
    files = [minute_file(day, m * 60) for m in range(FIRST_H * 60, LAST_H * 60)]
    got = missing = 0
    def chunks():   # an hour at a time, so downloads never run far ahead of the reading
        with cf.ThreadPoolExecutor(max_workers=4) as ex:   # four at a time: Hasadna's server is shared
            for i in range(0, len(files), 60):
                yield from ex.map(fetch, files[i:i + 60])
                log(f"  {day}: {FIRST_H + i // 60 + 1:02d}:00 read")
    for j in chunks():
        if j is None:
            missing += 1
            continue
        got += 1
        for d in j.get("Siri", {}).get("ServiceDelivery", {}).get("StopMonitoringDelivery", []):
            for x in d.get("MonitoredStopVisit", []):
                m = x.get("MonitoredVehicleJourney") or {}
                loc = m.get("VehicleLocation")
                if not loc or m.get("OperatorRef") == TRAIN_OPERATOR:
                    continue
                try:
                    start, t = secs(m["OriginAimedDepartureTime"]), secs(x["RecordedAtTime"])
                    lat, lon = float(loc["Latitude"]), float(loc["Longitude"])
                except (TypeError, ValueError, KeyError):
                    continue
                if not (0 <= start < 30 * 3600) or not lat:
                    continue   # a ride of another service day (the night before, the morning after)
                a = rides[(str(m.get("LineRef")), int(start))]
                if len(a) and a[-3] >= t:
                    continue   # the same report again (minutes come in order)
                a.extend((t, lat, lon))
                reports += 1
    log(f"{day}: {got} minutes read, {missing} missing, {len(rides)} bus rides, {reports} reports")
    return {k: sorted(zip(v[0::3], v[1::3], v[2::3])) for k, v in rides.items()}


# ---------------------------------------------------------------- the feed
class Feed:
    WD = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        self.cal = {r["service_id"]: r for r in self.rows("calendar.txt")}
        self.trips = {r["trip_id"]: (r["route_id"], r["service_id"]) for r in self.rows("trips.txt")}
        self.stops = {}
        for r in self.rows("stops.txt"):
            try:
                self.stops[r["stop_id"]] = (float(r["stop_lat"]), float(r["stop_lon"]), int(r["stop_code"] or 0))
            except ValueError:
                continue
        # the first departure of every trip (one pass over stop_times), then candidates by (route, start)
        starts = {}
        for trip, seq, stop, arr, dep in self.stop_times():
            if seq == 1 or trip not in starts or seq < starts[trip][0]:
                starts[trip] = (seq, dep)
        self.by_start = defaultdict(list)
        for trip, (_, dep) in starts.items():
            if trip in self.trips:
                self.by_start[(self.trips[trip][0], dep)].append(trip)
        log(f"feed: {len(self.trips)} trips, {len(self.stops)} stops")

    def rows(self, n):
        with self.z.open(n) as f:
            yield from csv.DictReader(io.TextIOWrapper(f, "utf-8-sig"))

    def stop_times(self, only=None):
        def hms(s):
            h, m, x = s.split(":")
            return int(h) * 3600 + int(m) * 60 + int(x)
        with self.z.open("stop_times.txt") as f:
            rd = csv.reader(io.TextIOWrapper(f, "utf-8-sig"))
            hdr = next(rd)
            ti, ai, di, si, qi = (hdr.index(k) for k in ("trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"))
            for r in rd:
                if only is None or r[ti] in only:
                    yield r[ti], int(r[qi]), r[si], hms(r[ai]), hms(r[di])

    def runs_on(self, sid, day):
        c = self.cal.get(sid)
        if not c:
            return 0
        d = day.replace("-", "")
        weekday = c[self.WD[dt.date.fromisoformat(day).weekday()]] == "1"
        return 2 if weekday and c["start_date"] <= d <= c["end_date"] else 1 if weekday else 0

    def match(self, keys, day):
        """Each ride's trip: the line's trip leaving then, running that day, else on that weekday, else any (same stops)."""
        chosen = {}
        for route, start in keys:
            c = self.by_start.get((route, start)) or []
            if c:
                chosen[(route, start)] = max(c, key=lambda t: self.runs_on(self.trips[t][1], day))
        rows = defaultdict(list)
        for trip, seq, stop, arr, dep in self.stop_times(set(chosen.values())):
            rows[trip].append((seq, stop, arr, dep))
        out = {}
        for k, trip in chosen.items():
            S = []
            for _, stop, arr, dep in sorted(rows[trip]):
                s = self.stops.get(stop)
                if s:
                    S.append({"lat": s[0], "lon": s[1], "code": s[2], "arr": arr, "dep": dep})
            if len(S) >= 2:
                out[k] = S
        return out


# ---------------------------------------------------------------- passing the stops
def proj(lat, lon, S, lo, hi):
    """src/live.js projectOnStops over the segments lo..hi: the nearest one, the fraction along it, metres off."""
    best = (lo, 0.0, float("inf"))
    kx, ky = 111320 * math.cos(lat * math.pi / 180), 110540
    for i in range(lo, hi + 1):
        ax, ay = (S[i]["lon"] - lon) * kx, (S[i]["lat"] - lat) * ky
        bx, by = (S[i + 1]["lon"] - lon) * kx, (S[i + 1]["lat"] - lat) * ky
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        f = max(0.0, min(1.0, -(ax * dx + ay * dy) / l2)) if l2 > 0 else 0.0
        d = math.hypot(ax + f * dx, ay + f * dy)
        if d < best[2]:
            best = (i, f, d)
    return best


def progress(fixes, S):
    """Where along its trip each position is (stop index plus the fraction to the next), never going back."""
    n, out, cur, last_t = len(S), [], None, None
    for t, lat, lon in fixes:
        if cur is None:
            i, f, d = proj(lat, lon, S, 0, n - 2)
        else:   # forward from the last place: as far as a bus could get since (a stop every 15 s, generously)
            i, f, d = proj(lat, lon, S, max(0, cur - 1), min(n - 2, cur + 2 + int((t - last_t) / 15)))
        if d > ON_PATH:
            continue
        p = i + f
        if out and p < out[-1][1]:
            if p < out[-1][1] - 0.15:
                continue   # a jump back: a stale or wrong position
            p = out[-1][1]   # standing (GPS wanders a little)
        out.append((t, p))
        cur, last_t = i, t
    return out


def passages(prog, n):
    """When the ride reached each stop (its departure from the first), interpolated between positions either side."""
    out = [None] * n
    for (t1, p1), (t2, p2) in zip(prog, prog[1:]):
        if t2 - t1 > GAP or p2 <= p1:
            continue
        if p1 <= 0.02 < p2 and out[0] is None:   # leaving the first stop
            out[0] = t1 + (t2 - t1) * (0.02 - p1) / (p2 - p1)
        k = max(1, math.floor(p1) + 1) if p1 > 0 else 1
        while k <= p2 + 1e-9 and k < n:
            if out[k] is None:
                out[k] = t1 + (t2 - t1) * (k - p1) / (p2 - p1)
            k += 1
    return out


def passage_log(feed, day):
    pos = positions(day)
    trips = feed.match(pos.keys(), day)
    rides, used = [], 0
    for key, S in trips.items():
        prog = progress(pos[key], S)
        if len(prog) < 3 or len(prog) < 0.5 * len(pos[key]):
            continue   # most of its positions off this trip's path: not this trip (or a detour)
        P = passages(prog, len(S))
        # a passing hours from the timetable is a glitch (a position from another time)
        P = [p if p is not None and -900 <= p - (s["dep"] if i == 0 else s["arr"]) <= 5400 else None for i, (p, s) in enumerate(zip(P, S))]
        if sum(p is not None for p in P) < 2:
            continue
        used += 1
        rides.append({"r": key[0], "s": key[1], "c": [s["code"] for s in S], "a": [s["dep"] if i == 0 else s["arr"] for i, s in enumerate(S)],
                      "p": [round(p) if p is not None else None for p in P], "x": [round(prog[0][0]), round(prog[-1][0])]})
    log(f"{day}: {len(trips)} of {len(pos)} rides matched to a trip, {used} with passings")
    return rides


def update_history(feed, hist, days):
    os.makedirs(hist, exist_ok=True)
    keep = {f"{d}.jsonl.gz" for d in days}
    for f in os.listdir(hist):
        if f.endswith(".jsonl.gz") and f not in keep:
            os.remove(os.path.join(hist, f))
    for d in days:
        path = os.path.join(hist, f"{d}.jsonl.gz")
        if os.path.exists(path):
            continue
        rides = passage_log(feed, d)
        if len(rides) < 1000:
            log(f"{d}: only {len(rides)} rides, not kept (the source was down?)")
            continue
        tmp = path + ".tmp"
        with gzip.open(tmp, "wt") as f:
            for r in rides:
                f.write(json.dumps(r, separators=(",", ":")) + "\n")
        os.replace(tmp, path)
        log(f"{d}: kept {len(rides)} rides, {os.path.getsize(path) / 1e6:.1f} MB")


def read_log(hist, day):
    with gzip.open(os.path.join(hist, f"{day}.jsonl.gz"), "rt") as f:
        return [json.loads(x) for x in f]


# ---------------------------------------------------------------- learning
def sections_of(R):
    """A ride's section runs: (key, band, seconds, scheduled seconds) between consecutive stops it was seen passing."""
    c, a, p = R["c"], R["a"], R["p"]
    for k in range(len(c) - 1):
        if p[k] is None or p[k + 1] is None or not c[k] or not c[k + 1]:
            continue
        run, sched = p[k + 1] - p[k], a[k + 1] - a[k]
        if not (max(5, 0.25 * sched) <= run <= 5 * sched + 600):
            continue   # a mismatch, or a stop the interpolation got wrong
        yield (c[k], c[k + 1]), band_of(p[k]), run, sched


def learn(logs):
    """logs: [(kind, rides)]. The median run per section, kind of day and hour band (neighbours lend when short)."""
    runs = defaultdict(list)
    for kind, rides in logs:
        for R in rides:
            for key, b, run, _ in sections_of(R):
                runs[(key, kind, b)].append(run)
    keys = sorted({k[0] for k in runs})
    table = {}
    for key in keys:
        row = bytearray(KINDS * BANDS)
        for kind in range(KINDS):
            for b in range(BANDS):
                v = runs.get((key, kind, b), [])
                if len(v) < 3:
                    v = v + runs.get((key, kind, b - 1), []) + runs.get((key, kind, b + 1), [])
                if len(v) >= 3:
                    row[kind * BANDS + b] = enc(st.median(v))
        if any(row):
            table[key] = row
    return table


def write(table, days, out):
    keys = sorted(table)
    head = json.dumps({"built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "days": days,
                       "bands": BANDS, "kinds": KINDS, "n": len(keys)}, separators=(",", ":")).encode()
    head += b" " * (-len(head) % 4)
    body = struct.pack("<I", len(head)) + head
    body += array.array("I", [k[0] for k in keys]).tobytes() + array.array("I", [k[1] for k in keys]).tobytes()
    body += b"".join(bytes(table[k]) for k in keys)
    with gzip.open(out + ".tmp", "wb", 9) as f:
        f.write(body)
    os.replace(out + ".tmp", out)
    log(f"wrote {out}: {len(keys)} sections, {len(body) / 1e6:.1f} MB raw, {os.path.getsize(out) / 1e6:.2f} MB gzip")


# ---------------------------------------------------------------- measuring (the app's estimates, side by side)
def run_of(table, kind, c, a, k, at):
    """The learned run of section k at time `at`, else the timetable's."""
    row = table.get((c[k], c[k + 1]))
    v = dec(row[kind * BANDS + band_of(at)]) if row else None
    return v if v is not None else max(0, a[k + 1] - a[k])


LIVE_WINDOW = 900   # s: buses that finished a section this recently tell how it runs now
LIVE_LAG = 60       # s: the newest of them is a minute old (the relay's snapshot)
LIVE_FADE = 1800    # s: further ahead than this, the live state says nothing more than the learned hour


def traversals(table, rides, kind):
    """Every section run of the day as a ratio to its learned time: {key: ([end times], [(ratio, ride)])}, by end time."""
    out = defaultdict(list)
    for n, R in enumerate(rides):
        c, a, p = R["c"], R["a"], R["p"]
        for k in range(len(c) - 1):
            if p[k] is None or p[k + 1] is None:
                continue
            run, learned = p[k + 1] - p[k], run_of(table, kind, c, a, k, p[k])
            if learned >= 20 and max(5, 0.25 * learned) <= run <= 5 * learned + 600:
                out[(c[k], c[k + 1])].append((p[k + 1], run / learned, n))
    return {k: ([x[0] for x in v], [(x[1], x[2]) for x in sorted(v)]) for k, v in ((k, sorted(v)) for k, v in out.items())}


def live_factor(trav, key, t0, ride):
    """How the section runs now against its learned time: the recent runs of other buses, shrunk towards 1 when few."""
    v = trav.get(key)
    if not v:
        return 1.0
    lo, hi = bisect.bisect_right(v[0], t0 - LIVE_WINDOW), bisect.bisect_right(v[0], t0 - LIVE_LAG)
    rs = [r for r, n in v[1][lo:hi] if n != ride]
    if not rs:
        return 1.0
    m = st.median(rs)
    return 1 + (m - 1) * len(rs) / (len(rs) + 2)


def score(table, rides, kind):
    ahead = (1, 2, 3, 5, 10)
    trav = traversals(table, rides, kind)
    names = ("timetable (today)", "learned", "learned + live", "learned + live + own pace")
    errs = {nm: defaultdict(list) for nm in names}
    peak = {nm: defaultdict(list) for nm in names}
    for ri in range(0, len(rides), 2):
        R = rides[ri]
        c, a, p = R["c"], R["a"], R["p"]
        n = len(c)
        seen = [(k, p[k]) for k in range(n) if p[k] is not None]
        for k, t in seen[::2]:   # the bus seen at stop k at time t (the app sees it between stops too; this is the bulk)
            delay = t - a[k]
            # its own pace: its last three sections against their learned times
            own = [(p[j + 1] - p[j]) / run_of(table, kind, c, a, j, p[j]) for j in range(max(0, k - 3), k)
                   if p[j] is not None and p[j + 1] is not None and run_of(table, kind, c, a, j, p[j]) >= 20]
            own_f = st.median(own) if own else 1.0
            at = {nm: t for nm in names[1:]}
            for j in range(k + 1, min(n, k + max(ahead) + 1)):
                key = (c[j - 1], c[j])
                for nm in names[1:]:
                    r = run_of(table, kind, c, a, j - 1, at[nm])
                    if nm != "learned":
                        w = max(0.0, 1 - (at[nm] - t) / LIVE_FADE)
                        f = 1 + (live_factor(trav, key, t, ri) - 1) * w
                        if nm.endswith("own pace") and j - k <= 3:
                            f *= 1 + (min(2.0, max(0.5, own_f)) - 1) * 0.5 * (1 - (j - k - 1) / 3)
                        r *= f
                    at[nm] += r
                if j - k in ahead and p[j] is not None:
                    preds = {"timetable (today)": a[j] + delay, **at}
                    for nm in names:
                        errs[nm][j - k].append(preds[nm] - p[j])
                        if 7 * 3600 <= t < 9 * 3600 or 16 * 3600 <= t < 19 * 3600:
                            peak[nm][j - k].append(preds[nm] - p[j])
    for title, E in (("all day", errs), ("peaks (07-09, 16-19)", peak)):
        print(f"  {title}:")
        for n in ahead:
            print(f"    {n} stop{'s' if n > 1 else ''} ahead ({len(E['learned'][n])} predictions):")
            for nm, e in E.items():
                v = e[n]
                if v:
                    a_, b_ = sorted(abs(x) for x in v), sorted(v)
                    print(f"      {nm:28s} {sum(x <= 60 for x in a_) / len(a_):4.0%} within a minute, half within {a_[len(a_) // 2] / 60:4.1f} min, "
                          f"90% within {a_[int(len(a_) * 0.9)] / 60:4.1f}, median {b_[len(b_) // 2] / 60:+.1f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("gtfs")
    ap.add_argument("--history", default="data/bushist")
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--fetch-days", type=int, default=3, help="at most this many missing days fetched per run (the history fills over nights)")
    ap.add_argument("--out", default="data/bustimes.bin.gz")
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--only", help="fetch just this day (YYYY-MM-DD) and stop")
    ap.add_argument("--score", help="a day (YYYY-MM-DD) to measure on, held out of the learning")
    a = ap.parse_args()
    today = (dt.datetime.now(il_offset(dt.date.today().isoformat())) - dt.timedelta(hours=3)).date()
    days = [(today - dt.timedelta(days=i)).isoformat() for i in range(1, a.days + 1)]
    if a.only or not a.no_fetch:
        feed = Feed(a.gtfs)
        if a.only:
            update_history(feed, a.history, [a.only] + [f[:10] for f in os.listdir(a.history) if f.endswith(".jsonl.gz")] if os.path.isdir(a.history) else [a.only])
            return
        have = {f[:10] for f in os.listdir(a.history)} if os.path.isdir(a.history) else set()
        missing = [d for d in days if d not in have][: a.fetch_days]
        update_history(feed, a.history, sorted(set(days) & (have | set(missing))))
    have = sorted(f[:10] for f in os.listdir(a.history) if f.endswith(".jsonl.gz"))
    learn_days = [d for d in have if d != a.score]
    table = learn([(kind_of(d), read_log(a.history, d)) for d in learn_days])
    log(f"learned from {len(learn_days)} days: {len(table)} sections")
    if a.score:
        score(table, read_log(a.history, a.score), kind_of(a.score))
        return
    write(table, learn_days, a.out)


if __name__ == "__main__":
    main()
