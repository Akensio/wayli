# common: used everywhere

What every part of the app may use: the strings, time, and two small helpers for
finding bugs.

| File | What |
|---|---|
| `i18n.ts` | Every string: one entry per key with its Hebrew and English side by side, grouped by the screen that uses it; `t(key, vars)`. A new string goes in the group of its screen, both languages at once. |
| `time.ts` | Service days, seconds on a day, the day labels the rider reads. |
| `debug.ts` | `debug(key, value)`: the one place the app leaves things for the console (`window.wayliDebug`). |
| `unset.ts` | A hook's default: throws `hook <name> was not installed`, so a hook nobody filled is a bug that shows. |
