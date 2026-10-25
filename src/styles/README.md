# styles: the app's CSS

One file per part of the screen, light and dark, right to left first.
`index.css` imports them in a fixed order, and the order matters: when two
rules have equal selectors' weight, the later file wins. So a rule that only
one part of the screen uses goes in that part's file, and a rule several
parts share goes in `base.css` or `widgets.css`, before all of them.

| File | What |
|---|---|
| `index.css` | The order (imported by `main.ts`). |
| `base.css` | Colours and both themes, the page, buttons, fields, icons, text helpers, touch feedback, the shared animations. |
| `widgets.css` | What `widgets/` draws: chips, live badges, the timetable, the time wheel, the toast, stars. |
| `topbar.css` | The search bar: pills, boxes, suggestions, the kind switch, options, the folded summary. |
| `shell.css` | The sheet and its panels' frame, the floating buttons, pages, the pull to refresh. |
| `results.css` | The result cards, filters, sorting, the history drawer. |
| `detail.css` | A journey's legs, stops and ride options. |
| `follow.css` | Following a trip: the now card, the stepper. |
| `stops.css` | A stop, a line, the trains between two stations. |
| `menu.css` | The menu, settings, saved places, the place chooser. |
| `map.css` | The map's controls, markers, bubbles, the compass cone. |
