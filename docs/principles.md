# Wayli's design principles

The rules agreed with the maintainer, each with the one place in the code
that owns it and the test that fails the build when it breaks. Rules still
under discussion stay out of this file until agreed.

## 1. The map follows the sheet

Agreed 2026-10-23, built 2026-10-24. What the map draws, where its camera
goes and which live vehicles it shows follow from what the sheet holds, and
from nothing else.

| The sheet holds | The map draws | The camera | Live vehicles |
|---|---|---|---|
| Nothing yet | the rider | stays | every one, the lines near the rider in front |
| Results | the ways shown, one highlighted, lines' chips | fits the ways (not again on a new highlight) | the results' lines |
| One way | it, the whole lines of its rides faint | fits it, or the ride tapped | its own (the way's vehicles) |
| Following | the trip, the rider | fits the trip | its own (the followed vehicle) |
| A line | its course and stops | fits it | its own (the line's vehicles) |
| A stop or station | its pin, the lines calling there faint | centres on it | the lines calling there |
| Trains between two stations | the next train's course and stations, other routes faint | fits them | those trains |
| A page, the place chooser | nothing more | stays | as before (none while picking a point) |

The camera aims at the part of the screen the map shows, between the bar
and the sheet; the locate button too. A stop tapped on the map opens the
stop view only when the map draws nothing of the sheet's own (nothing yet,
a stop, the ring); otherwise it gets a bubble and the sheet keeps what it
holds (2026-10-25, `stopPopup` in `src/map/popups.ts`, by `viewFor`).

- Owner: `src/map/view.ts` decides (pure), `src/map/render.ts` carries it
  out. Panels fill their state and never draw the map themselves; a panel
  whose live vehicles are its own puts them on after the drawing
  (`afterDraw`).
- Test: `tests/mapview.test.ts` (in `npm test`).

## 2. The phone does the work to save infrastructure, not as a creed

Agreed 2026-11-01 (maintainer: the "everything on your phone" requirement
"was added out of practicality, not out of niceness. I wanted to not have
to deal with infra and to pay more bills, that's all").

Work runs on the rider's device, from static files, because that is the
cheapest setup that works: nothing to host, nothing to babysit, no bill
that grows with riders. "Offline" and "nothing leaves the phone" are
side effects of that choice, and welcome ones, but they are not promises
the app makes and not rules a feature has to pass. The promises the app
does make are the specific ones in `CLAUDE.md`: no analytics that follow
people, no location data sold, no tracking ads.

So a request leaving the phone is not a breach by itself. A server or a
paid service earns its place when it does something free data and the
device cannot, at a cost the maintainer accepts, and it is weighed the
practical way: what it costs a month, what it needs configured, what it
sends and to whom (plainly stated in settings when it is about the rider),
and what breaks when it is down. Anything that adds a bill or a key is
the maintainer's call; everything else is an engineering choice. When
something cheap and free turns up first, prefer it: the point is fewer
bills, not purity.

- Owner: `docs/decisions.md`, one dated line per such call, with the
  cost, the key or account it needs, and what is sent. The reading of the
  rule itself lives here and in `CLAUDE.md`, ground rule 2.
- Test: none the build can run; the test is the question above, asked in
  the decision line.

