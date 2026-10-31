# display: how a journey reads and looks

Pure functions from the model to what the rider reads, in the language
shown: words, badges, colours. Nothing here keeps state, draws or decides.

| File | Owns |
|---|---|
| `time.ts` | Durations, a ride's minutes, "leave in 5 min", "in 3 min", a time past midnight marked. |
| `live.ts` | A vehicle's live standing in words: "+3" and "on time", the badge for a ride (`liveBadge`, `rideBadge`), the class a live time carries. |
| `travel.ts` | How a trip is made: a line's name, how many stops and changes, the bicycle choice, what trains or the light rail are called between two stations (`railWords`). |
| `places.ts` | How far ("350 m", "2.4 km"), a place's name with its platforms, what a point on the map is called. |
| `colors.ts` | A line's colour by vehicle and operator, and the text colour that reads on it. |
| `operators.ts` | Operators' names in English, where the feed has only Hebrew. |

Does not own: the strings themselves (`lib/i18n.ts`), clock times
(`lib/time.ts`), anything that decides what to show (state, controllers).

Used by the views, the widgets, the map, the controllers (a toast's words)
and `following/` (the notification's line).
