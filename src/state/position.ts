// Where the rider is: the last position known, from the map's locate button, the follow mode's watch or a
// request; `getPosition` asks the device only when the last one is older than 20 s.
export type Position = { lat: number; lon: number }; // (journey/types LatLon is a [lat, lon] pair on a path)
export let lastPos: Position | null = null;
let lastPosAt = 0;
export const hooks = { moved: () => {} }; // the lines around the rider follow the position

/** Whether this phone has given a position before (then it is asked for at start, without a prompt). */
export const knownGeo = (): boolean => {
  try {
    return !!localStorage.getItem('wayli-geo');
  } catch {
    return false;
  }
}; // private mode
export function notePos(lat: number, lon: number): void {
  lastPos = { lat, lon };
  lastPosAt = Date.now();
  try {
    localStorage.setItem('wayli-geo', '1');
  } catch {
    /* private mode */
  }
  hooks.moved();
}
/**
 * Where the rider is now. GPS first; where it fails (inside a station, often), a coarse fix from the network; only then
 * the last position, and only when it is under 2 minutes old: an older one plans from where the rider was, not is.
 */
export function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (lastPos && Date.now() - lastPosAt < 20000) {
      resolve(lastPos);
      return;
    }
    const fallback = (err: unknown) => {
      if (lastPos && Date.now() - lastPosAt < 120000) resolve(lastPos);
      else reject(err);
    };
    if (!navigator.geolocation) {
      fallback(new Error('no geolocation'));
      return;
    }
    const got = (p: GeolocationPosition) => {
      notePos(p.coords.latitude, p.coords.longitude);
      resolve(lastPos!);
    };
    const coarse = () =>
      navigator.geolocation.getCurrentPosition(got, fallback, {
        enableHighAccuracy: false,
        timeout: 6000,
        maximumAge: 30000,
      });
    navigator.geolocation.getCurrentPosition(got, coarse, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
    });
  });
}
/** Riders who allowed location before get it at start without a prompt. */
export async function warmPosition(): Promise<void> {
  try {
    let known = knownGeo();
    if (!known && navigator.permissions && navigator.geolocation) {
      const st = await navigator.permissions.query({ name: 'geolocation' });
      known = st.state === 'granted';
    }
    if (known) await getPosition();
  } catch {
    /* no location, no problem */
  }
}
