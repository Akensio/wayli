// Which way you face: a cone on the position dot, turned by the phone's compass and the map's rotation, like a
// torch. Every kind of reading is listened to from the start, whatever the phone: Chrome on Android sends absolute
// orientation, other Android browsers an absolute plain orientation event, an iPhone webkitCompassHeading. Where the
// browser has a permission to ask (an iPhone, and Chrome on a Pixel too: taking that for "an iPhone" left the Pixel
// listening for the iPhone's readings only), it is asked from a tap: the locate button's or the first on the map.
// The heading stays on the phone. Smoothed, so it does not jitter. A phone held still may send no readings at all
// (some send only on change), so the cone keeps its last direction for half a minute; it shows only once a reading
// came. `window.wayliDebug.compass` counts the readings, to tell a phone without a compass from a drawing problem.
import type { Map as MLMap } from 'maplibre-gl';

let heading: number | null = null,
  seenAt = 0,
  shown: number | null = null,
  frame = 0,
  listening = false,
  readings = 0;
let permission: 'none' | 'asking' | 'granted' | 'denied' | 'failed' = 'none'; // 'none': the browser has none to ask
const KEEP_MS = 30000; // a still phone may send nothing: the last direction holds this long
const GLIDE_MS = 90; // how quickly the cone catches up with the heading (time constant)
let glide = (): void => {}; // a new reading: the cone moves (set once the map is there)

/** A compass reading in degrees clockwise from north, corrected for the screen being turned. */
function onReading(deg: number): void {
  const turn = (screen.orientation && screen.orientation.angle) || 0;
  const h = (deg + turn + 360) % 360;
  // smoothed along the shorter way round
  heading = heading == null ? h : (heading + (((h - heading + 540) % 360) - 180) * 0.25 + 360) % 360;
  seenAt = performance.now();
  readings++;
  glide();
  try {
    (window as unknown as { wayliDebug?: Record<string, unknown> }).wayliDebug = {
      ...((window as unknown as { wayliDebug?: Record<string, unknown> }).wayliDebug || {}),
      compass: { readings, heading: Math.round(heading) },
    };
  } catch {
    /* debugging only */
  }
}
// what arrives, for the line in Settings that tells a phone without a compass from a drawing problem
const seen = { abs: 0, absNull: 0, plainAbs: 0, plainRel: 0, ios: 0 };
function absolute(e: DeviceOrientationEvent): void {
  if (e.alpha != null) {
    seen.abs++;
    onReading(360 - e.alpha);
  } else seen.absNull++;
}
/** The plain event, when the browser says it is relative to north (Firefox and others on Android). */
function plain(e: DeviceOrientationEvent): void {
  const c = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading; // an iPhone's
  if (c != null && !Number.isNaN(c)) {
    seen.ios++;
    onReading(c);
    return;
  }
  if (e.absolute) seen.plainAbs++;
  else seen.plainRel++;
  if (e.absolute && e.alpha != null && performance.now() - seenAt > 500) onReading(360 - e.alpha);
}
/** One line on what the compass sends and what the cone does: readings by kind, the heading, the dot and the cone. */
export function compassReport(): string {
  const dot = document.querySelector<HTMLElement>('.maplibregl-user-location-dot, .wayli-me'),
    cone = dot?.querySelector<HTMLElement>('.wayli-cone');
  const age = seenAt ? Math.round((performance.now() - seenAt) / 1000) : null;
  return [
    `listening ${listening ? 'yes' : 'no'}`,
    `permission ${permission}`,
    `absolute ${'ondeviceorientationabsolute' in window ? seen.abs : 'n/a'}${seen.absNull ? ` (+${seen.absNull} empty)` : ''}`,
    `plain ${seen.plainAbs}/${seen.plainRel} abs/rel`,
    `ios ${seen.ios}`,
    `heading ${heading == null ? '-' : Math.round(heading) + '°'}${age != null ? ` ${age}s ago` : ''}`,
    `dot ${dot ? (dot.className.includes('stale') ? 'stale' : 'yes') : 'no'}`,
    `cone ${cone ? (cone.classList.contains('on') ? `on ${cone.style.getPropertyValue('--heading')}` : 'off') : 'none'}`,
  ].join(' · ');
}

