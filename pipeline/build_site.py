#!/usr/bin/env python3
"""Assemble the deployable site: the built app shell plus the data files and a manifest.

    npm run build && python3 pipeline/build_site.py --out site

Copies dist/* (the Vite build), data/timetable-YYYYMMDD.bin.gz and data/streets.bin.gz, places.bin.gz, shapes.bin.gz and
railtimes.json (learned train section times), bustimes.bin.gz (learned bus section times),
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
DIST = ROOT / "dist"   # the Vite build (npm run build): the shell, hashed assets, the service worker


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
    if not (DIST / "index.html").exists():
        raise SystemExit("no dist/index.html; run `npm run build` first")
    shutil.copytree(DIST, out)
    (out / "data").mkdir(parents=True)
    built = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sw = out / "sw.js"
    sw.write_text(sw.read_text(encoding="utf-8").replace("__BUILD__", built), encoding="utf-8")
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
    shapes = None
    hp = data / "shapes.bin.gz"
    if hp.exists():
        h = header_of(hp)
        shutil.copy(hp, out / "data" / hp.name)
        shapes = {"file": hp.name, "bytes": hp.stat().st_size, "counts": h["counts"], "built": h.get("built")}
    places = None
    pp = data / "places.bin.gz"
    if pp.exists():
        h = header_of(pp)
        shutil.copy(pp, out / "data" / pp.name)
        places = {"file": pp.name, "bytes": pp.stat().st_size, "counts": h["counts"], "built": h.get("built")}
    railtimes = None
    rp = data / "railtimes.json"
    if rp.exists():
        r = json.loads(rp.read_text(encoding="utf-8"))
        shutil.copy(rp, out / "data" / rp.name)
        railtimes = {"file": rp.name, "bytes": rp.stat().st_size, "built": r.get("built"), "days": r.get("days"), "sections": len(r.get("s", {}))}
    bustimes = None
    bp = data / "bustimes.bin.gz"
    if bp.exists():
        h = header_of(bp)
        shutil.copy(bp, out / "data" / bp.name)
        bustimes = {"file": bp.name, "bytes": bp.stat().st_size, "built": h.get("built"), "days": h.get("days"), "sections": h.get("n")}
    first = header_of(data / days[0]["file"])
    manifest = {
        "built": built,
        "feed": {"start": (first.get("feed") or {}).get("feed_start_date"), "end": (first.get("feed") or {}).get("feed_end_date"),
                 "version": (first.get("feed") or {}).get("feed_version")},
        "days": days,
        "streets": streets,
        "places": places,
        "shapes": shapes,
        "railtimes": railtimes,
        "bustimes": bustimes,
    }
    (out / "data" / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    total = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"site: {len(days)} days, streets {'yes' if streets else 'no'}, places {'yes' if places else 'no'}, shapes {'yes' if shapes else 'no'}, {total/1e6:.1f} MB in {out}")


if __name__ == "__main__":
    main()
