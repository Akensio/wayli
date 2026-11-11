# Wayli architecture

Current design as of 2026-10-16, rewritten in place when it changes. Dated
decisions are in `decisions.md`. Nothing here is built yet.

Guiding constraint: as little infrastructure as possible. Anything that
costs money or manual configuration time has to earn its place. Where
routing runs is not decided; the on-device design below is the leading
option because it needs the least infrastructure, and the feasibility test
at the end decides. The fallbacks if it fails are listed after the test.

## Shape

Three parts, in order of how much they matter:

1. **The app**: an installable web app (PWA) first, native wrappers later
   only if needed. Shows stops, lines, map, favorites, live arrivals and
   crowd reports; in the on-device design it also holds the compiled
   timetable and the street graph and runs the trip planner.
2. **The pipeline**: a nightly GitHub Action that downloads the Ministry of
   Transport GTFS feed and (less often) the OpenStreetMap extract, compiles
   them to a compact timetable and street graph, and publishes the result
   as static files (GitHub Pages or Cloudflare Pages).
3. **The worker**: the smallest possible server (Cloudflare Workers + D1,
   free tier at first) for the three things that cannot run on the phone:
   relaying real-time data (SIRI credentials cannot ship in a public app;
   built 2026-10-21 as `relay/relay.js`, see "Real-time"),
   collecting and serving crowd reports, and sending push alerts.

## Trip planning on the device (leading option, under test)

- Algorithm: RAPTOR (round-based public transit routing) over the timetable
  of the day. It works directly on trips and stops, needs no graph
  preprocessing, and returns Pareto-optimal answers by arrival time and
  number of transfers, which maps to "earliest arrival" and "fewest
  transfers" results. Multimodal comes for free: bus, train and light rail
  are all routes in the same timetable.
- Transfers: GTFS `transfers.txt` where present, plus walking transfers
  generated in the pipeline between stops within a short radius, shipped
  with the timetable.
- Why on the device: offline use, privacy (no request leaves the phone),
  near-zero hosting, no routing server to scale.
- Size, measured 2026-10-16: the feed is 179 MB zipped, 1.2 GB unzipped
  (`stop_times.txt` is 944 MB, 17.8M rows, for a 31-day window). One weekday
  compiles to 26 MB raw, 2.8 MB gzipped. The repeating schedules compress
  extremely well, so a day on the phone is cheaper than a photo. A whole
  validity window is a later question; one day at a time is the plan.

## Transfers, accuracy and bicycles

Priority set 2026-10-16: speed has headroom, accuracy does not, and bicycles
are a required mode. Built the same day:

