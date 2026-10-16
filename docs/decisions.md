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