/** Listen to the compass, and ask for it where the browser has a permission for it (only from a tap; called again
 *  from the taps that may ask). */
export function startHeading(): void {
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } })
    .DeviceOrientationEvent;
  if (!D) return;
  if (!listening) {
    listening = true;
    if ('ondeviceorientationabsolute' in window)
      window.addEventListener('deviceorientationabsolute', absolute as EventListener);
    window.addEventListener('deviceorientation', plain);
  }
  if (typeof D.requestPermission !== 'function' || permission === 'granted' || permission === 'asking') return;
  const act = (navigator as unknown as { userActivation?: { isActive: boolean } }).userActivation;
  if (act && !act.isActive) return; // not from a tap: it would only be refused
  permission = 'asking';
  D.requestPermission()
    .then((r) => {
      permission = r === 'granted' ? 'granted' : 'denied';
    })
    .catch(() => {
      permission = 'failed';
    });
}

/** Keep the cone on the dot turned to the heading, on the map as it is rotated. It glides: every frame it turns part
 *  of the way to the heading (the shorter way round), so readings arriving in steps and the map turning by jumps both
 *  come out as one smooth motion; frames stop once it has caught up and nothing new came. */
export function attachHeading(m: MLMap): void {
  let last = 0;
  const step = () => {
    frame = 0;
    const now = performance.now(); // (not the frame's own time stamp: it can be older than the readings')
    // the map's position dot, and the one the follow screen draws
    const dots = document.querySelectorAll<HTMLElement>('.maplibregl-user-location-dot, .wayli-me');
    const fresh = heading != null && now - seenAt < KEEP_MS;
    let gap = 0;
    if (!fresh) shown = null;
    else {
      const target = (heading! - m.getBearing() + 360) % 360;
      if (shown == null) shown = target;
      else {
        gap = ((target - shown + 540) % 360) - 180;
        shown = (shown + gap * (1 - Math.exp(-Math.max(0, Math.min(now - last, 100)) / GLIDE_MS)) + 360) % 360;
      }
    }
    last = now;
    const pitch = `${m.getPitch().toFixed(1)}deg`; // the beam lies on the ground: tilted with the map
    for (const dot of dots) {
      let cone = dot.querySelector<HTMLElement>('.wayli-cone'); // its own element: the dot's ::after is its white ring
      if (!cone) {
        cone = document.createElement('div');
        cone.className = 'wayli-cone';
        dot.appendChild(cone);
      }
      if (cone.classList.contains('on') !== fresh) cone.classList.toggle('on', fresh);
      if (shown != null) cone.style.setProperty('--heading', `${shown.toFixed(1)}deg`);
      if (cone.style.getPropertyValue('--pitch') !== pitch) cone.style.setProperty('--pitch', pitch);
    }
    if (fresh && (Math.abs(gap) > 0.2 || now - seenAt < 300)) frame = requestAnimationFrame(step);
  };
  glide = () => {
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
  };
  window.setInterval(glide, 500); // the dot may be drawn anew, or the readings stop: looked at now and then
  m.on('rotate', glide);
  m.on('pitch', glide);
  // where the browser asks (an iPhone, Chrome on a Pixel), it asks from a tap: the first on the map does (a refusal asks
  // again on the locate button only)
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent;
  // (touchend: the map's touch handling may leave no click, and Safari takes touchend as a tap that may ask)
  if (D && typeof D.requestPermission === 'function')
    for (const ev of ['touchend', 'click'])
      m.getCanvasContainer().addEventListener(ev, () => startHeading(), { once: true });
}
