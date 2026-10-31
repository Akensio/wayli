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
| `main.ts` | Renders the views, attaches the gestures, then imports `boot.ts`. |
| `boot.ts` | Starts the controllers after the first paint. |
| `sw.template.js` | The service worker; the build writes the list of files it caches into it. |

The folders, each with its own README, bottom layer first. A folder may import
its own files and the folders above it in this table, never those below:
`tools/imports.test.ts` fails the build on an import against this order or
on any import cycle, type-only imports included.

| Folder | What |
|---|---|
| `engine/` | The logic with no screen: routing, streets, the address book, live vehicles and their delays. Runs in the worker and in Node. |
| `worker/` | The data worker, its contract (`ops.ts`: every question and the shape of its answer) and the page's client for it. |
| `lib/` | Used everywhere: the strings in both languages, time. |
| `journey/` | The domain: places, a plan as asked, journeys and their legs, following one, the records kept on the phone; their words and colours, sharing, the pay link. |
| `state/` | The app's state, one module per feature, as signals, and the on-device store. A few `hooks` point back at the controllers for what a state flow must set off (a plan, a panel's history entry). |
| `widgets/` | Small pieces several views share: icons, line chips, the timetable, toast, ripple. |
| `map/` | The one map under everything and what it draws for each panel. |
| `controllers/` | What happens behind the screen: loading, planning, live polling, follow mode, alerts. Exported functions the views call; they also fill the state's hooks. |
| `views/` | The parts of the screen (Preact components). They read state and call the controllers directly. |

Outside the order:

| Folder | What |
|---|---|
| `styles/` | The CSS, one file per part of the screen, in a fixed order. | |
| `types/` | Global type declarations. | |
| `public/` | Copied into the build as is: icons, the web manifest. | |

A view is a place on the screen (the top bar, the results, a stop's page);
a widget has no place of its own and shows up inside views.
