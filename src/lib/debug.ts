// What the app leaves for a developer at the console (window.wayliDebug): the map, the journey shown, the last
// re-planning, the compass's readings. One way to write it; nothing here changes what the rider sees, and nothing
// reads it but a person or a test.
/** Set one entry of `window.wayliDebug`. */
export function debug(key: string, value: unknown): void {
  try {
    window.wayliDebug = { ...(window.wayliDebug || {}), [key]: value };
  } catch {
    /* no window (Node), or it is frozen: debugging only */
  }
}
