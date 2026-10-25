# lib: used everywhere

| File | What |
|---|---|
| `i18n.ts` | Every string: one entry per key with its Hebrew and English side by side, grouped by the screen that uses it; `t(key, vars)`. A new string goes in the group of its screen, both languages at once. |
| `time.ts` | Service days, seconds on a day, the day labels the rider reads. |
| `store.js` | The on-device store (localStorage): settings, history, saved places, the trip in progress. Nothing in it leaves the phone. |
