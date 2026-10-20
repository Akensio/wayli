// Where the rider is: the last position known, from the map's locate button, the follow mode's watch or a
// request; `getPosition` asks the device only when the last one is older than 20 s.
export type LatLon = { lat: number; lon: number };
export let lastPos: LatLon | null = null;
let lastPosAt = 0;
export const hooks = { moved: () => {} };   // the lines around the rider follow the position

export function notePos(lat: number, lon: number): void {
  lastPos = { lat, lon }; lastPosAt = Date.now();
  try { localStorage.setItem('wayli-geo', '1'); } catch { /* private mode */ }
  hooks.moved();
}
export function getPosition(): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    if (lastPos && Date.now() - lastPosAt < 20000) { resolve(lastPos); return; }
    const fallback = (err: unknown) => { if (lastPos && Date.now() - lastPosAt < 600000) resolve(lastPos); else reject(err); };
    if (!navigator.geolocation) { fallback(new Error('no geolocation')); return; }
    navigator.geolocation.getCurrentPosition((p) => { notePos(p.coords.latitude, p.coords.longitude); resolve(lastPos!); }, fallback, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}
/** Riders who allowed location before get it at start without a prompt. */
export async function warmPosition(): Promise<void> {
  try {
    let known = false; try { known = !!localStorage.getItem('wayli-geo'); } catch { /* private mode */ }
    if (!known && navigator.permissions && navigator.geolocation) { const st = await navigator.permissions.query({ name: 'geolocation' }); known = st.state === 'granted'; }
    if (known) await getPosition();
  } catch { /* no location, no problem */ }
}
