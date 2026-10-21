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
   relaying real-time data (SIRI credentials cannot ship in a public app),
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
  service). No elevation yet, so Haifa and Jerusalem hills are flat for now.
- **Real walking transfers** (`compile.py --streets`): every stop snaps to
  the nearest walkable node within 250 m (30,569 of 30,654 do), and a
  bounded search from each stop gives the walking time to every stop within
  10 minutes on actual streets: 404k footpaths, replacing the straight-line
  guesses. Inside a station every platform reaches every other (the feed's
  `parent_station`, 220 stations, 4.6k pairs). Every footpath carries a 30 s
  margin; boarding at the stop you arrived at needs 90 s.
- **Profile search** (`raptor.js` `profile()`): range RAPTOR over a departure
  window, so an answer is every journey worth taking in the next hour, not
  one. Origins and destinations are sets (all platforms of a station, or
  every stop reachable from a point) with access and egress times. Ties on
  arrival that save a transfer are kept, which the textbook pruning loses.
  Ranking: Pareto by departure, arrival and transfers, then an extra
  transfer has to save at least 5 minutes. The departure shown is the latest
  that still makes the first vehicle.
- **First and last mile** (`src/streets.js`): Dijkstra on the street graph
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
  in `raptor.js` (`BIKE_RULES`, `bikeAllowed`) from public sources, checked
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
- No elevation: cycling times in Haifa and Jerusalem are optimistic (Bat
  Galim up to the Technion shows as 12 minutes).
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

Layout, one folder per concern:
- `state/`: one small module per feature holding its signals and actions
  (`search` the bar, `results` the plan with its cards as a computed,
  `sheet` the bottom sheet's size, `nav` the stack of panels and screens with
  their history entries, `detail`, `follow`, `stop`, `line`, `trip`,
  `nearby`, `saved`, `chooser`, `settings`, `app`, `data` what is loaded,
  `position`, `clock` a 20-second tick for countdowns). Each exports a
  `hooks` object the app fills in at start with what the feature needs from
  the rest (planning, the worker, panels to open), so a feature never
  imports the app.
- `features/`: the components, drawing from the state modules only
  (`topbar/`, `results/`, `detail/`, `follow/`, `pages/`, `shell/` the sheet
  with every panel, the floating pills, the pick bar; `sheet/` the gestures
  and the pull to refresh). `index.html` is roots only; `main.ts` renders
  the components, attaches the gestures, then imports `boot.ts`.
