# controllers: what happens behind the screen

What the views call when a tap means work. Each module does the work for
one feature (asks the worker, polls live data, opens panels, keeps timers)
and exports the functions its views need (`openStop`, `planFromBar`,
`endTrip`, ...); it also fills the few `hooks` of `state/`, for what a state
flow must set off here. Importing a controller starts nothing: `install.ts`
(called once by `main.ts`, before anything is drawn) has each fill its hooks
and add its listeners, in a fixed order. `boot.ts` starts the app after the
first paint.

| Module | What |
|---|---|
| `install` | Starts the controllers: each one's `install()`, in order. |
| `session` | One panel's session (`panelSession`): which opening a late answer belongs to, its live poll, its end; `whileVisible` for work done only while the page is seen. |
| `suggest` | What a search box's list holds for its kind and text, each box's answers in the order it asked. |
| `loading` | The manifest, the day's timetable, then the address book, the street graph and the courses. |
| `planner` | From the bar to results: planning, "my location", a destination from anywhere, the last search, opening history items. |
| `detail` | A journey's detail: live badges on its rides, the ride options of each ride. |
| `stop`, `line`, `station` | A stop's page, a line's page, the trains between two stations: their worker calls and live polls. |
| `liverides` | Live times for rides between two stops (shared by `station` and `detail`). |
| `livepoll` | A panel's live times every 45 s while it is open, and its note (the stop page, the trains between two stations). |
| `follow`, `alerts` | Following a trip: position, timers, the live vehicle, a faster way; get-off alerts and notifications. |
| `shell` | Around the screens: Back on Android, install, online/offline, the menu's actions, what closing each panel stops. |
| `lang`, `status` | Switching language; the status pill. |
