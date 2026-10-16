#!/usr/bin/env python3
"""Turn app/feasibility.html into a page publishable as a Claude artifact.

    python3 app/build_artifact.py --from "מרכזית המפרץ" --to "מרכזית באר שבע" --out data/wayli-routing-test.html

The artifact host wraps the file in its own html/head/body skeleton, so this
strips ours, inlines app/raptor.js into the module script (no separate file to
serve) and fills the preset stops. The timetable is published alongside as
timetable.b64.txt (the host serves text, not binaries).
"""
import argparse
import pathlib
import re

here = pathlib.Path(__file__).resolve().parent
ap = argparse.ArgumentParser()
ap.add_argument("--from", dest="from_q", default="")
ap.add_argument("--to", dest="to_q", default="")
ap.add_argument("--out", default=str(here.parent / "data" / "wayli-routing-test.html"))
args = ap.parse_args()

html = (here / "feasibility.html").read_text(encoding="utf-8")
head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
head = re.sub(r'\s*<meta charset="utf-8">', "", head)
head = re.sub(r'\s*<meta name="viewport"[^>]*>', "", head)
head = head.replace("<title>", '<meta name="claude:viewport-fit-sides" content="cover">\n<title>', 1)

router = (here / "raptor.js").read_text(encoding="utf-8")
router = re.sub(r"^export ", "", router, flags=re.M)
body = body.replace("import { parseTimetable, searchStops, plan, fmtTime } from './raptor.js';", router, 1)
body = body.replace("'__FROM__'", repr(args.from_q)).replace("'__TO__'", repr(args.to_q))
body = body.replace("'__DATA__' === '__' + 'DATA__' ? 'timetable.bin.gz' : '__DATA__'", "'timetable.b64.txt'")

out = pathlib.Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(head.strip() + "\n" + body.strip() + "\n", encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size/1e3:.0f} kB)")

# the artifact host serves text but not binaries: ship the timetable as base64
import base64
gz = here.parent / "data" / "timetable.bin.gz"
b64 = out.parent / "timetable.b64.txt"
b64.write_bytes(base64.b64encode(gz.read_bytes()))
print(f"wrote {b64} ({b64.stat().st_size/1e6:.1f} MB)")