- `map/`: the one map (`index.ts`: init, the layers, what each panel draws
  through `mapOf`), `basemap` (Liberty recoloured, theme, labels' language),
  `layers` (a journey with its stops and pins, the other ways muted under
  it, fitting), `live` (the vehicles in view, the day's stops, the note),
  `popups` (bubbles for a vehicle, a stop, a tapped place; a line's vehicle
  markers), `picker` (a point on the map), `shared` (the map, its markers).
- `journey/`: types, line colours, the words for journeys, operators'
  English names, sharing. `ui/`: icons, the toast, the ripple, HTML
  escaping. `time.ts`.
- `controllers/`: what happens behind the screens, one module each, and the
  only place that fills in the `hooks`: `loading` (the manifest, a day's
  timetable, the other data files), `planner` (planning, a destination from
  anywhere, the last search, clearing), `detail`, `stop`, `line`, `trip`,
  `nearby` (each page's worker calls and live polls), `follow` (the trip
  being followed: the position watch, the timers, the live vehicle, the
  re-planning, the resume bar), `alerts`, `lang`, `status`, `shell`
  (install, online, the drawer's actions, what closing each panel stops).
  `boot.ts` starts them after the first paint.
- `worker/client.ts`: the UI's end of the data worker (`worker.js`, which
  holds the data and answers every query, so the UI never blocks).
- Pure modules shared with Node: `raptor.js` and `streets.js` (the router
  and street graph), `places.js` (the address book), `live.js` (real-time
  client and delay estimate), `follow.js` (the trip-following state
  machine), `store.js` (settings, history, saved places and the trip in
  progress, all in localStorage), `mapstyle.js`, `sw.template.js` (the
  service worker: the shell and every downloaded data file are cached, so
  the app works offline once loaded; a new build reloads the page once, and
  notification taps reopen the app), `styles.css`, `public/` (manifest,
  icons).

Maps are MapLibre GL (cdnjs) over OpenFreeMap
vector tiles (no key, no cost): the Liberty style, with every colour
replaced on the device from one of two palettes by role and road class
(`mapstyle.js`), so both maps keep all of Liberty's detail (road classes,
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
in one table in `journey/colors.ts` (Egged green and Dan blue read off their sites;
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
location was allowed before), a compass under it that appears once the map
is rotated or tilted and resets both on a tap, and whatever the open panel
is about. Over it,
a floating top bar that is the planner: a menu button and one prompt,
"where do you want to go?". A tap on it opens the bar: the destination
field (tagged "to"; places, addresses and line numbers; its quick menu
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
folds back. The suggestion list while typing hangs below all the rows, so
it never covers the other field. A bottom sheet with three heights (a
strip, about half the screen, nearly full; it is always its full height
and slides by a composited transform, so the slide and the snap run on the
GPU while only the body's height is set per state) carries every panel: the plan
screen (results and recent searches only), nearby, saved, settings,
and the panels for a journey, a stop, a trip's stops, a line, the place
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
handle cycles the sizes; a tap on empty map collapses it.
The map's own buttons (locate, compass) sit in the bottom corner above the
sheet and fade with the map under a fully open sheet. Tilted, the map gets
depth: a sky and a haze towards the horizon (MapLibre's sky, pitch up to
72°), a low side light shading the basemap's extruded buildings; colours
follow the light or dark style.
Picking a point
is a mode of the same map: the sheet and bar give way to a hint and a
Cancel; a tap drops the pin. The strip at the bottom when nothing is open offers plan, home,
work, recent places and nearby stops. Picking a destination in the top bar
plans from the rider's location at once. The panels form a stack, and only
the top one is shown with its map content (a panel registers what it draws;
revealing a panel underneath redraws its content); every panel and screen
change is a history entry, so the phone's back button closes the panel or
returns to the previous screen instead of leaving the app. Closing a panel
edits the stack first and lets history catch up, so programmatic closes and
the back button never disagree; an entry pushed while that catch-up is
pending waits for it (the browser measures a step back from where it was
asked, so a push made meanwhile would be swallowed). The menu opens from a
three-line menu button on a turquoise disc at the start of the search pill
(the app's logo sits at its end; a tap on it starts a search). Pressed, the
disc gives a little and the lines draw together; let go, both spring back
past rest. The pill's buttons are centred with `translate`, not
`transform`, so the press shrink every button has no longer drops them by
half their height. The menu is a drawer sliding in
from the start edge over a dimmed map, a history entry like the panels,
headed by the logo with "no account, everything stays on the phone", then
the screens and the build time. It follows a finger swiping it back to its
edge and closes past a third of its width or on a flick. Settings is a page
of its own over everything, the drawer included (`SettingsPage`, a layer
beside the panels like the drawer, so the sheet and the map stay as they
were): it slides in from the side the reading goes towards and out again,
and back (the arrow or the phone's) returns to the drawer. Leaving search
mode starts the rows' play-out in the same moment the bar closes (an effect
in `state/search.ts`), and a suggestion list starts folding in the same
moment it closes (a signal effect in `SearchField`); set after a render,
both vanished for a frame first. The "to" tag on the search pill shows only once the bar is open
in two rows. The basemap is restyled in place when the theme changes (a
full style reload, after which the app's layers are added again).

Icons are one hand-drawn stroke set on a 24-unit grid (`ICONS` in
`ui/icons.ts`): injected once as an inline SVG sprite and used as `<use>`
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
The last search is kept with its results for an hour and restored as it
was (its own origin and time, the strip then holding every ride that has
left but not arrived) on reopening the app or on tapping its destination
in the recents, since the rider's "my location" may have moved with the
vehicle since; "plan again from now" is one tap away;
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
like an alarm clock) over the published service days; Arrive by searches
a two-hour window ending at the target, latest departure first; only the
journeys arriving in time are ranked against each other; every plan also runs a
train-only search, and journeys with a train and without one are ranked
apart, so a slightly faster bus never hides a train; the day wheel says
"tonight" until 03:00 since a service day runs past midnight, and changing
the day keeps the chosen time; bicycle choice; the longest walk to a stop
is a setting (a stepper, 3 to 45 minutes; the number can be typed). Results come back grouped: journeys that
board and alight at the same stops are one card with its departure times
("also at 08:17, 08:32") and the alternative lines of a leg shown together
("5 / 18"); "leave in 4 min" counts down (green when the first ride's vehicle has a
fresh live report, orange when its report is older than four minutes,
plain with the schedule alone) and departed options grey out;
earlier/later buttons shift the window; no results offers an hour later or
a longer walk. The last search and its results come back when the app is
reopened within six hours, with one tap to plan it again from now; the
eight most recent searches sit under the form and re-plan from now.

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
clock. `follow.js` advances through the legs from the rider's position
(within 60 m of a stop, nearest stop along the ride with hysteresis, never
backwards) and falls back to the timetable clock when there is no position.
It raises "one more stop" when the alighting stop is next or within 350 m,
"get off here" at the stop, and "arrived" at the end: vibration, a short
beep and a notification (through the service worker, so it shows with the
screen off), each switchable in settings. The screen shows the current
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
`follow.js`.

Search and addresses: `pipeline/places.py` compiles an offline address book
from OpenStreetMap (streets with their city from the nearest transit stop,
house numbers, cities from the feed, and named places: landmarks such as
hospitals, universities, malls, parks and stations, and everyday places such
as restaurants, cafés, bars, hotels, shops, pharmacies, banks, schools,
synagogues and offices): about 45k streets, 212k house numbers, 49k places
(16k landmarks, 33k everyday), 2.9 MB gzipped. Landmarks rank above streets
at an equal match, everyday places level with them, so an exact name wins
without burying street searches in shops. `src/places.js` parses free text ("הורדים 4,
גבעתיים", "קניון עזריאלי", "תל אביב"), understands common city aliases, and
ranks stops, addresses, streets, places and cities together, nearer ones
first when the user's location is known (distance breaks ties even among
places close by). A quote mark inside a word belongs to the word, so הל"ה,
צה"ל, ג'וליס and כפר חב"ד match whether typed with the mark, without it,
or with the keyboard's ״ or ''; the same rule normalises stop names. A stop
matches whether its Hebrew or its English name is typed (both are indexed),
and every name the worker hands out (results, stop lists, headsigns, the
map's station labels) is in the app's language, with Hebrew where the feed
has no translation. The address book carries OpenStreetMap's English name
beside the Hebrew (85% of streets, half the notable places; about 300 KB
gzipped) and the feed's for cities; a word typed in Latin letters matches the English
name, or, failing that, the consonant skeleton of the Hebrew one (vowels
dropped, letters that sound alike merged, doubled letters collapsed, so
"Havradim", "HaVradim" and "Ha-Vradim" all find הורדים, and "Petach Tikvah"
finds פתח תקווה), scored a little below a spelled-out English name. Results
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

Lines: the top bar finds a line by number (exact first, then prefix; "רכבת"
lists the trains), one row per direction with its agency and today's trip
count, listed above the places for short queries. A line page shows the
direction's course on the map with every stop as a dot and the line's
vehicles reporting now, each with its delay (tap one for its trip's stops), the other
directions as buttons, today's trip count and first and last departure,
and the stop list (tap a stop for its page). Line chips everywhere (stop
cards, a stop's lines, a ride in a journey, a vehicle bubble) open the line
page.

Nearby and stops: stops around the device with the lines serving them and
the walk in minutes; a stop shows its next departures with live times
(below), refreshed every 45 seconds while open; a departure opens the
trip's full stop list with where the vehicle is now; the map eases to the
stop with a pin; "to here" plans from the rider's location at once and
"from here" opens the form; stars save stops. Saved: home and work (one
tap plans a trip there from the device's location), other saved places,
saved trips, saved stops. Settings, as grouped lists (general, planning,
live times and alerts, the app, about) with an icon per row: language and
map look as pill segments, longest walk as a stepper, live times (with a
plain statement of what is sent), alerts and sound as switches, then a test
alert, add to home screen and clear history as rows, and the about text.
Map look and menus look are each light, dark or the device's: the map
through the light or the recoloured dark Liberty, the interface through a
data-theme attribute the stylesheet reads (absent means the device decides).

Time is Israel time whatever the phone's zone (`Intl` with
`Asia/Jerusalem`), and "now" is expressed in seconds on the selected
service day, so countdowns, live matching and following all agree past
midnight.

Data: `data/manifest.json` lists one timetable file per service day
(`timetable-YYYYMMDD.bin.gz`, about 3 MB; the app downloads only the day
being planned), the street graph (10.7 MB, loaded after the first answer;
until it is in, points use straight-line access with a detour factor, and
walks drawn straight then follow the streets once it arrives; a download
that drops is fetched again after 5, 20 and 60 s and when the phone comes
back online, the same for the address book and the courses), the
address book, and the courses (`shapes.bin.gz`, 3.6 MB: the feed's 6,749
shapes simplified to 6 m, 1.26M points as int32 1e-5 degrees, loaded last).
Each day's file says which shape every pattern runs on and where each of
its stops falls along it (segment and fraction, computed by projecting the
stop on the simplified course, never backwards; a pattern whose trips name
no shape borrows a sibling's when its stops lie on it), so a ride between
two stops is drawn along the road; until the courses are loaded, rides are
drawn stop to stop. Trains have no shapes in the feed at all (every rail
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
next 7 days, and deploys `site/` to GitHub Pages, turning Pages on by itself the first
time (`actions/configure-pages` with `enablement: true`). No server, no cost.

The results on the map: the first three ways are drawn together, the
highlighted one in its mode colours with pins and stops, the others grey with
a white casing, each with a pill at the middle of its longest ride saying its
minutes (the highlighted one in the accent colour). A tap on a grey route or
its pill highlights that way; each card has a map button that shows a way
(and highlights it), highlights a shown one, or hides the highlighted one.
Collapsed, the sheet is a handle alone, or, with results, a handle and one
line about the highlighted way (times, minutes, transfers, the countdown)
that opens the list on a tap. The chip strip that used to sit there (plan,
home, work, recents, nearby) is gone: the search pill and its list cover it,
and the drawer keeps "stops near me". The top bar is pills: the search
field, the summary box, the chips and the Go button.

Not yet: crowd reports, elevation, Arabic (the data format carries it, the
interface does not), line pages beyond a trip's stop list, the bike-on-board
rules for light rail, fares.

## Compact timetable (format 2, built by `pipeline/compile.py`)

One file per service day, gzipped: a u32 header length, a JSON header, then
little-endian typed arrays the app views in place:

- header: feed dates, counts, the section table, routes (line number, long
  name, operator, type) and stops (id, name, code).
- route patterns RAPTOR-style: `patStopsOff`/`patStops` (stop sequence per
  pattern), `patTripsOff` (trip range per pattern), `tripTimesOff`.
  In the Israel feed every `route_id` is one direction of one line, so a
  pattern is a route; trips that would overtake are split into sub-patterns.
- times: per trip an absolute `tripStart`, then per stop the departure delta
  from the previous stop (u16) and the dwell (u16). The app expands these to
  absolute arrival/departure `Int32Array`s on load (about 80 ms). Dwell is
  all zeros in this feed and deltas repeat across trips, which is why gzip
  gets 26 MB down to 2.8 MB.
- `stopPats`: for each stop, the (pattern, position) pairs it appears in.
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

- Source: Israel Ministry of Transport GTFS, published daily at
  gtfs.mot.gov.il (`israel-public-transportation.zip`). Data terms still to
  be checked.
- Nightly GitHub Action: fetch, validate, compile, publish static files plus
  a manifest (feed date, format version, checksums). The app reads the
  manifest and downloads only when something changed. Every push to `main`
  deploys too; the street and rail graphs are cached for a week and the
  seven compiled days are cached by feed, graphs and compiler source, so
  an app-only push skips the six-minute compile and is live in about two
  minutes.
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
- Where it shows: badge per ride leg in a journey around now (and the
  vehicle on the map), live times for a stop's next departures (one area
  query, then by line for what it missed), the vehicle's place in a trip's
  stop list, the current vehicle while following a trip (every 30 s), and
  the map itself: every vehicle reporting in view, coloured by mode with
  its line number, refreshed every 20 s and on every pan (not while the
  sheet covers the map or the app is in the background), with the stops
  when zoomed in. The layer follows the view: with nothing searched and
  the map around the rider, only the lines serving stops within 500 m of
  them (what can be taken from there; elsewhere on the map, everything in
  view); while results are shown, only the lines of those journeys (the
  note says which); hidden while a journey, a line or a followed trip
  draws its own vehicles (the rider's own carries its minutes late; the
  others show it in their bubble). The note under the map is one sentence
  per case: "12 vehicles of the lines searched · data as of 08:05 (18 min
  ago, the source is behind)", or "No vehicles of the lines searched
  reporting in this area right now". A vehicle whose last report is
  more than five minutes behind the newest report of its own set (the
  vehicles in the area in view, or the line's) is not drawn at all (the
  feed lags as a whole and unevenly by area; a single stale vehicle is
  noise, but a whole area twenty minutes behind the rest of the country is
  still the best picture of that area). When
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
  buttons to its trip's stops and its line page; a tap on any stop dot opens
  a bubble with the stop's lines and departures / from here / to here. No
  tap on a map jumps to a page by itself.
- Planning with live data: a plan from now (the current service day,
  within 20 minutes of the clock) first fetches the vehicles within 12 km of
  the origin and every train in the country (Israel Railways is SIRI
  operator 2, one query), hands them to the worker, which matches each to
  its trip, estimates its delay and shifts that trip's times from where the
  vehicle is onwards before routing. A trip never moves past the next trip
  of its pattern or before the previous one, so the router's sorted-trip
  searches still hold; a vehicle so late that the next one catches up shows
  as departing with it. Everything is undone after the plan. So a train
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
- Privacy: while on, the phone sends Hasadna the line numbers and the area
  it looks at, and Hasadna sees its IP, as any website does. The settings
  screen says exactly this, and one switch turns live times off.

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
orders of magnitude to spare against the 1 s goal. Phone timing is pending:
`app/feasibility.html` is published as a private Claude artifact for that.

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
node app/bench.mjs data/timetable.bin.gz "מרכזית המפרץ" "מרכזית באר שבע" 08:00
node app/browser_bench.mjs "מרכזית המפרץ" "מרכזית באר שבע" 08:00   # needs Playwright + Chromium
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
