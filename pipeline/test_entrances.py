#!/usr/bin/env python3
"""Station entrances (entrances.py group): python3 -I pipeline/test_entrances.py (exits 1 on a failure; the build
workflow runs it). The cases: an entrance in a stop area belongs to that area's station; one in no area goes to the
nearest station within reach, and none when no station is near; the letter comes from `ref` alone, never cut from a
name; entrances are listed by letter; twin doors are one entrance; a station is rail only."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from entrances import group, merge, is_station  # noqa: E402

failures = 0


def check(what, got, want):
    global failures
    ok = got == want
    failures += not ok
    print(("ok  " if ok else "FAIL") + f" {what}: {got!r}" + ("" if ok else f", want {want!r}"))


stations = {1: {"name": "אלנבי", "lat": 32.0625, "lon": 34.7745}, 2: {"name": "קרליבך", "lat": 32.0655, "lon": 34.7835}}
entrances = {
    11: {"ref": "B", "name": "", "lat": 32.0624, "lon": 34.7748},
    12: {"ref": "A", "name": "", "lat": 32.0634, "lon": 34.7757},
    21: {"ref": "", "name": "כניסה ראשית", "lat": 32.0656, "lon": 34.7832},   # no area: 30 m from קרליבך
    31: {"ref": "C", "name": "", "lat": 32.2, "lon": 34.9},                    # no station anywhere near
}
areas = [("אלנבי", [1, 11, 12, 99])]
out = group(stations, entrances, areas, near_m=200)
check("stations with entrances", [s["name"] for s in out], ["אלנבי", "קרליבך"])
check("the stop area's entrances, by letter", [e["ref"] for e in out[0]["entrances"]], ["A", "B"])
check("the station's own point", (out[0]["lat"], out[0]["lon"]), (32.0625, 34.7745))
check("an entrance in no area joins the nearest station near enough", [e["name"] for e in out[1]["entrances"]], ["כניסה ראשית"])
check("a named entrance without a letter keeps the letter empty", out[1]["entrances"][0]["ref"], "")
check("an entrance far from every station is left out", sum(len(s["entrances"]) for s in out), 3)

# twin doors: a hall's double door is one entrance at its middle; different letters stay apart; a row of doors along a
# building does not creep into one (each cluster is measured from its first door)
doors = [{"ref": "", "name": "", "lat": 32.084976, "lon": 34.798463}, {"ref": "", "name": "", "lat": 32.084945, "lon": 34.798628},
         {"ref": "", "name": "", "lat": 32.083938, "lon": 34.79758}]
merged = merge(doors, merge_m=25)
check("two doors 16 m apart are one entrance, at their middle", [(e["lat"], e["lon"]) for e in merged], [(32.08496, 34.798546), (32.083938, 34.79758)])
check("letters keep doors apart", len(merge([{"ref": "B", "name": "", "lat": 32.0, "lon": 34.0}, {"ref": "C", "name": "", "lat": 32.0, "lon": 34.0001}], merge_m=25)), 2)
row = [{"ref": "", "name": "", "lat": 32.0, "lon": 34.0 + i * 0.0002} for i in range(4)]   # 19 m apart, one after the other
check("a row of doors merges only within reach of each cluster's first door", len(merge(row, merge_m=25)), 2)
# a station is rail: railway=station, or public_transport=station of a rail mode; a bus terminal or taxi stand is not
check("rail stations only", [is_station(t) for t in ({"railway": "station"}, {"public_transport": "station", "train": "yes"}, {"public_transport": "station", "station": "light_rail"},
                                                     {"public_transport": "station", "bus": "yes"}, {"public_transport": "station", "amenity": "taxi"})], [True, True, True, False, False])

sys.exit(1 if failures else 0)
