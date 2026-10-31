# src: the app

Wayli runs on the phone. The data worker holds the day's timetable, the
street graph and the address book and answers every question (a route, a
stop's departures, a search), so the screen never waits on it. The screen is
Preact with signals; Vite builds it into `dist/`.

```
 nightly files (pipeline/)            live vehicles (Hasadna, via relay/)
          │                                        │
          ▼                                        ▼
  worker/ (data)  ─── uses ── engine/       engine/feed.ts
          ▲                                        ▲
          │ worker/client.ts                       │
  controllers/  ◀──── call ────  views/ (+ widgets/)
          │                           │
          ├────▶  state/  ◀── read ───┤
          │                           │
          └──────────▶  map/  ◀───────┘
```

At the top of `src/` only the entry files:

| File | What |
|---|---|
| `index.html` | The page: roots only. |
| `main.ts` | Starts the controllers (`controllers/install.ts`), renders the views, attaches the gestures, then imports `boot.ts`. |
| `boot.ts` | After the first paint: the service worker, the map, a trip in progress, then the data. |
| `sw.template.js` | The service worker; the build writes the list of files it caches into it. |

The folders, each with its own README, bottom layer first, and which folders
each one uses. A folder may import its own files and the folders in its "May
use" cell, nothing else. `tools/imports.test.ts` reads this table and fails
the check on any other import, or on an import cycle; type-only imports
count. The cells list only what is used today, so a new use is a change to
this table first.

| Folder | What | May use |
|---|---|---|
| `engine/` | The logic with no screen: routing, streets, the address book, live vehicles and their delays. Runs in the worker and in Node. | nothing of the app |
| `worker/` | The data worker, its contract (`ops.ts`: every question and the shape of its answer) and the page's client for it. | `engine/` |
| `lib/` | Used everywhere: the strings in both languages, time. | `engine/` (Israel time, the languages) |
| `journey/` | The domain: places, a plan as asked, journeys and their legs, following one, the records kept on the phone; their words and colours, sharing, the pay link. | `lib/`, `worker/` (the contract's types), `engine/` (time, delays, distances) |
| `state/` | The app's state, one module per feature, as signals, and the on-device store. A few `hooks` point back at the controllers for what a state flow must set off (a plan, a panel's history entry). | `journey/`, `lib/`, `worker/` (the contract's types), `engine/` (time, delays, languages) |
| `widgets/` | Small pieces several views share: icons, line chips, the timetable, toast, ripple. | `journey/`, `lib/`, `engine/` (modes) |
| `map/` | The one map under everything and what it draws for each panel. | `state/`, `widgets/`, `journey/`, `lib/`, `worker/`, `engine/` |
| `controllers/` | What happens behind the screen: loading, planning, live polling, follow mode, alerts. Exported functions the views call; they also fill the state's hooks (`controllers/install.ts`, called once by `main.ts` before anything is drawn). | `map/`, `state/`, `widgets/`, `journey/`, `lib/`, `worker/`, `engine/` |
| `views/` | The parts of the screen (Preact components). They read state and call the controllers directly. | `controllers/`, `map/` (the picker, the compass report), `state/`, `widgets/`, `journey/`, `lib/`, `worker/` (the contract's types), `engine/` (time, delays) |
| the entry files | `main.ts`, `boot.ts`. | `views/`, `controllers/`, `map/`, `state/`, `widgets/`, `lib/`, `styles/` |

Outside the order:

| Folder | What |
|---|---|
| `styles/` | The CSS, one file per part of the screen, in a fixed order. |
| `types/` | Global type declarations. |
| `public/` | Copied into the build as is: icons, the web manifest. |

A view is a place on the screen (the top bar, the results, a stop's page);
a widget has no place of its own and shows up inside views.
