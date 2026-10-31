// The map's two buttons of its own, through MapLibre's public API only (no private members to break on an upgrade):
//
// Locate. It only ever shows where you are (maintainer, 2026-10-22): a tap starts locating, and once on, a tap brings the
// map back to you instead of turning location off (that is the phone's permission, not a map button). A tap brings you
// to the middle of the part of the screen the map shows, at the zoom the map has; a second tap, with the map on you
// already, sets the neighbourhood's zoom (2026-10-25). While it follows you, the map moves with you, its zoom left
// alone; a drag lets go. Your dot and the circle of the fix's accuracy are drawn here, the compass cone on the dot by
// map/heading.ts. A failed fix leaves the dot greyed (stale) and the button red; a tap tries again.
//
// Compass. Shows the map's rotation and tilt; a tap sets north up and flat. Hidden while there is nothing to reset.
import type { Map as MLMap, IControl, Marker } from 'maplibre-gl';
import { t } from '../lib/i18n';
import { notePos } from '../state/position';
import { centreOffset } from './view';
import { cameraPadding } from './shared';
import { registerDot, startHeading } from './heading';

const LOCATE_ZOOM = 15;
const ON_ME_PX = 40; // the map counts as on you when you are this close to the middle of its visible part

type Fix = { lat: number; lon: number; acc: number };
type LocState = 'off' | 'waiting' | 'on' | 'error';

/** MapLibre's classes are kept, so its styles (and ours over them, styles/map.css) still apply. */
export class LocateControl implements IControl {
  private m: MLMap | null = null;
  private box = document.createElement('div');
  private btn = document.createElement('button');
  private watch: number | null = null;
  private last: Fix | null = null;
  private following = false;
  private dot: Marker | null = null;
  private ring: Marker | null = null;
  private state: LocState = 'off';

  onAdd(m: MLMap): HTMLElement {
    this.m = m;
    this.box.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this.btn.type = 'button';
    this.btn.className = 'maplibregl-ctrl-geolocate';
    this.btn.title = this.btn.ariaLabel = t('myLoc');
    const icon = document.createElement('span');
    icon.className = 'maplibregl-ctrl-icon';
    icon.ariaHidden = 'true';
    this.btn.appendChild(icon);
    this.btn.addEventListener('click', () => this.tap());
    this.box.appendChild(this.btn);
    // a drag (any move the rider makes, not ours) lets go of following
    m.on('movestart', (e: { originalEvent?: unknown; wayliLocate?: boolean }) => {
      if (e.originalEvent && !e.wayliLocate) this.following = false;
      this.paint();
    });
    m.on('zoom', () => this.sizeRing());
    return this.box;
  }
  onRemove(): void {
    this.stop();
    this.box.remove();
    this.m = null;
  }
  /** Start locating without a tap (the app opened with location allowed before): it follows, like a first tap. */
  trigger(): void {
    if (this.state === 'off' || this.state === 'error') {
      this.following = true;
      this.start();
    }
  }

