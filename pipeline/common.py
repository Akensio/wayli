"""What the pipeline's scripts share: the log line, reading the GTFS feed, Israel's clock, distances on the ground.

The scripts run as `python3 -I pipeline/x.py`, which leaves their own folder off the import path, so each puts it
back before importing this:

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
"""
import csv
import datetime as dt
import io
import math
import sys
import time

EARTH_R = 6371000.0   # m


def log(*parts):
    """A line on stderr with the time it was written (the nightly logs then say how long each step took)."""
    print(f"[{time.strftime('%H:%M:%S')}]", *parts, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- the GTFS feed: a zip of CSV files

def member(zf, name):
    """A file of the feed as text (the Ministry's files start with a byte order mark)."""
    return io.TextIOWrapper(zf.open(name), encoding="utf-8-sig", newline="")


def rows(zf, name):
    """A file of the feed, a dict per row."""
    with member(zf, name) as f:
        yield from csv.DictReader(f)


def hms(s):
    """A GTFS time to seconds on its service day: "25:10:00" is 01:10 the night after."""
    h, m, sec = s.split(":")
    return int(h) * 3600 + int(m) * 60 + int(sec)


def stop_times(zf, only=None):
    """stop_times.txt as (trip, sequence, stop, arrival s, departure s), for the trips in `only` (all without it)."""
    with member(zf, "stop_times.txt") as f:
        rd = csv.reader(f)
        hdr = next(rd)
        ti, ai, di, si, qi = (hdr.index(k) for k in ("trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"))
        for r in rd:
            if only is None or r[ti] in only:
                yield r[ti], int(r[qi]), r[si], hms(r[ai]), hms(r[di])


# ---------------------------------------------------------------- Israel's clock

def il_offset(day):
    """Israel's UTC offset on a date: +3 from the Friday before the last Sunday of March to the last Sunday of October."""
    d = dt.date.fromisoformat(day)
    def last_sunday(m):
        x = dt.date(d.year, m, 31)
        return x - dt.timedelta(days=(x.weekday() + 1) % 7)
    start = last_sunday(3) - dt.timedelta(days=2)
    return dt.timezone(dt.timedelta(hours=3 if start <= d < last_sunday(10) else 2))


# ---------------------------------------------------------------- distances

def haversine(lat1, lon1, lat2, lon2):
    """Metres along the ground between two points (a great circle)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * EARTH_R * math.asin(math.sqrt(a))
