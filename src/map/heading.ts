// Which way you face: a cone on the position dot, turned by the phone's compass and the map's rotation, like a
// torch. Chrome on Android gives the compass as absolute orientation; an iPhone gives webkitCompassHeading once
// permission is asked from a tap (the locate button). The heading stays on the phone. Smoothed, so it does not
// jitter; gone when no reading came for two seconds (no compass, or the phone flat and still on some models).
import type { Map as MLMap } from 'maplibre-gl';

let heading: number | null = null, seenAt = 0, shown: number | null = null, frame = 0, started = false;

/** A compass reading in degrees clockwise from north, corrected for the screen being turned. */
function onReading(deg: number): void {
  const turn = (screen.orientation && screen.orientation.angle) || 0;
  const h = (deg + turn + 360) % 360;
  // smoothed along the shorter way round
  heading = heading == null ? h : (heading + (((h - heading + 540) % 360) - 180) * 0.25 + 360) % 360;
  seenAt = performance.now();
}
function absolute(e: DeviceOrientationEvent): void { if (e.alpha != null) onReading(360 - e.alpha); }
function ios(e: DeviceOrientationEvent): void { const c = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading; if (c != null && !Number.isNaN(c)) onReading(c); }

/** Listen to the compass (once). On an iPhone this must run from a tap: it asks for permission there. */
export function startHeading(): void {
  if (started) return;
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (!D) return;
  if (typeof D.requestPermission === 'function') {
    D.requestPermission().then((r) => { if (r === 'granted') { started = true; window.addEventListener('deviceorientation', ios); } }).catch(() => { /* refused */ });
  } else if ('ondeviceorientationabsolute' in window) {
    started = true; window.addEventListener('deviceorientationabsolute', absolute as EventListener);
  }
}

/** Keep the cone on the dot turned to the heading, on the map as it is rotated. */
export function attachHeading(m: MLMap): void {
  const draw = () => {
    frame = 0;
    const dot = document.querySelector<HTMLElement>('.maplibregl-user-location-dot');
    if (!dot) return;
    let cone = dot.querySelector<HTMLElement>('.wayli-cone');   // its own element: the dot's ::after is its white ring
    if (!cone) { cone = document.createElement('div'); cone.className = 'wayli-cone'; dot.appendChild(cone); shown = null; }
    const fresh = heading != null && performance.now() - seenAt < 2000;
    cone.classList.toggle('on', fresh);
    if (!fresh) { shown = null; return; }
    const deg = Math.round((heading! - m.getBearing() + 360) % 360);
    if (deg !== shown) { shown = deg; cone.style.setProperty('--heading', `${deg}deg`); }
  };
  const tick = () => { if (!frame) frame = requestAnimationFrame(draw); };
  window.setInterval(tick, 100);   // readings come up to 60 times a second; ten redraws a second are plenty
  m.on('rotate', tick);
}
