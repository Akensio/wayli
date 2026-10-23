// Which way you face: a cone on the position dot, turned by the phone's compass and the map's rotation, like a
// torch. Chrome on Android gives the compass as absolute orientation; an iPhone gives webkitCompassHeading once
// permission is asked from a tap (the locate button); other Android browsers send an absolute plain orientation event.
// The heading stays on the phone. Smoothed, so it does not jitter. A phone held still may send no readings at all
// (some send only on change), so the cone keeps its last direction for half a minute; it shows only once a reading
// came. `window.wayliDebug.compass` counts the readings, to tell a phone without a compass from a drawing problem.
import type { Map as MLMap } from 'maplibre-gl';

let heading: number | null = null, seenAt = 0, shown: number | null = null, frame = 0, started = false, readings = 0;
const KEEP_MS = 30000;   // a still phone may send nothing: the last direction holds this long

/** A compass reading in degrees clockwise from north, corrected for the screen being turned. */
function onReading(deg: number): void {
  const turn = (screen.orientation && screen.orientation.angle) || 0;
  const h = (deg + turn + 360) % 360;
  // smoothed along the shorter way round
  heading = heading == null ? h : (heading + (((h - heading + 540) % 360) - 180) * 0.25 + 360) % 360;
  seenAt = performance.now();
  readings++;
  try { (window as unknown as { wayliDebug?: Record<string, unknown> }).wayliDebug = { ...((window as unknown as { wayliDebug?: Record<string, unknown> }).wayliDebug || {}), compass: { readings, heading: Math.round(heading) } }; } catch { /* debugging only */ }
}
function absolute(e: DeviceOrientationEvent): void { if (e.alpha != null) onReading(360 - e.alpha); }
/** The plain event, when the browser says it is relative to north (Firefox and others on Android). */
function plain(e: DeviceOrientationEvent): void { if (e.absolute && e.alpha != null && performance.now() - seenAt > 500) onReading(360 - e.alpha); }
function ios(e: DeviceOrientationEvent): void { const c = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading; if (c != null && !Number.isNaN(c)) onReading(c); }

/** Listen to the compass (once). On an iPhone this must run from a tap: it asks for permission there. */
export function startHeading(): void {
  if (started) return;
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (!D) return;
  if (typeof D.requestPermission === 'function') {
    D.requestPermission().then((r) => { if (r === 'granted') { started = true; window.addEventListener('deviceorientation', ios); } }).catch(() => { /* refused */ });
  } else {
    started = true;
    if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', absolute as EventListener);
    window.addEventListener('deviceorientation', plain);
  }
}

/** Keep the cone on the dot turned to the heading, on the map as it is rotated. */
export function attachHeading(m: MLMap): void {
  const draw = () => {
    frame = 0;
    // the map's position dot, and the one the follow screen draws
    const dots = document.querySelectorAll<HTMLElement>('.maplibregl-user-location-dot, .wayli-me');
    const fresh = heading != null && performance.now() - seenAt < KEEP_MS;
    const deg = fresh ? Math.round((heading! - m.getBearing() + 360) % 360) : null;
    const turned = deg !== shown;
    shown = deg;
    for (const dot of dots) {
      let cone = dot.querySelector<HTMLElement>('.wayli-cone');   // its own element: the dot's ::after is its white ring
      if (!cone) { cone = document.createElement('div'); cone.className = 'wayli-cone'; dot.appendChild(cone); }
      else if (!turned && cone.classList.contains('on') === fresh) continue;
      cone.classList.toggle('on', fresh);
      if (deg != null) cone.style.setProperty('--heading', `${deg}deg`);
    }
  };
  const tick = () => { if (!frame) frame = requestAnimationFrame(draw); };
  window.setInterval(tick, 100);   // readings come up to 60 times a second; ten redraws a second are plenty
  m.on('rotate', tick);
}
