# controllers: what happens behind the screen

The only place that fills the `hooks` of `state/`. Each module does the
work for one feature: asks the worker, polls live data, opens panels, keeps
timers. `boot.ts` imports them after the first paint.

| Module | What |
|---|---|
| `loading` | The manifest, the day's timetable, then the address book, the street graph and the courses. |
| `planner` | From the bar to results: planning, "my location", a destination from anywhere, the last search, opening history items. |
| `detail` | A journey's detail: live badges on its rides, the ride options of each ride. |
| `stop`, `line`, `station` | A stop's page, a line's page, the trains between two stations: their worker calls and live polls. |
| `liverides` | Live times for rides between two stops (shared by `station` and `detail`). |
| `follow`, `alerts` | Following a trip: position, timers, the live vehicle, a faster way; get-off alerts and notifications. |
| `shell` | Around the screens: Back on Android, install, online/offline, the menu's actions, what closing each panel stops. |
| `lang`, `status` | Switching language; the status pill. |
