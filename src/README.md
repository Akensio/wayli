# src: the app

Wayli runs on the phone. The data worker holds the day's timetable, the
street graph and the address book and answers every question (a route, a
stop's departures, a search), so the screen never waits on it. The screen is
Preact with signals; Vite builds it into `dist/`.

```
 nightly files (pipeline/)            live vehicles (Hasadna, via relay/)
          │                                        │
          ▼                                        ▼
  worker/ (data)  ─── uses ── engine/       engine/feed.js
          ▲                                        ▲
          │ worker/client.ts                       │
  controllers/  ── fill the hooks of ──▶  state/  ◀── read by ── views/ (+ widgets/)
          │                                        │
          └──────────────▶  map/  ◀────────────────┘
```

At the top of `src/` only the entry files:

| File | What |
|---|---|
| `index.html` | The page: roots only. |
| `main.ts` | Renders the views, attaches the gestures, then imports `boot.ts`. |
| `boot.ts` | Starts the controllers after the first paint. |
| `styles.css` | Every style, light and dark, right to left first. |
| `sw.template.js` | The service worker; the build writes the list of files it caches into it. |

The folders, each with its own README:

| Folder | What | May use |
|---|---|---|
| `engine/` | The logic with no screen: routing, streets, the address book, live estimates, following a trip. Runs in the worker and in Node. | nothing of the app |
| `worker/` | The data worker and the app's client for it. | `engine/` |
| `state/` | The app's state, one module per feature, as signals, with `hooks` the controllers fill. | `lib/`, `journey/`, `engine/` |
| `controllers/` | What happens behind the screen: loading, planning, live polling, follow mode, alerts. The only place that fills the hooks. | everything below views |
| `views/` | The parts of the screen (Preact components). They read state and call hooks; they never import a controller. | `state/`, `widgets/`, `lib/`, `journey/`, `engine/` |
| `widgets/` | Small pieces several views share: icons, line chips, the timetable, toast, ripple. | `lib/`, `journey/`, `state/` |
| `map/` | The one map under everything and what it draws for each panel. | `state/`, `worker/`, `journey/`, `lib/`, `widgets/`, `engine/` |
| `journey/` | A journey's types, colours, words, sharing, the pay link. | `lib/`, `state/`, `engine/` |
| `lib/` | Used everywhere: the strings in both languages, time, the on-device store. | `engine/clock.js` (Israel time) |
| `types/` | Global type declarations. | |
| `public/` | Copied into the build as is: icons, the web manifest. | |

A view is a place on the screen (the top bar, the results, a stop's page);
a widget has no place of its own and shows up inside views.
