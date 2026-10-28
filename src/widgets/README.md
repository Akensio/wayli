# widgets: small shared pieces

Pieces several views use. Unlike a view, a widget has no place of its own
on the screen.

| File | What |
|---|---|
| `Icon.tsx`, `icons.ts` | The icon set (one stroke set, an inline SVG sprite) and its component. |
| `LineChip.tsx` | The one line chip, used everywhere a line is named (and `lineChipHtml` for the map's bubbles): its colour, its icon or Israel Railways' mark, its number. |
| `RailLogo.tsx` | What goes inside every line chip (`LineName`, and `lineNameHtml` for the map's HTML): Israel Railways' mark before a train's number. The mark is CC BY-SA 3.0, credited in the file. |
| `Timetable.tsx` | A line's times at a stop, by hour, as printed at the stop: the hour, then its minutes with commas. |
| `Fold.tsx` | The one button that opens or closes what follows it: a label and a chevron that turns; as a pill, a chip. |
| `FromTo.tsx`, `TimeRange.tsx` | "From → to" and "08:10 → 08:45", right in both directions. |
| `StarButton.tsx` | The star on a panel's bar that saves its trip, stop or line. |
| `LiveMark.tsx` | ⦿ beside a departure whose vehicle is seen, with how late it runs. |
| `Wheel.tsx`, `Logo.tsx` | The time wheel; the app's mark. |
| `toast.ts`, `ripple.ts`, `flip.ts`, `swipeClose.ts`, `html.ts` | A short message; touch feedback; layout changes that animate; swipe to close; HTML escaping for map bubbles. |