  private tap(): void {
    startHeading(); // the compass for the cone on the dot; an iPhone asks for it here, on the tap
    if (this.state === 'waiting') return;
    this.following = true;
    if (this.state === 'off' || this.state === 'error' || !this.last) {
      this.start();
      return;
    }
    this.toMe(this.last, this.onMe(this.last) ? LOCATE_ZOOM : undefined);
  }
  private start(): void {
    if (!navigator.geolocation) {
      this.set('error');
      return;
    }
    this.stop();
    this.set('waiting');
    this.watch = navigator.geolocation.watchPosition(
      (p) => this.fix({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      () => this.set('error'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }
  private stop(): void {
    if (this.watch != null) navigator.geolocation.clearWatch(this.watch);
    this.watch = null;
  }
  private fix(f: Fix): void {
    this.last = f;
    notePos(f.lat, f.lon);
    this.drawDot(f);
    this.set('on');
    if (this.following) this.toMe(f); // the zoom the map has: it used to jump on the first fix (2026-10-25)
  }
  /** The map to the rider, into the middle of what the screen shows of it; `zoom` changes the zoom too. */
  private toMe(f: Fix, zoom?: number): void {
    const m = this.m;
    if (!m) return;
    m.easeTo(
      {
        center: [f.lon, f.lat],
        offset: centreOffset(cameraPadding()),
        ...(zoom != null ? { zoom } : {}),
        duration: 500,
      },
      { wayliLocate: true }, // our own move: following goes on
    );
  }
  /** Whether the rider is in the middle of the map's visible part already. */
  private onMe(f: Fix): boolean {
    const m = this.m!;
    const [ox, oy] = centreOffset(cameraPadding()),
      c = m.getContainer(),
      p = m.project([f.lon, f.lat]);
    return Math.hypot(p.x - (c.clientWidth / 2 + ox), p.y - (c.clientHeight / 2 + oy)) < ON_ME_PX;
  }
  private drawDot(f: Fix): void {
    const m = this.m;
    if (!m) return;
    if (!this.dot) {
      const el = document.createElement('div');
      el.className = 'maplibregl-user-location-dot';
      registerDot(el);
      this.dot = new maplibregl.Marker({ element: el }).setLngLat([f.lon, f.lat]).addTo(m);
      const ring = document.createElement('div');
      ring.className = 'maplibregl-user-location-accuracy-circle';
      this.ring = new maplibregl.Marker({ element: ring, pitchAlignment: 'map' }).setLngLat([f.lon, f.lat]).addTo(m);
    } else {
      this.dot.setLngLat([f.lon, f.lat]);
      this.ring!.setLngLat([f.lon, f.lat]);
    }
    this.sizeRing();
  }
  /** The accuracy circle: the fix's radius in metres at the map's scale there. */
  private sizeRing(): void {
    const m = this.m,
      f = this.last;
    if (!m || !f || !this.ring) return;
    const metresPerPx = (40075016.686 * Math.cos((f.lat * Math.PI) / 180)) / (512 * 2 ** m.getZoom());
    const d = Math.ceil((2 * f.acc) / metresPerPx);
    const el = this.ring.getElement();
    el.style.width = el.style.height = `${d}px`;
  }
  private set(s: LocState): void {
    this.state = s;
    this.paint();
  }
  private paint(): void {
    const c = this.btn.classList;
    c.toggle('maplibregl-ctrl-geolocate-waiting', this.state === 'waiting');
    c.toggle('maplibregl-ctrl-geolocate-active', this.state === 'on' && this.following);
    c.toggle('maplibregl-ctrl-geolocate-background', this.state === 'on' && !this.following);
    c.toggle('maplibregl-ctrl-geolocate-active-error', this.state === 'error');
    this.dot?.getElement().classList.toggle('maplibregl-user-location-dot-stale', this.state === 'error');
  }
}

/** The compass: its needle turned by the map's rotation and tilted with it; a tap resets both. */
export class CompassControl implements IControl {
  private box = document.createElement('div');
  private needle = document.createElement('span');
  private m: MLMap | null = null;
  private readonly update = () => {
    const m = this.m;
    if (!m) return;
    this.needle.style.transform = `rotateX(${m.getPitch()}deg) rotateZ(${-m.getBearing()}deg)`;
    this.box.classList.toggle('wayli-hidden', !(Math.abs(m.getBearing()) > 0.5 || m.getPitch() > 0.5));
  };
  onAdd(m: MLMap): HTMLElement {
    this.m = m;
    this.box.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'maplibregl-ctrl-compass';
    btn.title = btn.ariaLabel = t('compassLine');
    this.needle.className = 'maplibregl-ctrl-icon';
    this.needle.ariaHidden = 'true';
    btn.appendChild(this.needle);
    btn.addEventListener('click', () => m.resetNorthPitch());
    this.box.appendChild(btn);
    for (const ev of ['rotate', 'pitch', 'load'] as const) m.on(ev, this.update);
    this.update();
    return this.box;
  }
  onRemove(): void {
    this.box.remove();
    this.m = null;
  }
}
