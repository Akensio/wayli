// Which way you face: a cone on the position dot, turned by the phone's compass and the map's rotation, like a
// torch. Chrome on Android gives the compass as absolute orientation; an iPhone gives webkitCompassHeading once
// permission is asked from a tap (the locate button, or the first tap on the map: with the position already known the
// locate button may never be tapped, and the cone never came); other Android browsers send an absolute plain
// orientation event.
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
// what arrives, for the line in Settings that tells a phone without a compass from a drawing problem
const seen = { abs: 0, absNull: 0, plainAbs: 0, plainRel: 0, ios: 0 };
function absolute(e: DeviceOrientationEvent): void { if (e.alpha != null) { seen.abs++; onReading(360 - e.alpha); } else seen.absNull++; }
/** The plain event, when the browser says it is relative to north (Firefox and others on Android). */
function plain(e: DeviceOrientationEvent): void {
  if (e.absolute) seen.plainAbs++; else seen.plainRel++;
  if (e.absolute && e.alpha != null && performance.now() - seenAt > 500) onReading(360 - e.alpha);
}
function ios(e: DeviceOrientationEvent): void { const c = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading; if (c != null && !Number.isNaN(c)) { seen.ios++; onReading(c); } }
/** One line on what the compass sends and what the cone does: readings by kind, the heading, the dot and the cone. */
export function compassReport(): string {
  const dot = document.querySelector<HTMLElement>('.maplibregl-user-location-dot, .wayli-me'), cone = dot?.querySelector<HTMLElement>('.wayli-cone');
  const age = seenAt ? Math.round((performance.now() - seenAt) / 1000) : null;
  return [`started ${started ? 'yes' : 'no'}`, `absolute ${'ondeviceorientationabsolute' in window ? seen.abs : 'n/a'}${seen.absNull ? ` (+${seen.absNull} empty)` : ''}`,
    `plain ${seen.plainAbs}/${seen.plainRel} abs/rel`, `ios ${seen.ios}`, `heading ${heading == null ? '-' : Math.round(heading) + '°'}${age != null ? ` ${age}s ago` : ''}`,
    `dot ${dot ? (dot.className.includes('stale') ? 'stale' : 'yes') : 'no'}`, `cone ${cone ? (cone.classList.contains('on') ? `on ${cone.style.getPropertyValue('--heading')}` : 'off') : 'none'}`].join(' · ');
}

let asking = false;
/** Listen to the compass (once). On an iPhone this must run from a tap: it asks for permission there. */
export function startHeading(): void {
  if (started || asking) return;
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (!D) return;
  if (typeof D.requestPermission === 'function') {
    const act = (navigator as unknown as { userActivation?: { isActive: boolean } }).userActivation;
    if (act && !act.isActive) return;   // not from a tap: it would only be refused
    asking = true;
    D.requestPermission().then((r) => { if (r === 'granted') { started = true; window.addEventListener('deviceorientation', ios); } }).catch(() => { /* refused */ }).finally(() => { asking = false; });
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
  // an iPhone asks from a tap: the first on the map does (a refusal asks again on the locate button only)
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent;
  // (touchend: the map's touch handling may leave no click, and Safari takes touchend as a tap that may ask)
  if (D && typeof D.requestPermission === 'function') for (const ev of ['touchend', 'click']) m.getCanvasContainer().addEventListener(ev, () => startHeading(), { once: true });
}
