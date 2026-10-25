#!/usr/bin/env python3
"""The ground's height anywhere in the country, for the street graph's climbs (streets.py --dem).

    python3 -I pipeline/elevation.py --fetch data/dem          # download the tiles once (about 40 MB)
    python3 -I pipeline/elevation.py --at 32.7930 34.9896 data/dem   # one point, to check

Source: AWS's open Terrain Tiles (https://registry.opendata.aws/terrain-tiles/, no key; attribution in
https://github.com/tilezen/joerd/blob/master/docs/attribution.md), the "terrarium" PNGs where a pixel's
height is R*256 + G + B/256 - 32768 metres. Zoom 12: a pixel is about 32 m here, the resolution of the
SRTM data underneath. Heights are of the ground surface as the radar saw it in 2000 (in towns, partly of
the buildings), so climbs are counted with a hysteresis (streets.py) rather than vertex by vertex.
"""
import argparse
import concurrent.futures as cf
import math
import os
import sys
import urllib.request

import numpy as np

URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
Z = 12
BBOX = (29.40, 34.10, 33.50, 35.95)   # south, west, north, east: Israel and the Palestinian territories


def tile_x(lon, z=Z):
    return (lon + 180.0) / 360.0 * (1 << z)


def tile_y(lat, z=Z):
    r = math.radians(lat)
    return (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * (1 << z)


def tiles(bbox=BBOX, z=Z):
    s, w, n, e = bbox
    return [(x, y) for x in range(int(tile_x(w, z)), int(tile_x(e, z)) + 1) for y in range(int(tile_y(n, z)), int(tile_y(s, z)) + 1)]


def fetch(folder, z=Z):
    os.makedirs(folder, exist_ok=True)
    want = [(x, y) for x, y in tiles(z=z) if not os.path.exists(os.path.join(folder, f"{z}-{x}-{y}.png"))]

    def get(xy):
        x, y = xy
        path = os.path.join(folder, f"{z}-{x}-{y}.png")
        for attempt in range(4):
            try:
                with urllib.request.urlopen(URL.format(z=z, x=x, y=y), timeout=60) as r:
                    data = r.read()
                if data[:8] != b"\x89PNG\r\n\x1a\n":
                    raise ValueError("not a PNG")
                with open(path + ".part", "wb") as f:
                    f.write(data)
                os.replace(path + ".part", path)
                return
            except Exception as ex:   # noqa: BLE001 - retried, then reported
                err = ex
        raise RuntimeError(f"tile {z}/{x}/{y}: {err}")

    with cf.ThreadPoolExecutor(16) as pool:
        list(pool.map(get, want))
    print(f"dem: {len(tiles(z=z))} tiles in {folder}, {len(want)} fetched", file=sys.stderr)


class Dem:
    """Heights as one mosaic; `at` samples it bilinearly (arrays of lat and lon in, metres out)."""

    def __init__(self, folder, z=Z, smooth=0):
        from PIL import Image
        ts = tiles(z=z)
        self.z = z
        self.x0, self.y0 = min(x for x, _ in ts), min(y for _, y in ts)
        nx, ny = max(x for x, _ in ts) - self.x0 + 1, max(y for _, y in ts) - self.y0 + 1
        self.h = np.zeros((ny * 256, nx * 256), np.float32)
        for x, y in ts:
            path = os.path.join(folder, f"{z}-{x}-{y}.png")
            px = np.asarray(Image.open(path).convert("RGB"), np.float32)
            h = px[:, :, 0] * 256.0 + px[:, :, 1] + px[:, :, 2] / 256.0 - 32768.0
            oy, ox = (y - self.y0) * 256, (x - self.x0) * 256
            self.h[oy:oy + 256, ox:ox + 256] = h
        if smooth:
            self.h = blur(self.h, smooth)

    def at(self, lat, lon):
        lat = np.asarray(lat, np.float64); lon = np.asarray(lon, np.float64)
        n = 1 << self.z
        px = ((lon + 180.0) / 360.0 * n - self.x0) * 256.0 - 0.5
        r = np.radians(lat)
        py = ((1.0 - np.log(np.tan(r) + 1.0 / np.cos(r)) / np.pi) / 2.0 * n - self.y0) * 256.0 - 0.5
        H, W = self.h.shape
        px = np.clip(px, 0, W - 1.001); py = np.clip(py, 0, H - 1.001)
        x0 = np.floor(px).astype(np.int64); y0 = np.floor(py).astype(np.int64)
        fx = px - x0; fy = py - y0
        h = self.h
        top = h[y0, x0] * (1 - fx) + h[y0, x0 + 1] * fx
        bot = h[y0 + 1, x0] * (1 - fx) + h[y0 + 1, x0 + 1] * fx
        return top * (1 - fy) + bot * fy


def blur(h, r):
    """Box blur of radius r pixels along both axes, twice (close to a Gaussian): smooths the radar's few metres of noise
    and the buildings it saw, which counted as climbs on flat streets."""
    def box(a, axis):
        n = a.shape[axis]
        c = np.cumsum(np.pad(a, [(r + 1, r) if i == axis else (0, 0) for i in range(2)], mode="edge"), axis=axis, dtype=np.float64)
        hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
        lo = np.take(c, np.arange(0, n), axis=axis)
        return ((hi - lo) / (2 * r + 1)).astype(np.float32)
    for _ in range(2):
        h = box(box(h, 0), 1)
    return h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--at", nargs=2, type=float, metavar=("LAT", "LON"))
    a = ap.parse_args()
    if a.fetch:
        fetch(a.folder)
    if a.at:
        print(round(float(Dem(a.folder).at([a.at[0]], [a.at[1]])[0]), 1))


if __name__ == "__main__":
    main()
