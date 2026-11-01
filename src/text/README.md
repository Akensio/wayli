# text: the words the rider reads, built from data

Pure functions that turn a time, a delay, a line or a place into what the
screen says, in the language shown. The fixed strings themselves are in
`common/i18n.ts`; this folder composes them with data.

| File | What it words |
|---|---|
| `durations.ts` | How long and how soon: "21 min", a ride's minutes, "leave in 5 min", "in 3 min", a time past midnight marked. |
| `live.ts` | A vehicle's live standing: "+3", "on time", the badge for a ride (`liveBadge`, `rideBadge`), the class a live time carries. |
| `travel.ts` | How a trip is made: a line's name, how many stops and changes, the bicycle choice, what trains or the light rail are called between two stations (`railWords`). |
| `placeNames.ts` | Places and distances: "350 m", "2.4 km", a place with its platforms, what a point on the map is called. |
| `operators.ts` | Operators' names in English, where the feed has only Hebrew. |

Not here: the strings (`common/i18n.ts`), clock times and day labels
(`common/time.ts`), line colours (`widgets/lineColors.ts`).

Used by the views, the widgets, the map, the controllers (a toast's words)
and `following/` (the notification's line).
