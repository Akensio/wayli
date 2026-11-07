#!/usr/bin/env python3
"""Station entrances (entrances.py group): python3 -I pipeline/test_entrances.py (exits 1 on a failure; the build
workflow runs it). The cases: an entrance in a stop area belongs to that area's station; one in no area goes to the
nearest station within reach, and none when no station is near; the letter comes from `ref` alone, never cut from a
name; entrances are listed by letter; twin doors are one entrance; a station is rail only; a bridge or tunnel out of the station is followed to where it comes out."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from entrances import group, merge, is_station, follow, name_entrances, load_names  # noqa: E402

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

# a bridge or tunnel out of the station: the entrance is at the building it reaches (the bridge meets Azrieli, where
# the tickets are); one that only steps down to the street, or comes to nothing, keeps the door
coords = {1: (32.0730, 34.7932), 2: (32.0732, 34.7930), 3: (32.0735, 34.7927), 4: (32.0738, 34.7925),   # the station wall, then west over the road
          5: (32.0728, 34.7934), 6: (32.0726, 34.7937), 7: (32.0731, 34.7933), 8: (32.0732, 34.7935)}
ways = {
    10: {"nodes": [1, 2, 3, 4], "up": True, "ground": False, "deck": False},     # a bridge from the station's door 1 to node 4
    11: {"nodes": [4, 40], "up": False, "ground": True, "deck": False},           # a path on the ground from node 4 on
    12: {"nodes": [1, 5, 6], "up": True, "ground": False, "deck": False},        # a bridge from door 1 east to the mall at 6
    13: {"nodes": [7, 8], "up": True, "ground": False, "deck": False},           # a sidewalk of a road bridge from door 7, to nothing
}
outline = {1, 7}


def out(start, buildings, without=(), **kw):
    ws = {k: v for k, v in ways.items() if k not in without}
    by_node = {}
    for wid, w in ws.items():
        for n in w["nodes"]:
            by_node.setdefault(n, []).append(wid)
    return follow(start, ws, by_node, coords, outline, buildings, **kw)


check("a bridge that only steps down to the street: the door stays", out(1, {}, without=(12,)), None)
check("a bridge to another building: where it meets it", out(1, {6: "the mall"}), 6)
check("a bridge to nothing: the door stays", out(7, {}), None)
check("not followed further than its reach", out(1, {6: "the mall"}, follow_m=50), None)

# the names riders know entrances by: to the entrance nearest the point named, or the only one on that side
hashalom = {"name": "תל אביב השלום", "lat": 32.073559, "lon": 34.793164, "entrances": [
    {"ref": "", "name": "", "lat": 32.074036, "lon": 34.792538}, {"ref": "", "name": "", "lat": 32.07314, "lon": 34.793157},
    {"ref": "", "name": "", "lat": 32.072621, "lon": 34.793146}, {"ref": "", "name": "", "lat": 32.0745, "lon": 34.7945}]}
named = name_entrances(hashalom, load_names()["תל אביב השלום"])
check("names by the point named", (named, [e.get("name_en", "") for e in hashalom["entrances"]]), (3, ["Azrieli entrance", "Northern entrance", "Southern entrance", ""]))
two = {"name": "x", "lat": 32.0, "lon": 34.8, "entrances": [{"ref": "", "name": "", "lat": 32.0, "lon": 34.801}, {"ref": "", "name": "", "lat": 32.0, "lon": 34.799}, {"ref": "", "name": "", "lat": 32.0, "lon": 34.7995}]}
check("names by side only when one entrance is on it", (name_entrances(two, [{"side": "E", "he": "מזרח", "en": "East"}, {"side": "W", "he": "מערב", "en": "West"}]), [e.get("name_en", "") for e in two["entrances"]]), (1, ["East", "", ""]))
check("every station in entrance_names.json names a side or a point", all(("near" in e) != ("side" in e) and e["he"] and e["en"] for v in load_names().values() for e in v), True)

sys.exit(1 if failures else 0)
