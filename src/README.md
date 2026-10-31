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

The folders, each with its own README:

| Folder | What | May use |
|---|---|---|
| `engine/` | The logic with no screen: routing, streets, the address book, live estimates, following a trip. Runs in the worker and in Node. | nothing of the app |
| `worker/` | The data worker and the app's client for it. | `engine/` |
| `state/` | The app's state, one module per feature, as signals. A few `hooks` point back at the controllers for what a state flow must set off (a plan, a panel's history entry). | `lib/`, `journey/`, `engine/` |
| `controllers/` | What happens behind the screen: loading, planning, live polling, follow mode, alerts. Exported functions the views call; they also fill the state's hooks. | everything below views |
| `views/` | The parts of the screen (Preact components). They read state and call the controllers directly. | `controllers/`, `state/`, `map/` (the picker), `widgets/`, `lib/`, `journey/`, `engine/` |
| `widgets/` | Small pieces several views share: icons, line chips, the timetable, toast, ripple. | `lib/`, `journey/`, `state/` |
| `map/` | The one map under everything and what it draws for each panel. | `state/`, `worker/`, `journey/`, `lib/`, `widgets/`, `engine/` |
| `journey/` | A journey's types, colours, words, sharing, the pay link. | `lib/`, `state/`, `engine/` |
| `lib/` | Used everywhere: the strings in both languages, time, the on-device store. | `engine/clock.ts` (Israel time) |
| `styles/` | The CSS, one file per part of the screen, in a fixed order. | |
| `types/` | Global type declarations. | |
| `public/` | Copied into the build as is: icons, the web manifest. | |

A view is a place on the screen (the top bar, the results, a stop's page);
a widget has no place of its own and shows up inside views.
