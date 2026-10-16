# Decisions

One dated line per decision, newest at the bottom. Rejected options stay here
so they are not re-litigated.

- 2026-10-15 Project started: a public-transport app for Israel meant to beat
  Moovit and Bus Nearby. Multi-transfer, multimodal trip planning is the
  feature everything is built around.
- 2026-10-15 Trip planning runs on the device (RAPTOR over a compiled
  timetable), not on a server: offline use, privacy, near-zero hosting.
- 2026-10-15 Timetables ship as static files from a CDN, rebuilt nightly by a
  GitHub Action. Torrent/IPFS rejected for now; an optional mirror maybe later.
- 2026-10-15 Servers only where unavoidable: real-time relay, crowd reports,
  push alerts. Cloudflare Workers + D1.
- 2026-10-15 Crowd reports are structured one-tap items, anonymous,
  location-gated, fading after about 15 minutes. Free-text chat rejected
  (moderation, safety, cost). Built after routing.
- 2026-10-15 Money: routing, live arrivals, offline and privacy are free
  forever. Pro tier (commute alerts, widgets/watch, no ads, supporter tier;
  maybe Rav-Kav ticket commissions, which would need Ministry approval and is
  unchecked) and B2B (white-label for municipalities and operators; employer,
  venue and tourism widgets). Location data is never sold; no tracking ads.
- 2026-10-15 Name: Wayli (sounds like וואי לי).
- 2026-10-15 Launch as an installable web app (PWA) first; native wrappers
  only if needed later.
- 2026-10-15 License: GNU AGPL-3.0, public repository. Proprietary,
  all-rights-reserved was considered and dropped. No contributor license
  agreement is set up.
- 2026-10-16 Repository created (github.com/Akensio/wayli) and scaffolded:
  README, CLAUDE.md, docs/. No code yet; next is the feasibility test.
- 2026-10-16 Clarified: on-device routing is a hypothesis under test, not a
  decision. The real principle is minimal infrastructure: nothing that costs
  money or manual configuration time without a reason. The feasibility test
  decides where routing runs; fallbacks are listed in `architecture.md`.
- 2026-10-16 Feasibility test, desktop part: passed. One weekday of the
  national feed (123k trips, 4.5M stop times) compiles in 35 s to a 2.8 MB
  gzip, 26 MB in memory. RAPTOR with up to 3 transfers answers Haifa to
  Be'er Sheva in 23 to 38 ms in headless Chromium and 10 to 30 ms in Node for
  other cross-country queries; results checked against the raw feed. Phone
  timing still pending. Footpath radius set to 400 m (250 m could not get
  from the HaMifratz platforms to the train).
- 2026-10-16 Priorities after the test: speed is a solved problem, accuracy
  is not. The router must not miss good transfer opportunities (realistic
  walking between stops and stations, sensible transfer buffers, more than
  one departure per answer). Bicycle is a required mode, important for some
  riders: bike as first/last mile, bike between transit legs, bike on
  trains where allowed. Both need a street network in the pipeline; see
  `architecture.md`.
- 2026-10-16 Gadi: Claude builds on its own judgment, well past an MVP,
  reporting at milestones; he sets direction. Recorded in CLAUDE.md.
