# state: what the app knows

One small module per feature, holding signals (Preact) and simple actions.
A view reads them and re-renders when they change. State never imports a
controller, so the few things a state flow must set off in one (planning
when a place is picked, a panel's history entry, the sheet and the map after
results) go through a small `hooks` object the controller fills in at start:
`search`, `results`, `detail`, `stop`, `chooser`, `nav`, `sheet`, `position`
and `names` have one; the rest have none. The views call the controllers
directly.

| Module | What |
|---|---|
| `search` | The top bar: places, time, bicycle, which search (trip, line, stop), the two stations of the train search. |
| `results` | A plan's results: cards, filters, sorting, which ways are drawn; the drawer's history tabs. |
| `detail`, `follow` | The journey shown; the trip being followed. |
| `stop`, `line`, `station` | A stop's page, a line's page, the trains between two stations. |
| `nav` | The stack of panels and screens, with their history entries (Back). |
| `sheet` | The bottom sheet's height. |
| `chooser`, `names` | Choosing home, work or a saved place; names in the current language. (The saved places, trips and stops themselves live in the store, `lib/store.js`.) |
| `settings`, `app`, `data`, `position`, `clock` | Settings; the app itself (version, install, menu); what data is loaded; the last position; a 20-second tick for countdowns. |