- **Street network** (`pipeline/streets.py`): the OpenStreetMap extract of
  Israel and Palestine compiled into a walking and cycling graph of
  intersections: 853k nodes, 2.3M directed edges, 10.7 MB gzipped (23 MB in
  memory), built in under 3 minutes. Edges carry length, walk/bike
  permission per direction (one-way streets apply to bikes, not to walkers)
  and a kind that sets the speed (road, cycleway, footway, path, steps,
  service). Since 2026-10-25 edges also carry the metres climbed and
  descended in their direction (`--dem`, `pipeline/elevation.py`): the
  ground's height from AWS's open Terrain Tiles (zoom 12, about 32 m
  pixels, SRTM underneath), smoothed over about 150 m, read every 25 m
  along each way and counted with a 2 m hysteresis (bridges and tunnels
  by their ends only), since the radar's noise and the buildings it saw
  made flat streets climb. The cost (`CLIMB` in the header, applied by
  `streets.ts` `secondsOn` and by the compiler's walking transfers): on
  foot 3 s more per metre up and 1 s per metre down on descents over
  10 %; by bike a climb no faster than about 500 m an hour and a descent
  saving 1.5 s per metre down up to 7 m/s; steps and pushed bikes as
  before. Measured (`route`, before → after): Bat Galim to the Technion
  126 → 136 min on foot, 42 → 53 by bike, back 41 → 38 by bike; Hadar up
  to Carmel Center by bike 17 → 28, down 15 → 12; flat Tel Aviv rides
  within half a minute. 12.1 MB gzipped (was 10.7). Estimates, to check
  against real rides.
- **Real walking transfers** (`compile.py --streets`): every stop snaps to
  the nearest walkable node within 250 m (30,569 of 30,654 do), and a
  bounded search from each stop gives the walking time to every stop within
  10 minutes on actual streets: 404k footpaths, replacing the straight-line
  guesses. Inside a station every platform reaches every other (the feed's
  `parent_station`, 220 stations, 4.6k pairs). Every footpath carries a 30 s
  margin; boarding at the stop you arrived at needs 90 s.
- **Profile search** (`raptor.ts` `profile()`): range RAPTOR over a departure
  window, so an answer is every journey worth taking in the next hour, not
  one. Origins and destinations are sets (all platforms of a station, or
  every stop reachable from a point) with access and egress times. Ties on
  arrival that save a transfer are kept, which the textbook pruning loses.
  Ranking: Pareto by departure, arrival and transfers, then an extra
  transfer has to save at least 5 minutes. The departure shown is the latest
  that still makes the first vehicle. The stop to get off at: the earliest
  arrival at the door, walk included, but among the stops within a minute of
  it the one with the least walking, since once aboard staying on to the
  stop by the door costs nothing and getting off a block early to arrive
  seconds sooner is a walk for nothing; the journey's arrival stays the real
  one.
- **First and last mile** (`src/engine/streets.ts`): Dijkstra on the street graph
  from a point, on foot (15 min) or by bike (20 min), to every stop it can
  reach; those become the origins or destinations. A point joins the
  network on the street segments in front of it (the nearest, and others
  up to 150 m further, their off-street metres counted three times so a
  walk never cuts through a block), not at the nearest intersection, which
  in a city is often half a block away; walks are drawn the same way, from
  the door along the streets to the stop. A bike-only route is
  computed alongside when a bike is involved. Three bicycle choices: none,
  ride to the stop and park it (bike access, walking egress), take it along
  (bike at both ends, only vehicles and hours that allow it), plus a
  folding-bike switch.

Measured in headless Chromium, 60-minute window, up to 3 transfers:

| Query | Median | Notes |
|---|---|---|
| HaMifratz (Haifa) to Be'er Sheva central, 08:00 | 339 ms | 3 journeys, 23 destination platforms; cold run 516 ms |
| Point in Givatayim by bike to Jerusalem central, 07:30 | 314 ms | 912 stops within 20 min by bike; bike 11 min to Savidor then bus 480 |
| Single departure instead of a window | 50 to 65 ms (Node) | |
| Bike reach, 20 min, from Givatayim | 44 ms | walk reach 15 min: 2 ms |
| Bike route Givatayim to Savidor | 5 ms | 2.5 km, 13 min; on foot 2.4 km, 33 min |

Known gaps, in rough order of importance:

- Bike on transit: the feed has no `bikes_allowed`, so the rules are coded
  in `raptor.ts` (`BIKE_RULES`, `bikeAllowed`) from public sources, checked
  2026-10-16: folding bikes ride on any bus, light rail and train at any
  hour; other bikes ride on trains outside the weekday peaks (Sun-Thu
  06:00-09:00 and 15:00-19:00, Israel Railways notice, 2019) and in the
  luggage compartment of intercity buses (Ministry of Transport directive,
  space permitting), not on city buses or light rail. "Intercity" is a
  heuristic in `compile.py`: the route's two end cities differ and its ends
  are at least 15 km apart (1,776 of 6,464 patterns). Sources: Israel
  Railways via Moovit (updates.moovit.com/bicycles-train-jan19-en), Globes
  2019-10, Walla Finance 1629067, Kol Zchut "העלאת אופניים לאוטובוס".
  Peak rules are checked at boarding time; holidays and Fridays are not
  modelled yet. Bike-share is not modelled.
- The window query should run in a Web Worker with the first answer shown
  at once; a phone will take about 1 s for a full hour.
- The street graph could be about half its size with varint-coded edges.
- The 10-minute cap on stop-to-stop walks and the 15/20-minute caps on
  access are guesses to revisit with real use.

## The app (v0.4, `src/`)

An installable web app, Hebrew and right-to-left first with an English
toggle. Preact with signals and TypeScript, both strict, built by Vite into
`dist/` (`npm run check` lints and type-checks every UI module, `npm run build` bundles the
shell, the worker and the data modules and writes the service worker with
the list of built files, since their names carry content hashes);
`pipeline/build_site.py` joins the build with the data.

Layout, one folder per concern (each with a README; `src/README.md` is
the overview). At the top of `src/` only the entry files: `index.html`
(roots only), `main.ts` (renders the views, attaches the gestures, then
imports `boot.ts`), `boot.ts` (starts the controllers after the first
paint) and `sw.template.js` (the service worker: the shell
and every downloaded data file are cached, so the app works offline once
loaded; a new build reloads the page once, and notification taps reopen
the app).
- `engine/`: the logic with no screen, run in the data worker and in Node:
  `raptor.ts` and `streets.ts` (the router and the street graph),
  `places.ts` (the address book), `clock.ts` (Israel time), `feed.ts` (the
  live vehicles), `delays.ts` (delay estimates), `geo.ts` (distances, and where a point is
  along a trip), `modes.ts` (what runs a line), `container.ts` (reading the
  data files) and `text.ts` (how the searches compare names).
- `worker/`: the data worker (it holds the data and answers every query, so
  the UI never blocks), a module per kind of question (`data`, `search`,
  `plan`, `stops`, `lines`, `trips`, `courses`, `vehicles`, `traffic`, with
  `names`), `worker.js` the message loop over their ops, and `client.ts`,
  the UI's end of it. Only `data.js` assigns what is loaded; what the other
  parts derive from it registers its reset with `onNewDay` / `onNewLang`.
- `state/`: one small module per feature holding its signals and actions
  (`search` the bar, `results` the plan with its cards as a computed,
  `sheet` the bottom sheet's size, `nav` the stack of panels and screens with
  their history entries, `detail`, `follow`, `stop`, `line`, `station`,
  `saved`, `chooser`, `settings`, `app`, `data` what is loaded,
  `position`, `clock` a 20-second tick for countdowns). State never imports
  a controller; the few things a state flow must set off in one (planning
  when a place is picked, a panel's history entry, the sheet and the map
  after results) go through a small `hooks` object the controller fills in
  at start.
- `controllers/`: what happens behind the screens, one module each,
  exporting the functions the views call and filling the state's few
  `hooks`: `loading` (the manifest, a day's
  timetable, the other data files), `planner` (planning, a destination from
  anywhere, the last search, clearing), `detail`, `stop`, `line`, `station`
  (each page's worker calls; `live` the one look for live times every 30 s,
  for the trips the screens show; rides between
  two stops), `follow` (the trip being followed: the position
  watch, the timers, the live vehicle, the re-planning, the resume bar),
  `alerts`, `lang`, `status`, `shell` (install, online, the drawer's
  actions, what closing each panel stops).
- `views/`: the parts of the screen, Preact components drawing from the
  state modules and calling the controllers directly (a tap is one import
  away from the work it starts), a folder per feature named as in `state/` and
  `controllers/`: `topbar/`, `results/`, `detail/`, `follow/`, `stop/`,
  `line/`, `station/` (the trains between two stations), `saved/`,
  `settings/`, `menu/`, `chooser/`, and `shell/` (the sheet with every
  panel, the floating pills, the pick bar, the gestures and the pull to
  refresh).
- `widgets/`: the small pieces several views share (icons, line chips, the
  timetable, the close-all X, the toast, the ripple, the swipe to close,
  HTML escaping). A view is a place on the screen; a widget has no place
  of its own.
- `styles/`: the CSS, one file per part of the screen (`base`, `widgets`,
  `topbar`, `shell`, `results`, `detail`, `follow`, `stops`, `menu`,
  `map`), imported by `index.css` in that order, which decides ties.
- `map/`: the one map (`index.ts`: init, the layers, taps), `view.ts`
  (what the map shows for what the sheet holds: what is drawn, the camera,
  which live vehicles; pure, tested by `tests/mapview.test.ts`),
  `render.ts` (carries that out from the panels' state, the one camera,
  aimed between the bar and the sheet, the locate button's included; a
  panel's own live vehicles go on after the drawing through `afterDraw`),
  `style.ts` (the Liberty style's colours from two palettes), `basemap`
  (theme, labels' language), `layers` (a journey with its stops and pins,
  the other ways muted under it), `live` (the vehicles in view, the day's
  stops, the note), `popups` (bubbles for a vehicle and a tapped place; a
  line's vehicle markers), `picker` (a point on the map), `shared` (the
  map, its markers).
- `trip/`: what a trip is made of: places, the question a plan asks,
  journeys and their legs, what the live data says about a ride (data only).
  `text/`: the words the rider reads, built from data (durations, delays,
  lines, places, operators); line colours are the widgets'
  (`widgets/lineColors.ts`). `following/`:
  the rules of following a trip (the state machine, re-planning, the status
  line). The records the phone keeps are the store's (`state/store.ts`).
- `common/`: used everywhere: `i18n.ts` (every string in Hebrew and English),
  `time.ts`.
- The on-device store is `state/store.ts` (settings, history, saved places
  and the trip in progress, all in localStorage; every write bumps its
  `stored` signal, which the pages showing what it keeps read).
- Which folder uses which is the table in `src/README.md` ("May use"),
  and it runs one way: engine, worker, common, trip, text, following, state, widgets, map,
  controllers, views, and the entry files at the top. `tests/imports.test.ts`
  reads that table and fails the build on an import it does not list, on a
  use it lists that the code no longer has, and on any import cycle,
  type-only imports included.
- The controllers start in `controllers/install.ts`, called once by
  `main.ts` before anything is drawn: each fills the hooks state and the
  map reach it through and adds its listeners. Importing a module starts
  nothing, and a hook nobody filled throws (`common/unset.ts`) instead of
  doing nothing.
- `public/` (manifest, icons). There are no global names: MapLibre is
  imported from `map/maplibre.ts`, the console's handle is declared beside
  `common/debug.ts`, its one writer.

Maps are MapLibre GL 6 (bundled with the app, its worker as a built asset named to it with `setWorkerUrl`, since the ESM-only 6.x cannot find it beside a Vite bundle) over OpenFreeMap
vector tiles (no key, no cost): the Liberty style, with every colour
replaced on the device from one of two palettes by role and road class
(`map/style.ts`), so both maps keep all of Liberty's detail (road classes,
3D buildings, stops, places) while the roads recede and the transit lines
drawn over them carry the colour. Light: warm off-white land, white
streets with soft grey casings, pale sand motorways, muted water (the
Positron and Transit-app family of basemaps). Dark: cool near-black land,
roads as lighter greys in a clear hierarchy, deep blue-black water, light
text with a dark halo; the sprite's black-and-white hatchings are faded.
Alphas and zoom fades of the original are kept. OpenFreeMap's own Positron
and dark styles were rejected as too bare. The RTL text plugin shapes
Hebrew and Arabic labels. Lines are coloured by mode and
operator: trains navy, light rail red (both lines running are "the red
line"), buses in their operator's colour, approximate brand colours kept
in one table in `widgets/lineColors.ts` (Egged green and Dan blue read off their sites;
Metropoline orange, Kavim purple, Superbus orange-red, Nateev Express lime,
Electra Afikim dark blue, Tnufa light blue, Extra magenta, Galim teal, Bet
Shemesh Express brown from memory, to be corrected as seen on the road),
other operators slate green; chips, legs, map lines, vehicle dots and
markers all use the same colour. Vehicles on every map carry a
triangle on their rim pointing where they head (SIRI's bearing; none when
a standing vehicle reports zero).

Layout (v0.3, map first): one map under everything, showing every vehicle
reporting in view with its line number and heading, the stops when zoomed
in, the rider's position (MapLibre's locate control, started on its own once
location was allowed before; a tap on it brings the map to the rider at the
zoom it has, a second tap there sets the neighbourhood's zoom, 15; a turquoise dot with a cone showing which way
the phone faces, from its compass, `map/heading.ts`: every kind of reading is
listened to, and where the browser has a permission for it (an iPhone, Chrome
on a Pixel) it is asked from a tap, the locate button's or the first on the
map; Settings ends with a line on what the compass sends), a compass under it that appears once the map
is rotated or tilted and resets both on a tap, and whatever the open panel
is about. Over it,
a floating top bar that is the planner: a menu button and one prompt,
"where do you want to go?". A tap on it opens the bar: the destination
field (tagged "to"; places, addresses and stops, no lines: those are the
line search's; its quick menu
offers my location, a point on the map, saved and recent places), a
second row with the origin field (tagged "from"; empty means my location)
and a swap button, then a row with two chips for the options (when,
reading "now" until a time or "arrive by" is set; bicycle) whose details
open in a card hanging off the bar, and a Go button. A tap on the map with
nothing chosen folds the bar back to the prompt. Language lives in
settings. A destination plans at once; changing either field
plans again; nothing of the planner sits in the sheet. A plan is a history
entry: the back button (or the ✕ in the destination field) clears both
fields and the results and drops the sheet to its strip. The bar has three
states: the prompt pill when nothing is chosen; while editing (a focus on
either field opens it), the origin row above the destination row, then the
time and bike chips and the Go button, with the origin prefilled as "my
location" (resolved when the plan is made; typing or the menu replaces it)
and the menu button out of the way; and, once a plan is made, one summary box (to, then from, time
and bike on a second line) that a tap reopens into the rows and a map tap
or Back folds (Android: Back takes the keyboard, then the list, then folds
the open search). Every panel in the sheet has Back (one step) and an X
(`widgets/CloseAll`: every panel at once). The menu lists the three searches,
a line, then saved, settings and reload. "Recent items to keep" (5, 10,
20 or 40 of each kind; ways opened at most 20, as they carry their
journey) is a setting. A journey's detail and the follow screen while
waiting have Pay, a link to HopOn (Rav-Pass)'s store page (`views/detail/pay.ts`). A box focused with text in it puts the caret at the end, the
text not selected (maintainer: editing it is more common than replacing it). The suggestion list while typing hangs below all the rows, so
it never covers the other field. A bottom sheet with three heights (a
strip, about half the screen, nearly full; it is always its full height
and slides by a composited transform, so the slide and the snap run on the
GPU while only the body's height is set per state) carries every panel: the plan
screen (results and recent searches only), saved, settings,
and the panels for a journey, a stop, a line, the place
chooser and the trip being followed. Settings, saved and the place chooser
need no map, so they are pages: the sheet grows over the whole screen with
a header of its own (back, title) and the bar, the handle and the map's
buttons go. The sheet is dragged from anywhere on it while it is collapsed
(a sideways start on the chip strip scrolls the strip instead), and from
its handle or its top 96 px always. Half or fully open, the list scrolls
as a list should; only a pull past an edge moves the sheet: past the top,
pulling down folds it; past the bottom (or with nothing to scroll),
pulling up opens it. The browser owns vertical gestures in a scrolling
list and cancels pointer events, but a pull past an edge only overscrolls,
so touch events drive the sheet there; a mouse wheel past an edge does the
same. Where a drag lands: the
nearest size to where it was let go; a short pull (40 px) or a quick one
(0.5 px/ms) steps one size in its direction rather than falling back; only
a long drag past the midpoint opens or closes all the way, as Android's own
sheets do (speed picks the next size, never the far one). A tap on the
handle cycles the sizes; a tap on empty map collapses it. The handle row
is also the panels' toolbar (2026-10-28): on a panel, Back (one step) at
its start and Close (every panel, back to the map) at its end, and on every
screen a toggle that opens the sheet fully or back to half. The row sits
above the scrolling body, so they never scroll out of reach, and it costs
the body nothing, since the row was there; the panels' own bars keep the
title, the chip, the live badge and the star. Every fold in the app (the
just-left and hurry lines, a timetable's whole day, a ride's stops and its
other rides, the line page's timetable, which starts folded) is one widget,
`widgets/Fold`: a label and a chevron that turns when open.
The map's own buttons (locate, compass) sit in the bottom corner above the
sheet and fade with the map under a fully open sheet. Tilted, the map gets
depth: a sky and a haze towards the horizon (MapLibre's sky, pitch up to
72°), a low side light shading the basemap's extruded buildings; colours
follow the light or dark style. With "3D heights" on in the settings (off by
default), a map tilted past 10° also stands on the ground's real heights
(exaggerated 1.5 times) with a light hill shading: AWS's open Terrain Tiles
(terrarium encoding, no key, to zoom 12: the data underneath is 30 m, so
the hills are the same and the phone decodes a quarter of the tiles),
fetched only while tilted, since from straight above heights change nothing
and the tiles cost data; the source and the shading layer are made with the
style, so the first tilt only turns the heights on. MapLibre 6 was taken
for this (2026-10-25): its terrain renders through shared framebuffers,
frees its textures at rest, and no longer throws the camera when the
heights switch on during a gesture.
Picking a point
is a mode of the same map: the sheet and bar give way to a hint and a
Cancel; a tap drops the pin. The strip at the bottom when nothing is open offers plan, home,
work, recent places and nearby stops. Picking a destination in the top bar
plans from the rider's location at once. The panels form a stack, and only
the top one is shown, the map following it (`map/view.ts` decides from
what the sheet holds; revealing a panel underneath draws it again, fitted
again); every panel and screen
change is a history entry, so the phone's back button closes the panel or
returns to the previous screen instead of leaving the app. Closing a panel
edits the stack first and lets history catch up, so programmatic closes and
the back button never disagree; an entry pushed while that catch-up is
pending waits for it (the browser measures a step back from where it was
asked, so a push made meanwhile would be swallowed). The menu opens from a
three-line menu button on a turquoise disc at the start of the search pill
(the app's logo sits at its end; a tap on it starts a search). Pressed, the
disc gives a little and the lines draw together; let go, both spring back
past rest. Opening search mode, the menu and the logo pop out before the
pill shortens; closing, they pop back in once it has grown back. The pill's
buttons are centred with `translate`, not
`transform`, so the press shrink every button has no longer drops them by
half their height. The menu is a drawer sliding in
from the start edge over a dimmed map, a history entry like the panels,
headed by the logo with "no account, everything stays on the phone", then
the screens and the build time. It follows a finger swiping it back to its
edge, on the drawer or on the dimmed map beside it, and closes past a third
of its width or on a flick (`widgets/swipeClose`, `touch-action: pan-y` on the
layers and on their scrolling bodies, since a scroller starts touch-action
afresh). Settings is a page
of its own over everything, the drawer included (`SettingsPage`, a layer
beside the panels like the drawer, so the sheet and the map stay as they
were): it slides in from the side the reading goes towards and out again,
and back (the arrow, the phone's, or a swipe the way it came) returns to the
drawer. The install row shows outside the installed app: Chrome's prompt
when it offers one, otherwise the steps for the browser in hand. Leaving search
mode starts the rows' play-out in the same moment the bar closes (an effect
in `state/search.ts`), and a suggestion list starts folding in the same
moment it closes (a signal effect in `SearchField`); set after a render,
both vanished for a frame first. The "to" tag on the search pill shows only once the bar is open
in two rows. The basemap is restyled in place when the theme changes (a
full style reload, after which the app's layers are added again).

Stored places keep the name they were picked with; shown in the other
language they are named again through the data worker (`state/names.ts`,
`localize` in the worker, `placeAt` in `places.ts`): a stop by its code, an
address-book place by its exact position and stored name, a picked map
point by the same nearest-address lookup that named it. "My location" is
always the interface's own words.

Back on Android: Chrome slides in a picture of the "previous page" for
every history step, which does not fit one map with things on top. Where
the browser has CloseWatcher (Chrome on Android), `state/nav.ts` gives each
panel one instead of a history entry, so back closes it with the app's own
animation; elsewhere every panel is a history entry. The sheet's box is the
whole screen and only its slide (`--sheet-h`) moves; the bar growing or
shrinking never resizes it. After a destination is picked the boxes stay
open (a change to the time or bike plans again); a tap on the map, a result
opened, a drag of the sheet, X or back folds them.

Icons are one hand-drawn stroke set on a 24-unit grid (`ICONS` in
`widgets/icons.ts`): injected once as an inline SVG sprite and used as `<use>`
references in markup and templates, and drawn with the same paths through
`Path2D` on the canvases that become the map's station and stop badges. No
emoji anywhere in the interface: emoji render differently on every phone
and cannot take the app's colours.

The compass button is a needle with depth (red north, pale south, a
centre pin), tilted in real perspective with the map. Pull-to-refresh is
the app's own: the browser's needs a page that scrolls and this one never
does (tried: `pan-y`, `pan-up`, lifting overscroll containment; Chrome's
circle never came, and whatever it did claim made the sheet drag stutter).
A pull down on the bar or on the collapsed sheet shows a circle that follows
the finger and lights up past 72 px; letting go then reloads, in Chrome,
Safari and the installed app alike. So the bar's controls and the collapsed
sheet say `touch-action: none` and the sheet reads every touch itself: up
opens it, down refreshes, sideways on the chip strip scrolls the strip by
script with a small fling (the browser never claims a gesture there, which
is what made starts on the strip feel stuck). The drawer also has "reload
the app". On iPhones, which never fire the install prompt in any
browser (all of them are WebKit), the settings row "add to home screen"
explains the way of the browser in hand: Safari's share button at the
bottom, Chrome's by the address bar, Firefox's and Edge's in their menu,
then Add to Home Screen; the page carries the Apple meta tags and touch
icon. Touch feedback is the app's own: the browser's tap highlight is off,
buttons press down a little, rows and cards tint, and a soft ripple spreads
from the finger on anything tappable.

Checks: `npx --yes eslint@9 app/*.js` (eslint.config.mjs at the root, the
no-undef rule) runs in the deploy workflow before the build.

A plan from now also looks ten minutes back, for the rider who boarded
before opening the app: what left in that time is kept out of the list and
behind one quiet line ("already riding? 3 rides just left") that opens on
a tap into rows with an "I'm on it" button (the four most recent). When a
plan is restored from earlier the rows show at once, since that rider is
likely on the way already.
A search is always planned afresh, never shown from before (live times change in
between); reopening the app within six hours opens the last search again with
its places and options and plans it anew (from now, and from where the rider
is, when it was so);
starting any journey whose first ride has left begins the follower on
board that ride (the last ride to have departed), not at the walk to the
stop, with the position moving it along from there.

Planning: from and to can be a stop or station, an address, a street, a
place, a city, the device's location or a point picked on the map. From a
point, the walk to each stop within reach is the street-network walk plus
a 30 s buffer, except that standing within 60 m of a stop (150 m of a
railway station, which the feed keeps as one point) counts as being there,
and within 300 m the straight walk with a 1.3 detour factor caps a network
path that wanders off to reach the stop's node; the
search box lists saved and recent places when empty. The time is Now,
Depart at or Arrive by, the last two set on three wheels (day, hour, minute,
like an alarm clock); the popover edits a draft that is set when it closes
(Done, a tap elsewhere, or Go) and plans again when there is a destination,
and a chosen time holds when a destination is picked after it. The day wheel
shows calendar days only (Today, Tomorrow, the date): a time before 03:00 is
planned on the day before's timetable at 24:00 and later (a day's timetable
carries its night, the next day's early trips included), and the planner
keeps such a time as "25:30" (`state/search.ts`, `setWhen`). Arrive by searches
a two-hour window ending at the target, latest departure first; only the
journeys arriving in time are ranked against each other; every plan also runs a
train-only search, and journeys with a train and without one are ranked
apart, so a slightly faster bus never hides a train;
changing the day keeps the chosen time; bicycle choice; the longest walk to a stop
(the whole walk at either end, a walk on to another stop included, shown as one
walk; between the same two vehicles the change is made where there is time to
spare and the least walking, `easierTransfers` in the worker) is a setting (a stepper, 3 to 45 minutes; the number can be typed). Results come back grouped: journeys that
board and alight at the same stops are one card with its departure times
and the alternative lines of a leg shown together ("5 / 18"). Every card
says when its first ride leaves its stop and the rides after it, the way
Moovit does (maintainer, 2026-11-08): "Leaves Rehovot: now · 20:56 · 21:24",
the chips being the card's options (a tap opens one; a direct way also keeps
up to two earlier departures that arrive later, dashed, their arrival not
written on the chip, which the router drops as beaten but a rider at the
platform wants, 2026-10-22) and the next
departures of the same route from that stop that the plan listed
(`plan.ts nextDeparts`, on the live-shifted timetable), one per trip, the
own ride and up to three after it. A chip reads "now", "18 min" within the
hour, else the time; its colour is how sure the time is (`text/live.ts
sureness`: green a fresh live report, orange an old one or no vehicle seen
for a ride due within 20 minutes, red an estimated line); a departure gone
by greys out. There is no "leave in N min" for the rider's own setting out
and no "at the stop in" line: the one time that includes the walk is the
card's start. The cards are in the order chosen by the option each
one shows (its first departure still ahead), so "by arrival" is the
arrival on the card; each card's number on the map comes from its group's
first option and does not change as departures pass;
earlier/later buttons shift the window; no result in the window says when
the next way leaves ("nothing before 20:23", the worker having searched
once from the window's end, with a button that plans from then), or that
nothing more runs that day (on a Friday, that transport resumes after
Shabbat) with a button for the next day; a stop too far offers an hour later or
a longer walk. The last search opens again, planned afresh, when the app is
reopened within six hours; the
recent searches sit under the form and re-plan from now. The sheet's
history (`results/Recent.tsx`) has three tabs, trips, lines and stops, which
follow the bar's kind and switch on their own, each with a count, and a
second level of lists under each: trips are Opened (the ways opened),
Searched and Saved, lines and stops Recent and Saved (a star on a journey,
a line or a stop; the recent from `recentViews` in `store.ts`, on the phone
only). What was opened comes first, as it is what is usually wanted again;
each level opens on the first list with something in it. For a line or a
stop, searching it and opening it are one act, so one recent list (stops
with stations and pairs of stations). The line and stop searches list the
four opened lately of the chips' kind above those near the rider while the
box is empty; in the train timetable the From box offers recent stations
(a pick sets From) and pairs (a pick fills both and opens the trains). Entries keep what
names them in the feed (a route id, the number on a stop's sign, positions),
since the timetable's own numbers change from day to day; the worker's
`findRecent` finds them in the day loaded. A trip keeps its journey and
reopens as it was while the same build of that day is loaded and it has not
ended; otherwise it is planned again from now.

Journey detail: the legs drawn on the map, pins at boarding and alighting stops and
dots at the stops between (a tap on a ride leg focuses it: its course alone, only
its vehicles, the map fitted to it; a second tap releases), the whole line of every ride drawn faded
beneath it with all its stops (where the bus comes from and goes on), and
every reporting vehicle of those lines with its delay and heading, the one
running the planned trip ringed; every ride leg expands to its stops and
times; live badge per ride leg; start trip; share (Web Share with a text
summary and a link that opens the app with the same query); star to save.
Following a trip draws the same, with the rider's position.

Trip following ("start a trip"): the journey is stored on the device and
followed with the geolocation watch, a screen wake lock and a five-second
clock. `follow.ts` advances through the legs from the rider's position
(within 60 m of a stop; on a ride, the stretch between two stops the rider
is on, a stop reached once passed or within 60 m, never backwards) and falls
back to the timetable clock when there is no position. It raises "one more
stop" once the stop before the alighting one is passed, "get off here" at
the stop, and "arrived" at the end: vibration, a short beep and a
notification (through the service worker, so it shows with the screen off),
each switchable in settings. While following, a silent notification that
stays and updates in place carries the step ("3 stops left · get off at Y
~22:13 · as of 22:05"); a locked phone pauses the page, so it leads with
clock times that stay true when it stops updating. The screen shows the current
step in large type, the vehicle's live position and delay, the remaining
legs and a "next step" button for when GPS is wrong. Closing the app does
not end the trip: a floating bar at the top offers to resume it, and if the
app was on the follow panel it reopens there. A trip ends by the rider's
"end", by arrival, or by going stale (45 minutes past its arrival).

Re-planning on the way (v0.3.1): delays can make another way faster, so
while a trip is followed the app plans again from the stop the rider
reaches next (the next stop of the ride at its expected arrival, delay
included; the boarding stop while waiting; the stop a walk leads to, when
the walk ends) to the same destination, with the live vehicles around it,
whenever the ride runs three or more minutes late, its vehicle is missing
within ten minutes of departure, or five minutes have passed (never more
than once per 90 s). An answer whose rides (trip and alighting stop each)
are the ones already followed is the same plan, and its arrival is the
best estimate of staying; any other answer is proposed only if it arrives
at least four minutes earlier, plus three per extra transfer. The proposal
is a card in the follow panel ("get off at X, line Y towards Z at T, arrive
at T', n min earlier") with one tap to switch: the followed journey is
spliced (the current ride cut at the next stop when the vehicle changes,
the new ride from the next stop when only the alighting stop changes, the
current walk kept), the follower's state is rebuilt on board or waiting,
the map redrawn, the stored trip updated. A dismissed proposal stays away
for fifteen minutes. The pure parts (origin, plan identity, splice) live in
`follow.ts`.

Names in the rider's language: the data's English where it has it, the
build's where it has none (`pipeline/english.py`, used by the address
book, the timetable's compiler and the entrances file), and in the app
`src/engine/latin.ts` as the last resort inside every name helper, so no
Hebrew letters reach an English screen (`docs/principles.md`, rule 3).

Station entrances: the feed has one point per station, near its middle,
while the Red Line's underground stations open up to 150 m away on
different streets. `pipeline/entrances.py` reads them from OpenStreetMap:
the lettered entrance nodes of the underground stations, and for train
stations, which are mapped loosely, the doors tagged on a building that is
a station and the places where an outdoor footway meets that building's
outline (a hall's entrance is often no node at all), a door on a bridge
carried to the building the bridge reaches (Azrieli, the Bursa: where the
tickets are), a building with neither given its side nearest a path, twin
doors of one hall merged; rail stations only, so a bus terminal's
neighbours' doors never appear. The names riders know entrances by
(`pipeline/entrance_names.json`, from the stations' Wikipedia articles:
"Azrieli entrance", "northern entrance") go to the file's entrance nearest a
point named there. The router is unchanged; when the worker writes out a
walk that ends at or starts from a station with entrances (`exits.ts`,
from `plan.ts legOut`), it picks the entrance with the shortest street
route to the rider's point (or to the other stop of a transfer walk; as the
crow flies until the street graph is in), draws the walk to it and on to
the stop's own point (the stretch inside the station, so the line meets the
ride drawn from the stop: the map draws that stretch lighter, thinner and
without casing, and puts a stairs mark with an accent ring at the entrance,
`map/layers.ts` walkPieces and doorMarker), and puts it on the leg: letter,
position and the street it opens onto, named by the address book. Every
entrance is also on the map by itself from zoom 15 (`lm-doors`, a stairs
badge like the bus stops', its letter from zoom 16), so a rider at a
station sees where it opens; a tap on one opens a bubble, "Entrance A ·
Shaul HaMelech" over the street it opens onto (the worker names the station
in the rider's language from the tied stop, `doorInfo`), with to here and
from here. The detail says "walk 3 min to Allenby · Entrance B
(Rothschild)" and "walk 4 min from Allenby · Exit C (Yehuda HaLevi)"; the
follow screen's "get off at" names the exit, and the walk to a station ends
for the follower at the entrance, not the station point. Walk times stay as
planned: the entrance is within the station's own distance of its point.

Search and addresses: `pipeline/places.py` compiles an offline address book
from OpenStreetMap (streets with their city from the nearest transit stop,
house numbers, cities from the feed, and named places: landmarks such as
hospitals, universities, malls, parks and stations, and everyday places such
as restaurants, cafés, bars, hotels, shops, pharmacies, banks, schools,
synagogues and offices), and Overture Maps' everyday places where
OpenStreetMap lacks them (`pipeline/overture.py`: Israel and the
Palestinian territories, confidence 0.5 and up, the kinds a rider travels
to; one with the same name within 150 m of an OpenStreetMap place is that
place), and where both lack them, Israel's public bodies
(`pipeline/public.py`, the same file shape and the same rule): businesses
with their trade names from Tel Aviv-Yafo's licensing layer (21.5k licensed
businesses, 10.9k with a trade name, the licence's description read into a
kind: a café, a falafel stand, a pharmacy, a hairdresser; storage,
production, offices and taxis skipped) and Be'er Sheva's signage survey
(3k), and the Survey of Israel's institutions on data.gov.il (schools,
kindergartens, colleges, universities, research institutes, yeshivot,
about 14k named, converted from the Israeli grid, "גן ילדים - גן דולב"
read as גן דולב): about 45k streets, 212k house numbers, 158k places (49k
from OpenStreetMap, 90k from Overture, 19k from the public bodies), 5.5 MB
gzipped. Overture's confidence is mostly Meta's own signal for a page; at
0.5-0.7 the names are still real shops and restaurants (a 2026-11-01
sample), below it closed and one-off pages take over, so 0.5 is the floor.
Overture's hospitals and malls come in as clinics and shopping centres, so
only OpenStreetMap's rank as landmarks. Landmarks rank above streets
at an equal match, everyday places level with them, so an exact name wins
without burying street searches in shops. `src/engine/places.ts` parses free text ("דיזנגוף 50,
גבעתיים", "קניון עזריאלי", "תל אביב"), understands common city aliases, and
ranks stops, addresses, streets, places and cities together, nearer ones
first when the user's location is known (distance breaks ties even among
places close by). Trailing words that name a city are the city ("דיזנגוף 50
תל אביב"), unless the words as typed are a street's name: many streets are
named after cities (שדרות ירושלים 15, דרך חיפה 3), and a street-type word
(שדרות, רחוב, דרך) says the rider means a street, so no city row is offered
for it. A place is also found with one typed word left over ("חומוס אבו חסן"
for אבו חסן, "ארומה דיזנגוף" for a branch named only ארומה), but only when
every word of its name was typed exactly, and it lists after everything
found as typed, like a slip. A quote mark inside a word belongs to the word, so הל"ה,
צה"ל, ג'וליס and כפר חב"ד match whether typed with the mark, without it,
or with the keyboard's ״ or ''; the same rule normalises stop names. A stop
matches whether its Hebrew or its English name is typed (both are indexed),
and every name the worker hands out (results, stop lists, headsigns, the
map's station labels) is in the app's language, with Hebrew where the feed
has no translation. The address book carries an English name beside every
Hebrew one: the source's where it has one (OpenStreetMap's name:en, 81% of
streets and a third of places; Overture's and the feed's), else one made at
build time by `pipeline/english.py` (95k names): spellings learned from the
126k names that have both languages (a Hebrew word paired with the English
word in its place, or the one that sounds like it where English reordered
the name, kept only when the two sound alike, so the lexicon holds spellings
and never translations: "ים המלח" is "Yam HaMelach"), a short table of
generic words put in English order ("בית ספר X" is "X School", "מלון דן" is
"Dan Hotel", "קפה" and "חומוס" stay in front), and the rest transliterated
by rule as Israeli signs write it (ח ch, צ tz, ש sh, vowel letters as
vowels, a light vowel between consonant clusters), a readable guess rather
than a right one without vowel points. A name with Latin letters inside it
keeps that part; Arabic-script names are left alone. The made names are
shown in English and searched like any other English name (about 700 KB
gzipped) and the feed's for cities; a word typed in Latin letters matches the English
words a name has (its English name, and Latin words inside the main name,
as Overture writes "מלון כנען ספא - canaan spa hotel") as text, else with
typos as search engines allow (edit distance: none up to two letters, one
up to five, two beyond; one typo just above a sound-alike, below an exact
word), or, failing that, the consonant skeleton of the Hebrew one (vowels
dropped, letters that sound alike merged, doubled letters collapsed, so
"Hayarkon", "HaYarkon" and "Ha-Yarkon" all find הירקון, and "Petach Tikvah"
finds פתח תקווה), scored a little below a spelled-out English name. A
Hebrew word not found as written is matched loosely, in order: the word
with one slip (a letter wrong, missing, extra, or two swapped: ארומא for
ארומה), the same skeleton (עזראלי, אזריאלי for עזריאלי), the start of it, and
from five consonants one slip in the skeleton (מקדולנדס); from three letters
typed, so short words reach nothing by chance. A Latin word gets the same
skeleton slip. A name found only loosely lists after every name found as
typed. A Hebrew word also finds a word a name has in Latin letters (a
quarter of the places are named so only: בלוק finds The Bloc TLV), when it
is the same whole word of three consonants or more, by an exact form of the
skeleton that keeps what a Hebrew speller writes: ב is b or v and never w, a
consonant ו is v or w and never b, and a ו read as a vowel sits where the
Latin word has its o or u (so not "Walk", "Black" or "Ballet" for בלוק and
וולט). It scores as a sound-alike, below the word found as typed in Hebrew;
the candidates come from an index of the Latin words by skeleton, so a
search takes no longer. בי"ח and בי"ס read as בית חולים and בית ספר either way. The
skeletons are built once, by the worker as soon as the address book is in
(half a second on a laptop). Results
are named in the app's language where the data has the name. Stops
and places are ranked on one scale in the worker: match strength (a whole
word over a prefix, a name typed in full over a partial one; a street is
named by its first word, a place's words count alike), nearness, a point
ahead of a street at equal strength, an address ahead of everything when a
number was typed. A missing house number resolves to
the nearest known one on that street and says so. A point can also be picked
on the map (a tap drops a pin with a bubble naming the spot and a Choose
button; another tap moves it; a tap on a stop picks the stop), and gets its name from the same book in reverse:
nearest house number, place or street, else the nearest stop. Nothing leaves
the device.

Lines: the bar, while editing, has a Trip / Line / Stop switch above its rows
(its highlight slides to the chosen one; switching animates through `widgets/flip`:
the parts marked `data-flip` that stay glide to their new place, new ones pop
in, those that go fade where they were, one rule for every pair of states).
The line search is one box (the full keyboard: numbers carry letters, "4א",
and words after the number narrow it to where the line runs, "274 תל אביב";
words alone list the lines running there; a station's name for trains) with
chips under it for the kind of line: all, bus, train, light rail, cable car.
The switch and the chips leave the box its focus, so the keyboard stays up
while switching. The worker (`lineGroups`) lists lines as riders know them: a
bus, light rail or cable line is its code in the feed (route_desc's
"makat", shared by its directions and variants; the compiler keeps it as
the route's sixth field, and older timetables fall back to number,
operator and end cities), a train line is every train between the same two
stations (the feed lists each train as a route of its own, its route_desc
the train number: the compiler makes it the route's short name, so a
train's chip shows its number, as on the station boards, while the line
is "train"). Each line is
one entry: its chip, where it runs (a bus's cities, a train's stations),
its operator, how far its nearest stop is, then a row per direction with
today's trips. Empty, the box lists the lines with a stop within 800 m of
the rider; typed, exact numbers first, then prefixes, the nearest first
among equals (line 1 here before line 1 in another city). Chips are
styled by mode: a bus as a tag in its operator's colour, train (navy),
light rail (red) and cable (teal) as rounded pills with their icon, shared
taxis yellow, on-demand lines outlined. A line page shows the
direction's course on the map with every stop as a dot and the line's
vehicles reporting now, each with its delay (tap one for its bubble), the other
directions as buttons, today's trip count and first and last departure,
and the line as a timetable at the rider's stop: the stop the line was
opened from (a stop's view, a ride's boarding stop, the stop of the other
direction), else the nearest within 3 km, else the first. The day's times
there (worker `lineTimes`) show as a printed timetable, a row per hour,
past ones grey and the next one marked, a few hours tall around the next
one or the whole day with "All day" above it (above, since under a box
reaching past the half-open sheet it went unseen); a tap on a time fills the stop list
with that trip's time at every stop and how many minutes before or after
the rider's stop. A tap on a stop row makes it the rider's stop. Line chips
everywhere (stop cards, a stop's lines, a ride in a journey, a vehicle
bubble) open the line page. A ride in a journey opens "Every direct ride
from" its stop (worker `rideOptions`, `detail/RideOptions.tsx`): what a
station shows, for that trip only, so every line or train that goes from
where the ride boards straight to where it gets off (both widened to the
station's platforms and same-named stops within 150 m), by departure, with
when each gets there, the ride planned marked, each as it stands now
(`views/station/RideRows.tsx`, the one list shared with the trains between two stations),
six at first and the rest of the day at a tap; a row opens its line at the
boarding stop with that trip chosen.

Stops: the stop search is one box with chips for all, bus, train and light
rail (worker `stopGroups`): stops by name or by the number on their sign
(an exact number first), and with nothing typed those within 600 m; a
station is one entry with its platforms, and a light rail stop one entry
for both its directions (the feed gives most of them a stop per direction
and no parent: one name in one city within 400 m is one station, worker
`stationOf`). A bus stop opens its page (departures by line, below).
Trains and the light rail work the way their riders think, from station
to station, not by line, and many plan their own trips from the
schedule: the train and light rail chips turn the bar into a timetable
with two boxes, From station and To station, and a swap between them.
From comes first: the keyboard moves to it, and a station picked in the
To box while From is empty becomes From. The From box lists every
station of that kind, nearest first; the To box only those reached from
the From station without a change. The stop search opens on the chip
chosen in the settings (all by default; many riders look only for
trains). The sheet answers: with only From,
where its trains go (`stationReach`: the next train there and how long it
takes, today's count; a tap sets To); with both, the direct trains between
them (`trainsBetween`): leave, arrive, how long, stops, where the train
heads, live times for the next ones from one request for every train, a
tap opening the train's stops. The map draws the next train's course
(worker `rideCourses`) with the stations it calls at, the other ways the
trains take faint under it, and only these trains live; the bar folds to
a summary like a trip's (To, then From and the kind), a tap reopening the
two boxes and its X ending the search. Connections stay with the trip search.
Leaving the search (a stop or line picked from the list, back, a map tap),
the rows play out: the ones that go also give up their height as they do,
so the bar shrinks in step with the sheet's slide, and the kind row is as
tall as the space the resting pill keeps (52 px with the gap), so the pill
itself never moves between the modes; the removal of the rows at the end
changes nothing on screen.
The line and stop searches are a step of their own: the bar's back arrow or
a tap on the map folds them to a pill of their own (the kind on a chip
where the logo sits, its x back to the trip search), opening a line or a
stop folds the bar too, and the phone's back from there returns to the
trip search. On Android back takes the bar a piece at a time before
anything else: the keyboard first (the box lets go of its focus, the list
stays), then the open list, then the line or stop search. That is one
close watcher, made again after each piece (Chrome groups watchers made
from the same tap, so one per piece could close two at once); a keyboard
the phone puts away by itself counts as that piece. Switching between
trip, line and stop keeps the keyboard and the list as they were. The
lists hang from the bar itself, not from their box's row, so the rows'
glide never carries them; the list glides to the bar's new height and its
rows change once, the old ones dimmed until the new ones come. The boxes are search boxes (`type=search`
with a combobox role), so phones do not offer saved passwords over the
keyboard.

Stops: the stop search lists those around the device (with their lines and
how far) while its box is empty. A stop has one view, in the sheet, wherever it is
opened (a tap on the map, which opens it directly with no bubble first; a
search; a line, a trip, a saved stop): its lines (a tap opens one), from
here and to here, its next departures with live times (below), refreshed
every 45 seconds while open; a station is all its platforms, and below its
departures where its trains go without a change (`stationReach`; a tap
shows the trains between the two; a light rail stop likewise). The train
chip's timetable opens its From station as the same view; a departure
opens its line at this stop with that trip chosen (there is no trip page:
the line shows that trip's time at every stop); the map eases to the
stop with a pin; "to here" plans from the rider's location at once and
"from here" opens the form; stars save stops. Saved: home and work (one
tap plans a trip there from the device's location), other saved places,
saved trips, saved stops. Settings, as grouped lists (general, planning,
live times and alerts, the app, about) with an icon per row: language and
map look as pill segments, longest walk as a stepper, live times (with a
plain statement of what is sent), alerts and sound as switches, then a test
alert, add to home screen and clear history as rows, and the about text.
One look for the whole app, light, dark or the device's; a switch sets the
map and the menus apart, each with the same three choices: the map
through the light or the recoloured dark Liberty, the interface through a
data-theme attribute the stylesheet reads (absent means the device decides).

Time is Israel time whatever the phone's zone (`Intl` with
`Asia/Jerusalem`), and "now" is expressed in seconds on the selected
service day, so countdowns, live matching and following all agree past
midnight.

Data: `data/manifest.json` lists one timetable file per service day
(`timetable-YYYYMMDD.bin.gz`, about 3 MB; the app downloads only the day
being planned), the
learned section times (`bustimes.bin.gz`, 1.3 MB, and `railtimes.json`),
loaded first after the first answer because the road colours and the delay
estimates wait for them and nothing else, with them the station entrances
(`entrances.json`, 4 KB: `pipeline/entrances.py` reads from OpenStreetMap
where a light rail, underground or train station opens onto the street,
lettered A to D at the Red Line's underground stations, tied to its station
by the stop-area relation or the nearest station within 200 m; 18 stations,
37 entrances on 2026-11-05; the worker ties each station to the timetable's
train, light rail and underground stops within 200 m, since the feed names
a station's stops many ways), then the
courses (`shapes.bin.gz`, 3.6 MB: the feed's 6,749 shapes simplified to 6 m,
1.26M points as int32 1e-5 degrees) and the address book together, and last
the street graph (10.7 MB; until it
is in, points use straight-line access with a detour factor, and walks drawn
straight then follow the streets once it arrives; a download that drops is
fetched again after 5, 20 and 60 s and when the phone comes back online,
the same for the address book and the courses). Every data file is cached
on the phone by the service worker under its version, which the manifest
(fetched network first, 2 KB) gives per file: the content hash written
into the file's header by `pipeline/container.py` (the header without its
build time, plus the arrays), so a file rebuilt from the same input gives the
same hash and is not downloaded again, and only files whose content changed
are; the learned times, which change nightly by nature, are keyed by their
build time. In practice the street graph and the address book change once
a week (a new OpenStreetMap extract), the day's timetable and the learned
times nightly, and the courses only when the feed's shapes change. A file
whose size the manifest gives is fetched by the data worker in 1 MB pieces
(HTTP ranges, which GitHub Pages serves), each kept in a cache of its own
the moment it arrives, so a rider who opens the app for half a minute
advances the download instead of starting it over; the next open fetches
only the pieces still missing, and a whole copy the service worker cached
earlier is cut into pieces rather than downloaded again. Pieces that do not
make a readable file (a version change mid-download) are dropped and
fetched anew.
Each day's file says which shape every pattern runs on and where each of
its stops falls along it (segment and fraction, computed by projecting the
stop on the simplified course, never backwards, taking the first segment
ahead that passes the stop within 15 m of the nearest one, so a loop's stop
is placed on its first pass; a pattern whose trips name no shape borrows a
sibling's when its stops lie on it), so a ride between two stops is drawn
along the road; the pins at boarding and alighting sit at the stops
themselves, where the walks end. A straight line between stops is never
shown as a route: until the courses are loaded (or for the few patterns
with no course at all) a ride is drawn dashed from stop to stop, and the
faint whole lines around a ride or through a stop wait for their courses;
the redraw when the courses arrive puts both right. Trains have no shapes in the feed at all (every rail
trip lacks a shape_id), so `pipeline/rail.py` turns OpenStreetMap's
`railway=rail` ways (yards, sidings and spurs excluded) into a rail graph,
and the compiler routes every pair of consecutive stations over it with
A*, stores each pair's track once in the day's file (8 m simplification)
and draws a train ride by chaining its pairs. A station meets the graph at
the points where the tracks pass closest to it, on every track within 60 m
of the nearest one (a corridor like the Ayalon has four), and the search
starts from and ends at those points, with the gap from the station point
to the track counted double, so it picks the track that makes the shortest
run and meets it beside the station. Snapping to the single nearest node
instead sent trains 250 m past HaShalom and back over a crossover, which
drew as a tangle of parallel lines. A
service day's file also carries the next calendar day's trips that start
before 03:00, shifted by 24 hours, because the feed codes a 00:10 night bus
on the next date; so the night is complete in one file.

Deployment: `pipeline/build_site.py` assembles `site/`; the GitHub Actions
workflow in `.github/workflows/build.yml` runs nightly (and on push to
`main`): downloads the feed, rebuilds the street graph weekly, compiles the
next 7 days (a day before the feed's first calendar day is left out: a
build between midnight and 03:00 compiles the night's day, which a feed
downloaded then may no longer carry), and deploys `site/` to GitHub Pages, turning Pages on by itself the first
time (`actions/configure-pages` with `enablement: true`). No server, no cost.

The results on the map: the first three ways are drawn together, the
highlighted one in its mode colours with pins and stops, the others grey with
a white casing, each with a pill at the middle of its longest ride saying its
minutes (the highlighted one in the accent colour). A tap on a grey route or
its pill highlights that way and brings its card into view in the open sheet
(with a flash); a tap on the highlighted one opens a collapsed sheet on its
card, as does opening the sheet by any means. Each ride of the ways drawn
carries its line's chip a third of the way along (in its colours on the
highlighted way, grey on the others); results sort by arrival unless the
rider picks another order for that plan. A stop's page draws the courses
of the lines calling there, faint, and only their vehicles. The collapsed sheet's line
about the highlighted way folds away once the sheet opens (the list says
the same). The map is fitted when the ways shown change, not when another
of them is highlighted, so a rider who zoomed in keeps the view; each card has a map button that shows a way
(and highlights it), highlights a shown one, or hides the highlighted one.
Collapsed, the sheet is a handle alone, or, with results, a handle and one
line about the highlighted way (times, minutes, transfers, the countdown)
that opens the list on a tap. The chip strip that used to sit there (plan,
home, work, recents, nearby) is gone: the search pill and its list cover it
(the menu's "stops near me" went too, 2026-10-25: the stop search does it). The top bar is pills: the search
field, the summary box, the chips and the Go button.

Not yet: crowd reports, Arabic (the data format carries it, the interface
does not), the bike-on-board rules for light rail, fares.

## Compact timetable (format 3, built by `pipeline/compile.py`)

One file per service day, in the container every data file comes in
(`pipeline/container.py` writes it, `src/engine/container.ts` reads it),
gzipped: a u32 header length, a JSON header, then little-endian typed arrays
the app views in place:

- header: feed dates, counts, the section table, routes (line number, long
  name, operator, type, GTFS route id, line code from route_desc), stops
  (id, name, code), and `otherRoutes`: every other line of the feed by route
  id (number, operator, type, destination), so a vehicle reporting live on a
  line with no trips that day is still named (shared taxis run on Saturday
  that the feed schedules on weekdays only).
- route patterns RAPTOR-style: `patStopsOff`/`patStops` (stop sequence per
  pattern), `patTripsOff` (trip range per pattern), `tripTimesOff`.
  In the Israel feed every `route_id` is one direction of one line, so a
  pattern is a route; trips that would overtake are split into sub-patterns.
  `patStopFlags` (u8 beside `patStops`) says where a pattern's trips may not
  be boarded or not be left, from the feed's `pickup_type` and
  `drop_off_type`: an intercity line takes riders on only as it leaves a
  city and lets them off only as it enters one (the 480 in Tel Aviv), and
  14% of all stop times are marked so, on 38% of the routes. Trips with
  different marks are different patterns. The router boards and arrives
  only where allowed, and so does everything that offers a ride (a card's
  next departures, a leg's other rides, an easier change, a stop's
  departures), through `canBoard` and `canAlight` (`engine/raptor.ts`). A
  file without the section reads as all allowed.
- times: per trip an absolute `tripStart`, then per stop the departure delta
  from the previous stop (u16) and the dwell (u16). The app expands these to
  absolute arrival/departure `Int32Array`s on load (about 80 ms). Dwell is
  all zeros in this feed and deltas repeat across trips, which is why gzip
  gets 26 MB down to 2.8 MB.
- `stopPats`: for each stop, the (pattern, position) pairs it appears in.
- Reading the layout: the router's own loops read these arrays directly
  (the hot path). Everything else asks the accessors beside the format in
  `engine/raptor.ts`: `patternLength`, `patternStop`, `lastStop`,
  `stopsBetween`, `patternIndex`, `tripRange`, `tripCount`, `timesRow`
  (where a trip's times start in `dep` and `arr`) and `patternsAt` (a
  stop's patterns), so where a pattern's stops or a trip's times sit is
  written once.
- footpaths: `trOff`/`trTo`/`trTime`: street-graph walking times within 10
  minutes (straight-line within 400 m when built without `--streets`), plus
  platform-to-platform inside stations. The feed has no `transfers.txt`.
- `stopLat`/`stopLon` as f32, `stopParent` (station index), `stopNode` (the
  stop's node in the street graph, for the first and last mile).
- header extras: stations, each stop's city (from `stop_desc`), the walk and
  slack parameters the router reads, and `names`: the stop, station and city
  names and the headsigns in other languages (English now; `--langs en,ar`
  would add Arabic), from the feed's `translations.txt`, which covers 99.6%
  of stop names, all but a few cities and all but a dozen headsigns (a
  headsign is translated piece by piece around the dashes of the MOT
  "stop-city" convention). The feed spells a quote mark three ways (`"` in
  stops.txt and translations.txt, `''` in routes.txt, `״` elsewhere) and is
  loose with spaces around a slash, so lookups go through one key. A missing
  translation falls back to Hebrew. English costs about 240 KB gzipped per
  day.

Not yet in the format: headsigns per trip, fares.
Search is done in the app over names and cities (`searchStops`), grouping a
station's platforms into one result.

## Pipeline

- Shared by the scripts: `pipeline/container.py` (the data files' container)
  and `pipeline/common.py` (the log line, GTFS reading, Israel's UTC offset,
  distances).
- Source: Israel Ministry of Transport GTFS, published daily at
  gtfs.mot.gov.il (`israel-public-transportation.zip`). Data terms still to
  be checked.
- Weekend lines (`pipeline/weekend.py`, a build step after the download):
  the municipalities' free Friday and Saturday buses in Gush Dan, "Na'im
  BeSofash" (lines 705-729), are not licensed by the Ministry, so neither
  its GTFS nor its SIRI carries them. Their routes and stops come from Tel
  Aviv's GIS server behind the official map (layers 992 and 993; stops by
  the Ministry's stop code), merged into the feed as an agency whose id
  starts "est-" (the compiler sets the route's estimated flag). No
  timetable is published, but the operator's page for each line (Noa Tanua,
  noat.co.il/routes/line-716) gives its hours and headway per day, read as
  the first and last departures from the line's first stop and the interval
  (they differ a lot: 716 every two hours, 713 hourly, 705 every 20 minutes;
  the hours kept from the last run when a page does not answer, the service's
  general hours every 20 minutes as the last fallback); the return direction
  leaves after the outbound's one-way run, as one bus shuttling would; the
  speed an estimated 20 km/h on Friday evening and 24 on Saturday stop to
  stop (Gush Dan buses measured 24 on a Saturday, 15 on a Thursday
  evening). A stop goes with the direction travelling the way the feed's
  own buses leave it, else the one passing it on the right; of 1,377 stops
  12 land in both directions (ends), 51 in neither. The app shows their
  times with "~" and says they are estimates with no live position. Live
  positions do exist (researched 2026-10-30): Tel Aviv's shuttle tender
  280/2023, technical annex §3, requires every weekend bus to carry a fleet
  tracker (Ituran or Pointer class) and a dedicated phone "broadcasting the
  vehicle's position in real time to the municipality and to the riders",
  and its event codes include a Moovit device fault, so the positions reach
  Moovit, and by the municipality's own page also Bus Nearby and Rav-Pass
  (both HopOn). None of that is published: the buses are absent from the
  national SIRI (Hasadna's archive has no vehicle on the 716's route on a
  Saturday), Bus Nearby's API sits behind a bot wall with no terms allowing
  reuse, and no GTFS-RT or open-data copy exists. The way in is an
  agreement with the municipality's transport authority or Noa Tanua, who
  already hand developers the routes; the fallback we control is riders'
  own positions, opt-in and anonymous, while they follow a weekend trip. The
  server's last answer is kept in the Actions cache for when it times out.
- Nightly GitHub Action: fetch, validate, compile, publish static files plus
  a manifest (feed date, format version, checksums). The app reads the
  manifest and downloads only when something changed. Every push to `main`
  deploys too; the street and rail graphs are cached for a week and the
  seven compiled days are cached by feed, graphs and compiler source, so
  an app-only push skips the six-minute compile and is live in about two
  minutes.
- When the Ministry's server does not answer (it did not, for a morning in
  October 2026), the build uses the last feed that downloaded, kept in the
  Actions cache a day at a time, so an app change still deploys.
- Train section times (`pipeline/railtimes.py`, its own nightly workflow
  `.github/workflows/railtimes.yml` at 04:40): the last 7 days of train
  positions from Hasadna's database, an hour per file kept in the Actions
  cache so each night fetches one day (two requests at a time; the first
  run fetches the week), learned into `railtimes.json` (about 150
  sections), which the site build takes from the cache. See Real-time.
- Bus section times (`pipeline/bustimes.py`, its own nightly workflow
  `.github/workflows/bustimes.yml` at 04:10): each night reads the service
  day just over from Hasadna's per-minute snapshots (about 1,380 files,
  ~300 MB, four at a time; the files the relay passes on) and keeps its
  passage log (when each bus ride passed each stop, ~25 MB a day gzipped)
  in the Actions cache for 14 days; at most three missing days per run, so
  the history fills over the first nights. Learned into `bustimes.bin.gz`
  (about 44,000 sections, 0.8 MB), which the site build takes from the
  cache. The workflow logs a held-out measurement every night. See Real-time.
- Hosting: GitHub Pages or Cloudflare Pages, both free. Torrent/IPFS were
  considered and rejected for now (a CDN is free; peer-to-peer in a browser
  still needs servers). An optional mirror can come later.

## Real-time

Done in v0.2 with Hasadna's Open Bus project (open-bus-stride-api.hasadna.org.il),
which records the Ministry of Transport's SIRI vehicle feed every minute and
serves it with `Access-Control-Allow-Origin: *`, so the phone asks it
directly: no key, no relay, no server of ours. Measured facts (2026-10-17):

- `siri_vehicle_locations/list` answers in 1 to 3 s with a closed
  `recorded_at_time` window (from and to) and `order_by=recorded_at_time
  desc`, for line, area and operator queries alike; without the closed
  window, or unsorted, it times out. A few rows carry impossible future
  times and are dropped.
- SIRI's `line_ref` is the GTFS `route_id`, which the timetable now stores
  per route, and a ride's `scheduled_start_time` (UTC) is the trip's first
  departure, so a vehicle maps to a timetable trip by (route, first
  departure) with no extra data. Night trips are matched on the service day
  they are shown on.
- Delay is estimated on the device: the vehicle's position is projected on
  its trip's stop sequence, the scheduled time at that point is compared
  with when it was seen, and the result is applied to the stops ahead;
  past the rider's stop it reads "passed". A vehicle more than 600 m off
  its stop sequence gives no estimate; one older than four minutes is
  marked stale. Mismatches between the feed and the operator's actual
  schedule show up as implausible delays; rough, but honest about it.
- Trains (since 2026-10-22): a train does not run at one speed between
  stations, so the timetable's pace misplaces it in time. `railtimes.json`
  holds, per section between two stations, the usual running time and the
  share of it spent at each tenth of the way (on the same straight line
  between the stations the app projects on), learned from the last week's
  positions: each ride's arrival and departure at a station are when its
  fixes come within 300 m of it and leave. Also the stand a late train makes
  at each station. From a train's position the app then works out when it
  reaches the next station and, leaving each station no earlier than the
  timetable after its usual stand, every later one; a train standing at a
  station leaves after its usual stand, not at the listed time: the feed's
  one time per station is about when a train pulls in.
  Its predicted lateness is its arrival at the next station against that
  listed time (a departure-based delay made every train late by its stand).
  What the rider is shown, everywhere a train's time appears (a trip, ride
  options, a stop, the trains between two stations, a line, the planner,
  the vehicle's badge; `liveAt` and `sureLate`), is the listed time plus
  only the lateness we are about 85% sure of: the prediction less a margin by
  how far ahead the station is (20 s within 5 minutes, 60 to 10, 100 to 20,
  140 to 30), in whole minutes from 2 up, never early. Each margin sits just
  under the 85th percentile of the signed error at that distance on three
  replayed mornings (`measure/trainbacktest.mjs`, its "85% at most" column:
  30-36 s under 5 minutes, 66-84 at 5-10, 102-114 at 10-20, 138-162 at
  20-30; 2026-10-21, 25 and 26, 07:30-10:30), so "sure" is 80 to 85%; beyond 30 minutes ahead a
  station only carries the lateness of the one before, less what the
  train can make up between them (times never run backwards). Most small train delays are made up on the way, and on ordinary
  mornings the point estimate was no better than the timetable (2026-10-21
  and 26: a typical miss of 1.5 against 1.4 minutes) and showed a train
  that came on time as late in a fifth of predictions; shown this way, in
  under 1%, while a time 2 minutes or more after the train came is about
  as rare as with the timetable alone (`measure/trainbacktest.mjs`, last
  line). A train's
  position is read only while it is believed (rule 8 of "Live times, end to
  end"): one in ten train reports names no position and half of all train
  rides repeat a dead one at some point, and such a train shows the
  timetable. Placing it by the station its report names next was tried and
  dropped: it predicted worse than the timetable alone.
  `measure/trainbacktest.mjs` runs this code on a morning's raw minute files
  and scores every prediction against when the train's GPS reached the
  station: 07:30-10:30 on 2026-10-25, a typical miss of 2.1 minutes (the
  timetable alone 3.1; the code before that day 2.6, 2.3 early in the
  median), on 2026-10-21 1.9 (timetable 1.6; before, 1.9). A learned
  per-station catch-up for late trains (h, 26 s) was dropped then: it made
  the median 0.7 to 1.6 minutes early, though on 2026-10-21 it trimmed the
  worst tenth (90% within 7.6 minutes against 8.9 without). Late trains do
  recover on lines with slack in the timetable and not on others; learning
  that per section is the next step. Trains standing at their first station
  are the weakest case (assumed to leave on time; typically 1.4 minutes
  later). Measured on a day held out of the learning (2026-10-21, 8,000
  positions, against the arrivals the train actually made), arrivals within
  a minute: next station 86% (timetable pace 46%), two ahead 57% (32%),
  three 44% (31%), five 37% (29%); on 2026-10-20 held out, 86% (46%), 60%
  (33%), 47% (31%), 34% (28%); a few rides that stood still for an hour
  are wrong either way. A section never seen keeps the timetable's pace.
  `npm test` checks the arithmetic, and the app gives the same times as the
  measurement to the second.
- Buses (since 2026-10-23): the timetable gives a stretch of road the same
  time all day and buses do not keep it (nationwide, buses took 1.3 to 1.5
  times the timetable between 07:00 and 19:00, 0.94 at 05:00; 2026-10-22).
  `bustimes.bin.gz` holds, per section between two consecutive stops (stop
  code > stop code), all lines on it pooled, the median time buses took per
  hour (05..23, then the night) and kind of day (Sunday to Thursday,
  Friday, Saturday), a byte each; a cell with fewer than 3 runs borrows the
  hours either side, else the timetable's time stands. The passings come
  from each ride's positions placed along its trip's stops as the app does,
  searched forward so a loop is not read backwards, interpolated between
  positions at most 3 minutes apart (85% of stops get one). From a bus's
  position the app (delays.ts busAhead, in the data worker, where every
  estimate is made since then) adds the rest of its section and each
  section's learned time at the hour the bus will be there; its delay is
  the one at the next stop and the planner shifts each stop by its own.
  Measured on a day held out of the learning (2026-10-22, learned from
  18-21; bus seen at a stop, predicting its arrival further on, against the
  passings it actually made), within a minute: 3 stops ahead 77% (timetable
  pace 52%), 5 ahead 63% (36%), 10 ahead 42% (19%); median error at 10
  stops -0.5 min (-2.5); at the peaks 10 ahead 39% (15%). Each of 18-21
  held out in turn gave the same within a point or two (10 ahead: 20% to
  44% every day), and the app's own code (delays.ts) gives the measurement's
  times to the second (2,990 of 3,000 predictions; the rest within 18 s,
  a position on the edge of two sections).
- How the roads run now, from the buses: the data worker follows every bus
  across the snapshots it reads (the last 15 minutes; the first load also
  reads the ones of 10 and 3 minutes before, or does so as soon as the
  learned times are in when those land later: replayed against a quarter
  of an hour of polling, `measure/trafficreplay.ts`, that cold start colours
  92% of the sections and agrees on the level 93% of the time, with no lean
  towards slower), and between two positions at least
  90 s apart (and at most 6 minutes, and covering a stretch it usually
  takes 90 s or more: a crawl out of a terminal is not the road) compares
  the time it took with the learned time of what it covered. Each section
  it covered gets that ratio. A section's time ahead
  of another bus is its learned time times the median ratio of the other
  buses there, one vote per bus (the median of each bus's own runs, then
  the median of those: a bus seen three times crawling out of its terminal
  outvoted the other, 2026-11-07), shrunk towards 1 when few (n / (n + 2)),
  with one bus no evidence and a tenth either way taken out as noise (2026-11-07: as it
  was, the factor moved the time shown in a third more of the minutes for
  2 to 3 points of accuracy; `measure/busbacktest.ts`), and fading to the
  learned time for sections reached more than half an hour on. Measured the
  same way it trims the worst (90% within 3.9 min at 10 stops ahead against
  4.1 learned alone, every held-out day; 4.6 against 4.8 at the peaks) at
  the cost of a point of the share within a minute (77% against 78% three
  stops ahead). A bus's own recent pace was tried as well and added
  nothing. Measured only where the buses ran on those days; roads without
  bus lanes and days with an accident are where it should matter most.
- Traffic on the map, from the same ratios (a setting, on by default once
  the learned times exist): each section that at least two buses ran in the
  last 15 minutes (on a section of 2 km or more, a highway between
  interchanges where each line has its own stops, one bus seen along it
  three times), a bus placed on its pattern's course (not on the straight
  line between stops, which a highway curves away from), drawn along the
  course, coloured by its time now against its
  best in the day's hours (the second-fastest hour of 06..22; the night,
  with nobody at the stops, made every road read slow): green up to 1.5
  times, orange to 2.2, red to 3.2, dark red beyond. Replayed on Tel Aviv,
  2026-10-22: at 10:00 72% of 973 sections green, at 17:00 49% of 843, with
  the jams where the buses stood. It is under the map's labels and hidden
  with the live vehicles while a journey, line or trip draws its own.
- Trains take their next trip's number before it starts: 18% of train fixes
  came before their trip's start, 94% of them at its first station. The
  rest (about 35 trips a day) come from a train still running elsewhere,
  typically 12 minutes before: a quarter have a twin, another trip running
  reports from the same spot that minute (one train under two numbers, or
  two coupled), about a tenth plainly continue a trip that has gone quiet
  (the train finishing it under the next number, usually with under 15
  minutes left), and the rest have no trip near them (empty runs to the
  start). The feed cannot say which train is which (a train's vehicle
  number is its trip number), so the worker hands a fix back to the trip it
  continues only when that trip has missed two reports (2-15 minutes), the
  fix is on its path, further along it, no further than a train runs in the
  time, gives it a real delay within 5 minutes of its last, and no other
  trip fits; it drops every other such fix. Replayed through the worker on
  rebuilt snapshots of 2026-10-20 and 21 (69 such fixes): 3 handed back to
  the right trip, 5 handovers left out (dropped), none to a wrong trip.
- Where it shows: badge per ride leg in a journey around now (and the
  vehicle on the map), live times for a stop's next departures (one area
  query, then by line for what it missed), the vehicle's place in a trip's
  stop list, the current vehicle while following a trip (every 30 s), and
  the map itself: every vehicle reporting in view, coloured by mode with
  its line number, refreshed every 20 s and on every pan (not while the
  sheet covers the map or the app is in the background), with the stops
  when zoomed in. The layer follows the view: with nothing searched and
  the map around the rider, every vehicle, those of the lines serving stops
  within 500 m of them (what can be taken from there) in front and the
  rest faded (elsewhere on the map, everything alike); while results are shown, only the lines of those journeys (the
  note says which); hidden while a journey, a line or a followed trip
  draws its own vehicles (the rider's own carries its minutes late; the
  others show it in their bubble). The note under the map is folded into a
  round info button at the map's corner (a tap opens it, another or eight
  seconds fold it; the button turns orange when the data is behind), one
  sentence per case: "12 vehicles of the lines searched · data as of 08:05 (18 min
  ago, the source is behind)", or "No vehicles of the lines searched
  reporting in this area right now". A vehicle whose last report is
  more than five minutes behind the newest report of its own set (the
  vehicles in the area in view, or the line's) is not drawn at all (the
  feed lags as a whole and unevenly by area; a single stale vehicle is
  noise, but a whole area twenty minutes behind the rest of the country is
  still the best picture of that area; the newest report skips a lone one far
  ahead of the rest, and the worker drops reports stamped after the snapshot
  was taken: vehicles with a wrong clock, which hid an area's buses). When
  the whole feed is four or more minutes behind the clock, every dot is
  drawn faded, the note says how old the data is and that the source is
  behind, and a vehicle's bubble gives the age next to the report time.
  Stops carry a kind: railway stations, light rail stops and bus stations
  (a parent with platforms) are badges with the mode's glyph from zoom 11,
  one per station at the centre of its platforms (a tap shows the lines of
  all its platforms); ordinary stops and platforms are the small circles
  from zoom 14, and from zoom 15 every bus stop also wears a smaller grey
  badge with the bus glyph over its circle. Station names sit under the
  badges from zoom 12.5 (the basemap's own transit symbols, the blue
  squares, and their labels are hidden, since they doubled our stops). The
  same badges mark stations along a drawn line or journey. A tap within 14
  px of any drawn stop opens its bubble, a dot being smaller than a finger.
  A tap on the bare map while the sheet is collapsed drops a pin with a
  bubble naming the spot (a place of the basemap under the finger by its
  name, anything else by reverse geocoding) and "to here" and "from here";
  with the sheet open, a map tap only collapses it. A tap on any vehicle, on any map, opens a bubble
  on the map (line, direction, agency, when it reported, speed, delay) with
  one button to its line, that vehicle's trip chosen. A tap on a stop opens its
  view in the sheet when the sheet holds nothing of its own (the map at
  rest, another stop); while it holds results, a journey, a trip
  being followed, a line or the trains between two stations, a stop tap
  never takes that away: a bubble names the stop, when the highlighted way,
  the journey or the chosen trip of the line passes it, its lines, and stop
  details / from here / to here (on a line, "times here" first, making it
  the rider's stop). The map slides so a bubble sits whole between the bar
  and the sheet.
- Planning with live data: a plan from now (the current service day,
  within 20 minutes of the clock) first fetches the vehicles within 12 km of
  the origin and every train in the country (Israel Railways is SIRI
  operator 2, one query), hands them to the worker, which matches each to
  its trip, estimates its delay and shifts that trip's times from where the
  vehicle is onwards before routing. A train is boarded at the time it pulls
  in, the time the rider is shown (its learned stand comes after; one
  standing at the station already, until it leaves). Trips of a pattern stay
  in order at every stop, so the router's sorted-trip searches still hold:
  where a trip is now due after the one behind it, the earlier is brought
  forward to the later one's time, never the later one pushed back (the
  rider is at the stop for whichever comes first). A vehicle seen before
  its trip begins, or further along than it could have gone since its start
  (a loop's terminal is near its last stops too), waits at its first stop,
  on time; a report an hour past its trip's end, and the older report of a
  bus that has started its next trip, are not used. Everything is undone
  after the plan. So a train
  whose scheduled departure has passed but which is still on its way is
  offered at its real time, and a bus running early is not. The results
  say "live times as of HH:MM" or "schedule only"; each planned ride shows
  its delay, and the journey detail shows the scheduled time struck through
  next to the live one. A leg's identity for later matching (its first
  departure) is always the scheduled one, read from the stored start and
  deltas, never the shifted arrays.
- Freshness: Hasadna's ingestion lags, by 14 to 20 minutes in the morning
  rush on 2026-10-18 and 2026-10-19 (measured against the clock: at 07:58
  the newest ingested snapshot was 07:41), and backfills old snapshots, so
  queries look back half an hour, sort by recorded time (not id), and every
  screen shows how old the newest report is; a report older than four
  minutes is marked with "?" and coloured orange wherever a live time or
  delay is shown (green means a fresh report; lateness is the number, not
  the colour), one more than five minutes behind the newest report
  of its own set (area in view, or line) is left off the map, and when the
  feed as a whole is four or more minutes behind, the map says so and
  fades the dots. The lag is uneven by area: on 2026-10-19 at 15:34 the
  newest report in the Tel Aviv box was 20 minutes old while the newest
  in the country was 6 minutes old, so judging an area against the
  country's newest emptied the map over Azrieli. The lag is
  the pipeline's, not ours: the newest rows come first in every query. A
  position fifteen minutes old says little about where the bus is now; the
  delay it reports is still worth more than the timetable alone.
- Fresher through the relay (2026-10-21): Hasadna's database loads each
  minute's snapshot with one worker in about 90 s at rush hour (about 8,900
  vehicles), so it falls behind through the morning: every answer at 09:48
  was 15-16 minutes old, line and area queries alike. The raw snapshots are
  public before that step (`open-bus-siri-requester.hasadna.org.il/YYYY/MM/DD/HH/MM.br`,
  UTC, about 250 KB brotli, 4.3 MB of SIRI JSON, the newest under a minute
  old, half the positions under 40 s) but carry no CORS header. The relay
  (`relay/relay.js`, a Cloudflare Worker on the free plan at
  https://relay.waynet.app/siri/latest and, where carriers do not block
  workers.dev, https://wayli-relay.wayli.workers.dev/siri/latest, deployed by
  `.github/workflows/relay.yml`) reads `daemon_status.json` for the newest
  minute and passes that file through untouched, labelled
  `Content-Encoding: br` so the browser unpacks it, with CORS; `?ago=N`
  asks for N minutes earlier. The data worker downloads it, keeps it 30 s
  and answers every live question from it (a line, a box, all trains);
  Hasadna's API answers when the relay fails or its snapshot is over 10
  minutes old. The first load also reads the snapshots of 3 and 10
  minutes before, so what the worker remembers of each vehicle (how long
  its position has been the same, how long it has stood) is known at once.
- Privacy: while on, the phone downloads every vehicle's position in the
  country through the relay (which sees its IP, as any website does, and
  nothing else: the request carries no place or line), and when that
  fails asks Hasadna for the line numbers and the area it looks at. The
  settings screen says this, and one switch turns live times off.

The Ministry's own SIRI feed stays a fallback: it would need a relay with
credentials, worth building only if Hasadna's copy proves too stale or
unreliable in daily use. What is known about it (2026-10-18): the current
interface is SIRI-SM 2.8 over plain HTTPS GET,
`https://moran.mot.gov.il/Channels/HTTPChannel/SmQuery/2.8/json?Key=<key>&MonitoringRef=<stop code or AllActiveTripsFilter>&StopVisitDetailLevel=normal`
(a `moran-t.mot.gov.il` twin exists), as used by Hasadna's requester
(github.com/hasadna/open-bus-siri-requester, `requester.py`); the key
comes from the Ministry after sending its signed SIRI-SM form to
ptsupport@mot.gov.il, and the Ministry registers the caller's IP, so a
browser cannot call it directly. The Ministry's page is
https://www.gov.il/he/Departments/General/real_time_information_siri (its
2017 FAQ still names the older SOAP endpoint
`http://siri.motrealtime.co.il:8081/Siri/SiriServices`). It covers buses
and trains, not the Jerusalem light rail, and answers with predicted
arrival times per stop, which Hasadna's positions do not carry.

## Live times, end to end

The one place that says what every live number means, where it comes from,
the rules it must keep, and everyone who reads it. Code that changes a live
number changes this first. (Written 2026-10-26; rewritten 2026-11-10, when
the path from the estimate to the screens became one. Before that every
screen made its own look at its own moment and the same ride could show
three times on three screens.)

### One path

```
 Hasadna minute file (SIRI, every vehicle)        relay/relay.js, about a minute old
        │
        ▼
 worker/vehicles.ts  the snapshot, kept 30 s; per ride it remembers since when
        │            its position has been the same and since when it has stood
        │            within 100 m, and the stretch it was last placed on
        ▼
 liveTrips(vehicles, trips)        a vehicle is its trip's by its line and
        │                          scheduled start (tripFor): the one matcher
        │   estimateFor → engine/delays.ts estimateDelay: where it is and how late
        │       train: learned runs, stands and profile; bus: learned hourly
        │       sections × the live road factor; else the timetable's pace
        │       noNews: is the report still one of a running ride? (rule 4)
        │   liveAt: the time at each stop from the vehicle on
        ▼
 TripLive = { from, times[], passed, sure, seen }     ONE answer per trip
        │
        ├──► worker/plan.ts   routes on these times (and hands the page the
        │                     ones of the trips its journeys ride)
        ▼
 state/live.ts        the page's one store, filled by controllers/live.ts:
        │             each screen says which trips it shows (watch), one look
        │             every 30 s asks for all of them; a failed look empties it
        ▼
 trip/now.ts          timeAt(trip, stop): the live time, else the listed one
        │             tripNow(plan): a plan as it stands now
        ▼
 every screen draws that. No screen fetches vehicles, matches one to a trip,
 compares a planned time with a live one, or sets a time against the clock.
```

A plan (a journey from the planner) says which rides and walks, with the
listed times (`schedDepart`, `schedArrive`, each stop's time along a ride).
A trip is that plan as it stands now: `tripNow` gives every leg its time
now, each ride its `live` (`sure`, `passed`; null: nothing known, the
timetable's time), walks packed against the rides, and `missed` when a ride
now leaves before the rider can be there. The cards, the detail, the follow
screen with its state machine and notification, and the re-planning all read
the same `tripNow`; the stop page, the trains between two stations, a ride's
other rides and the line page read `timeAt` for their rows.

The trips of a search stay, their times follow (maintainer, 2026-11-11:
"the live times can update on their own, the trips themselves not"). A
search decides once, as its plan is answered, which ways it lists, in what
order, which departure each card shows, and which ways are filed as in
reach with a hurry or as just left (`state/results.ts frame`, by the times
the plan was routed on at that moment). From then on only the times move:
each listed trip is drawn as it stands now, like everywhere else. A card
whose ride has gone since keeps its place, dimmed, its departure struck
through; it does not jump to another strip or turn into the next departure.
The trips change when the rider asks again: Refresh in the results' head
plans the same question anew (from now if it was from now, in the order the
rider had chosen), as does changing the question; the filters and the order
re-read the same answer.

### The rules (each has its check)

1. One answer per trip and stop, made in the worker, read through
   `state/live.ts at`. The planner routes on the same answer the screens
   draw. (`tests/planlive.test.ts`: the plan's times equal the look's;
   `tests/now.test.ts`: the card, its chip, the stop page and the list of
   rides say the same; `tests/results.test.ts`: the clock and a newer look
   move a card's times but not the card, asking again does.)
2. A stop the vehicle has not passed is never before now: its report is up
   to a minute old, and the store up to half a minute. A bus a few hundred
   metres short of the stop leaves now, and its card stays (Nordau,
   2026-11-08).
3. Still to come, the one rule for every list of departures (`toCome`):
   with live times, the vehicle is not past the stop, so a late one listed
   earlier is in the list and one that left is not; without, the listed time
   has not gone by a minute. Lists from now are asked from an hour back for
   the late ones.
4. No news past due. A report is believed while it shows the ride going on.
   Once a vehicle was due to move on from where it is (when its trip has
   it leave that place), two signs say it is not a report of a running
   ride, for every vehicle at every stop (`delays.ts noNews`); nothing here
   knows a bus from a train or a first stop from a later one.
   - The very same position for two minutes past due. A live GPS jitters
     even while the vehicle stands, so this is a unit repeating itself (a
     parked set, a dead receiver, a train that never ran): no estimate, the
     timetable stands. Half of all train rides do it at some point and one
     bus ride in a thousand (2026-11-06, 2026-11-10). Train 233, 2026-11-09:
     one fix at HaShalom for forty minutes while it ran on to Lod. Train
     970, 2026-11-10: on Rehovot's platform for 88 minutes after its 15:34,
     shown as "leaving now, +83".
   - Staying within 100 m: its times are not certain past 5 minutes
     (`sure` false, shown orange), and past 25 it is more likely than not
     that it is not running and it gets no estimate. Of buses still standing
     5 minutes past due 86% moved on; 10 minutes, 71%; 20 minutes, 52%; 25
     minutes, 48% (360,000 still spans in two days of minute files).
   Tried and dropped, each measured on `measure/trainbacktest.mjs`: placing
   a train by the station its report names next (worse than the timetable
   alone), a trail of each train's fixes to know when it pulled in, handing
   a train's early report back to the trip it is finishing, and moving a
   standing vehicle's times by half of how long it has stood. With them
   gone the trains' typical miss went from 1.4 to 1.3 minutes, a train that
   came on time shown late from 0.6% to 0.2%, real delays of three minutes
   or more shown from 27% to 34%; buses as before.
5. A train is never shown early, its lateness only when sure (`sureLate`:
   the prediction less a margin by how far ahead the station is, whole
   minutes from 2 up), and along a trip the shown times never run backwards
   (`railShown`: an hour-late train stays about an hour late).
6. Lateness beside a time is that time minus the listed time at the same
   stop, worked out where it is shown (`text/live.ts liveBadge`). No screen
   keeps a lateness.
7. In the planner the trips stay in order: within a pattern, no trip later
   at a stop than the trip after it (RAPTOR needs them so).

### When to leave: the result list

Which ways are cards, and which are filed apart, is decided from each
journey as it stood when the plan was answered (`frame`; the times on them
follow from then on, see above). With L its start, B its first ride's
departure and n that moment:

```
        L          B
  ──────┼──────────┼──────────►  time
   n here: on time (a card)
              n here: late for the walk, the ride not gone ("hurry")
                         n here, past B: gone ("just left")
```

- On time, n ≤ L: a card. Its first line of chips says when the first ride
  leaves its stop and the rides after it.
- Hurry, L < n ≤ B: the walk would need to be done faster. Within reach when
  what is left covers it in a hurry: B − n ≥ 0.6·W (W the way to the first
  ride; a fast walk or a jog, 2 m/s against the planned 1.2; an estimate).
  Listed apart, one line that opens, each with how many minutes late.
- Gone: past that, or the ride's vehicle is past the stop, or a change in
  the journey is missed. The "just left" line, for ten minutes (a plan from
  now looks 10 minutes back, so the ride you are on can still be followed).
- By rule 2 a live ride whose vehicle has not passed the stop has B ≥ n: the
  rider standing at the stop gets its card. Once the bus is seen past the
  stop the card is dimmed where it is; the next Refresh files it as gone.
  (`tests/now.test.ts`, `tests/planlive.test.ts`, `tests/results.test.ts`.)

## Crowd reports

Structured, one tap each, never free text (moderation, safety and cost ruled
chat out):

- Kinds: arrived, never came (ghost bus), full, air conditioning broken,
  skipped my stop.
- Gated by location (you report from where you are), anonymous, shown once
  more than one rider agrees, fading after about 15 minutes.
- Waze-style "thanks" counters are the only social element.
- Monthly "skipped trips" statistics per line and operator, as an
  accountability tool.
- Built after routing works: reports need riders, so they come second.

## Costs

Static hosting: free. Worker + D1: free tier at first, in the order of five
dollars a month once the app is popular. No routing servers at any scale.

## The feasibility test (first milestone)

Goal: show that on-device routing for Israel is viable before building
anything else. Pass criterion: a correct plan in under one second on a
phone, with a timetable small enough to download over mobile data.

Done 2026-10-16 (feed of 2026-10-15, service day Monday 2026-10-19), on a
4-core cloud container, desktop part:

| Step | Result |
|---|---|
| Compile one day (`pipeline/compile.py`, Python + numpy) | 35 s; 123,036 trips, 4,462,084 stop times, 30,654 stops, 6,464 patterns, 306,426 footpaths |
| Timetable size | 2.8 MB gzipped, 26 MB decompressed, plus 36 MB of expanded time arrays in memory |
| Load in headless Chromium | page usable 0.3 to 1.2 s after open: unzip 80 to 540 ms, parse 50 to 290 ms |
| Haifa HaMifratz to Be'er Sheva, 08:00, up to 3 transfers | 23 to 38 ms median in Chromium, 38 to 77 ms for the first (cold) run |
| Other queries in Node 22 (warm median) | Jerusalem to Tel Aviv 10 ms, Givatayim to Haifa 19 ms, Eilat to Nahariya 28 ms |
| Correctness | the planned train (trip `1_521131`) matches the raw `stop_times.txt` and its calendar row exactly |

Verdict so far: on-device routing is comfortably viable on desktop, with two
orders of magnitude to spare against the 1 s goal. Phone timing was then
measured in the app itself; the feasibility page and its harness were
removed in the 2026-10-25 cleanup.

Things the test surfaced, for later:

- Footpaths within 250 m could not connect the HaMifratz bus platforms to
  the train station; 400 m fixes that case. Big stations probably want
  explicit station-to-station transfers rather than a bigger radius.
- RAPTOR's Pareto set happily adds a transfer to save one minute (a two-stop
  bus hop at the end of a trip). Ranking or a transfer penalty is needed
  before showing results to people.
- Stop search is a substring match; "אילת" finds streets named Eilat before
  the city. A proper index with city names is needed.
- Rail routes have no line number; the page shows "Train".
- The artifact host serves text but not binaries, so the published test page
  ships the timetable as base64 (3.7 MB instead of 2.8 MB).

Reproduce:

```
curl -o data/gtfs.zip https://gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip
python3 -I pipeline/compile.py data/gtfs.zip --date 20261019
node measure/bench.ts data/timetable.bin.gz "מרכזית המפרץ" "מרכזית באר שבע" 08:00
```

## If on-device routing fails the test

Options, none chosen, cheapest first:

- Hybrid: keep the compact timetable on the device for the common case (a
  region, nearby trips) and send only the hard queries to a small routing
  endpoint.
- The same RAPTOR code on a serverless free tier (Cloudflare Workers), with
  the compact timetable loaded from the CDN, if the timetable fits the
  free-tier limits. Costs nothing until it is popular, no machines to
  maintain.
- A hosted open-source router (OpenTripPlanner, MOTIS) on a small VPS: the
  most capable and the most expensive in money and configuration time, so
  last.
