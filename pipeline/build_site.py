#!/usr/bin/env python3
"""Assemble the deployable site: the app shell plus the data files and a manifest.

    python3 pipeline/build_site.py --out site

Copies app/* (not the test harnesses), data/timetable-YYYYMMDD.bin.gz and data/streets.bin.gz,
and writes site/data/manifest.json with the available days.
"""
import argparse
import datetime
import gzip
import json
import pathlib
import re
import shutil
import struct

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP_FILES = ["index.html", "app.js", "worker.js", "raptor.js", "streets.js", "places.js", "live.js", "store.js", "follow.js", "styles.css", "sw.js", "manifest.webmanifest"]


def header_of(path):
    with gzip.open(path, "rb") as f:
        hlen = struct.unpack("<I", f.read(4))[0]
        return json.loads(f.read(hlen).decode("utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="site")
    ap.add_argument("--data", default="data")
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    (out / "data").mkdir(parents=True)
    (out / "icons").mkdir()
    for name in APP_FILES:
        shutil.copy(ROOT / "app" / name, out / name)
    for p in (ROOT / "app" / "icons").glob("*.png"):
        shutil.copy(p, out / "icons" / p.name)
    data = pathlib.Path(args.data)
    days = []
    for p in sorted(data.glob("timetable-*.bin.gz")):
        m = re.match(r"timetable-(\d{8})\.bin\.gz$", p.name)
        if not m:
            continue
        h = header_of(p)
        shutil.copy(p, out / "data" / p.name)
        days.append({"date": m.group(1), "file": p.name, "bytes": p.stat().st_size, "trips": h["counts"]["trips"], "stops": h["counts"]["stops"]})
    if not days:
        raise SystemExit("no data/timetable-YYYYMMDD.bin.gz files; run pipeline/compile.py first")
    streets = None
    sp = data / "streets.bin.gz"
    if sp.exists():
        h = header_of(sp)
        shutil.copy(sp, out / "data" / sp.name)
        streets = {"file": sp.name, "bytes": sp.stat().st_size, "nodes": h["counts"]["nodes"], "built": h.get("built")}
    places = None
    pp = data / "places.bin.gz"
    if pp.exists():
        h = header_of(pp)
        shutil.copy(pp, out / "data" / pp.name)
        places = {"file": pp.name, "bytes": pp.stat().st_size, "counts": h["counts"], "built": h.get("built")}
    first = header_of(data / days[0]["file"])
    manifest = {
        "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "feed": {"start": (first.get("feed") or {}).get("feed_start_date"), "end": (first.get("feed") or {}).get("feed_end_date"),
                 "version": (first.get("feed") or {}).get("feed_version")},
        "days": days,
        "streets": streets,
        "places": places,
    }
    (out / "data" / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    total = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"site: {len(days)} days, streets {'yes' if streets else 'no'}, places {'yes' if places else 'no'}, {total/1e6:.1f} MB in {out}")


if __name__ == "__main__":
    main()
