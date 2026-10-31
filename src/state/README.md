# state: what the app knows

One small module per feature, holding signals (Preact) and simple actions.
A view reads them and re-renders when they change. State touches no element
of the page (the components own the DOM and measure the layout). State never imports a
controller, so the few things a state flow must set off in one (planning
when a place is picked, a panel's history entry, the sheet and the map after
results) go through a small `hooks` object the controller fills in at start:
`search`, `results`, `detail`, `stop`, `chooser`, `nav`, `sheet`, `position`
and `names` have one; the rest have none. The views call the controllers
directly.

| Module | What |
|---|---|
| `query` | The rider's question: from, to, the service day and time (or now), the bicycle, the days the data has; its rules, with no screen in them (tested in Node). |
| `search` | The top bar: what its boxes show and which of its parts are open, which search (trip, line, stop), the two stations of the train search; its actions edit the question. |
| `results` | A plan's results: cards, filters, sorting, which ways are drawn; the drawer's history tabs. |
| `detail`, `follow` | The journey shown, and what the live data says about each of its rides (data, worded by the views); the trip being followed. |
| `stop`, `line`, `station` | A stop's page, a line's page, the trains between two stations. The worker's answers they hold are typed by the worker's contract (`worker/ops.ts`), re-exported here. |
| `nav` | The stack of panels and screens, and how Back reaches it: browser history, or a CloseWatcher per entry on Android (one back-end chosen at start). |
| `sheet` | The bottom sheet: its size, the drag, the screen's layout it sizes by (measured by the views); the Sheet component puts it on the page. |
| `chooser`, `names` | Choosing home, work or a saved place; names in the current language. |
| `store` | The on-device store (localStorage): settings, history, saved places, trips and stops, the trip in progress. Nothing in it leaves the phone. Every write bumps its `stored` signal, which the pages showing what it keeps read. It owns the records it keeps: a recent `View`, a `SavedTrip`, a `SavedStop`, and `tripKey`/`favTripKey`, what names a trip. |
| `settings`, `app`, `data`, `position`, `clock` | Settings; the app itself (version, install, menu); what data is loaded; the last position; a 20-second tick for countdowns. |
