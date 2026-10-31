# widgets: small shared pieces

Pieces several views use. Unlike a view, a widget has no place of its own
on the screen.

| File | What |
|---|---|
| `Icon.tsx`, `icons.ts` | The icon set (one stroke set, an inline SVG sprite) and its component. |
| `LineChip.tsx` | The one line chip, used everywhere a line is named, on the screen and in the map's bubbles: its colour, its icon or Israel Railways' mark, its number. |
| `RailLogo.tsx` | What goes inside every line chip (`LineName`): Israel Railways' mark before a train's number. The mark is CC BY-SA 3.0, credited in the file. |
| `Timetable.tsx` | A line's times at a stop, by hour, as printed at the stop: the hour, then its minutes with commas. |
| `ShownTime.tsx` | A time as read: the live one with the planned one struck beside it when they differ, else the planned one. |
| `Fold.tsx` | The one button that opens or closes what follows it: a label and a chevron that turns; as a pill, a chip. |
| `FromTo.tsx`, `TimeRange.tsx` | "From → to" and "08:10 → 08:45", right in both directions. |
| `StarButton.tsx` | The star on a panel's bar that saves its trip, stop or line. |
| `LiveMark.tsx` | ⦿ beside a departure whose vehicle is seen, with how late it runs. |
| `Wheel.tsx`, `Logo.tsx` | The time wheel; the app's mark. |
| `Tappable.tsx` | Anything tapped that is not a `<button>` (a row holding other parts): a button to the keyboard and to screen readers, Enter and Space included. |
| `ViewRow.tsx` | Something opened lately or saved (a line, a stop, a station, the trains between two), read the same in the history drawer, the saved page and a search box's list (`viewParts`). |
| `Seg.tsx` | The one segmented choice (when, bicycle, the settings' choices). |
| `toast.ts`, `ripple.ts`, `flip.ts`, `swipeClose.ts` | A short message; touch feedback; layout changes that animate; swipe to close. |
