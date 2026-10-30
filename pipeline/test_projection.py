#!/usr/bin/env python3
"""Where a stop falls on its course (compile.py project_stops): python3 -I pipeline/test_projection.py (exits 1 on a
failure; the build workflow runs it after installing numpy). Two cases that went wrong or could:
  - a sharp turn: the course comes in along one street and turns up another; the stop 40 m up the second street
    belongs to the second segment, not to the clamped end of the first (which lay within a flat 60 m; 2026-10-29,
    13% of all stops were off by 50-60 m this way);
  - a loop: the course passes the same street twice; a stop beside it goes with the first pass even when the second
    runs a few metres nearer, so the stops after it are not pushed round the loop.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compile import project_stops  # noqa: E402

LAT0, LON0 = 32.0, 34.8
KY = 110540.0
KX = 111320.0 * math.cos(math.radians(LAT0))


def lat(y):
    return LAT0 + y / KY


def lon(x):
    return LON0 + x / KX


def project(points, stops):
    plat = np.array([lat(y) for _, y in points])
    plon = np.array([lon(x) for x, _ in points])
    return project_stops([lat(y) for _, y in stops], [lon(x) for x, _ in stops], plat, plon)


# the sharp turn: 500 m east along y=0 to the junction at (500, 0), then 200 m north
segs, fracs, worst = project([(0, 0), (500, 0), (500, 200)], [(250, 3), (503, 40)])
assert segs == [0, 1], segs
assert abs(fracs[1] - 0.2) < 0.02, fracs
assert worst < 10, worst

# the loop: east along y=0, north, back west along y=20, stops beside the first pass; the second stop 12 m from the
# first pass and 8 m from the return
segs, fracs, worst = project(
    [(0, 0), (1000, 0), (1000, 20), (0, 20)], [(200, 2), (500, 12), (800, 1)]
)
assert segs == [0, 0, 0], segs
assert [round(f, 2) for f in fracs] == [0.2, 0.5, 0.8], fracs

# a stop that really sits on the return pass (30 m from the first, 2 m from the second) goes with the second
segs, fracs, worst = project([(0, 0), (1000, 0), (1000, 40), (0, 40)], [(200, 2), (500, 38)])
assert segs == [0, 2], segs

print("projection: stops on the segment they sit on ok")
