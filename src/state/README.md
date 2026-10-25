# state: what the app knows

One small module per feature, holding signals (Preact) and simple actions.
A view reads them and re-renders when they change. Each module exports a
`hooks` object for what it needs from the rest of the app (planning, the
worker, opening a panel); the controllers fill those in at start, so state
and views never import a controller.

| Module | What |
|---|---|
| `search` | The top bar: places, time, bicycle, which search (trip, line, stop), the two stations of the train search. |
| `results` | A plan's results: cards, filters, sorting, which ways are drawn; the drawer's history tabs. |
| `detail`, `follow` | The journey shown; the trip being followed. |
| `stop`, `line`, `station` | A stop's page, a line's page, the trains between two stations. |
| `nav` | The stack of panels and screens, with their history entries (Back). |
| `sheet` | The bottom sheet's height. |
| `saved`, `chooser`, `names` | Saved places; choosing home, work or a saved place; names in the current language. |
| `settings`, `app`, `data`, `position`, `clock` | Settings; the app itself (version, install, menu); what data is loaded; the last position; a 20-second tick for countdowns. |
