// The basemap: OpenFreeMap's Liberty, recoloured on the device from one of two palettes, light or dark
// (style.js); the interface theme and the status bar follow the map's ground colour. The labels follow
// the rider's language.
import type { Map as MLMap } from 'maplibre-gl';
import { styledLiberty, PALETTES } from './style.js';
import * as settings from '../state/settings';
import { lang } from '../lib/i18n';
import { state } from './shared';

export const wantDarkMap = (): boolean =>
  settings.mapChoice() === 'dark' ||
  (settings.mapChoice() === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
export const mapTint = (): 'teal' | 'neutral' => (settings.get().mapTint === 'neutral' ? 'neutral' : 'teal');
const styleKey = () => mapTint() + ':' + (wantDarkMap() ? 'dark' : 'light');
const styles: Record<string, unknown> = {},
  styleLoading: Record<string, Promise<void> | null> = {};

/** The interface's colours: light, dark, or the device's (the stylesheet reads data-theme; absent means the device decides). */
export function applyTheme(): void {
  const th = settings.get().theme || 'system';
  if (th === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = th;
  // the installed app's status bar continues the map: the map's ground colour, light or dark, not a coloured app bar
  // Android keeps the status bar as a strip of one colour, so it takes the map's exact ground colour (iPhone draws the map under it)
  const land = (PALETTES as any)[mapTint()][wantDarkMap() ? 'dark' : 'light'].land as string;
  document.documentElement.style.setProperty('--map-land', land);
  const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (meta) meta.content = land;
}
/** Resolves once the style to use is at hand (Liberty in Wayli's palette needs a fetch); maps are made after it. */
export function styleReady(): Promise<void> {
  const key = styleKey();
  if (styles[key]) return Promise.resolve();
  if (!styleLoading[key])
    styleLoading[key] = (styledLiberty(wantDarkMap() ? 'dark' : 'light', mapTint()) as Promise<unknown>)
      .then((st) => {
        styles[key] = st;
      })
      .catch(() => {})
      .finally(() => {
        styleLoading[key] = null;
      });
  return styleLoading[key]!;
}
/** The style to use: Wayli's recoloured Liberty, or a style named in localStorage 'wayli-map-style' for trying others. */
export function mapStyle(): any {
  let o: string | null = null;
  try {
    o = localStorage.getItem('wayli-map-style');
  } catch {
    /* private mode */
  }
  if (o) return `https://tiles.openfreemap.org/styles/${o}`;
  return styles[styleKey()] || 'https://tiles.openfreemap.org/styles/liberty';
}
let rtlSet = false;
export function makeMap(container: string, center: [number, number], zoom: number): MLMap | null {
  if (typeof maplibregl === 'undefined') return null;
  if (!rtlSet) {
    try {
      maplibregl.setRTLTextPlugin('https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.js', true);
    } catch {
      /* already set */
    }
    rtlSet = true;
  }
  state.currentStyle = mapStyle();
  const m = new maplibregl.Map({
    container,
    style: state.currentStyle as any,
    center: [center[1], center[0]],
    zoom,
    attributionControl: { compact: true },
    pitchWithRotate: false,
    maxPitch: 72,
  });
  m.on('error', (e) => console.warn('map', e && e.error && e.error.message));
  return m;
}
/** The basemap's own labels (streets, places, water) in the rider's language: one name per label, not Latin plus Hebrew. */
const NAME_FIELD: Record<string, unknown> = {
  he: ['coalesce', ['get', 'name:he'], ['get', 'name:nonlatin'], ['get', 'name']],
  en: ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']],
  ar: ['coalesce', ['get', 'name:ar'], ['get', 'name:nonlatin'], ['get', 'name']],
};
export function setBasemapLang(m: MLMap): void {
  let layers: any[];
  try {
    layers = (m.getStyle() || {}).layers || [];
  } catch {
    return;
  }
  for (const l of layers) {
    if (l.type !== 'symbol' || !l.layout || !l.layout['text-field'] || /^lm-|^wayli/.test(l.id)) continue;
    const tf = JSON.stringify(l.layout['text-field']);
    if (!tf.includes('"name')) continue; // road shields and refs keep theirs
    try {
      m.setLayoutProperty(l.id, 'text-field', (NAME_FIELD[lang.value] || NAME_FIELD.he) as any);
    } catch {
      /* a layer that is gone */
    }
  }
}
/** The ground's heights when the map is tilted, if the rider turned them on (settings, off by default): AWS's open
 *  Terrain Tiles (no key; elevation as colours, `terrarium`), the map raised by them and lightly shaded. Only while
 *  tilted: seen from straight above heights change nothing, and the tiles cost data. The tiles stop at zoom 12 (the
 *  data underneath is 30 m anyway): a quarter of the tiles to fetch and decode, the same hills. The source and the
 *  shading layer are made as soon as the style is, so the first tilt only turns the heights on. */
const DEM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];
const DEM_ATTR =
  '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Terrain Tiles</a>';
export const TERRAIN_PITCH = 10;
export function applyTerrain(m: MLMap): void {
  const on = !!settings.get().terrain,
    want = on && m.getPitch() >= TERRAIN_PITCH;
  try {
    if (on && !m.getSource('wayli-dem')) {
      // two sources of the same tiles (fetched once): MapLibre shades badly from the source the terrain stands on
      m.addSource('wayli-dem', {
        type: 'raster-dem',
        tiles: DEM_TILES,
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 12,
        attribution: DEM_ATTR,
      });
      m.addSource('wayli-dem-shade', {
        type: 'raster-dem',
        tiles: DEM_TILES,
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 12,
      });
      const under = (m.getStyle().layers || []).find(
        (l: any) => l.type === 'fill-extrusion' || /^(tunnel|road|highway|bridge|building)/.test(l.id),
      )?.id;
      const dark = wantDarkMap();
      m.addLayer(
        {
          id: 'wayli-shade',
          type: 'hillshade',
          source: 'wayli-dem-shade',
          layout: { visibility: 'none' },
          paint: {
            'hillshade-exaggeration': 0.22,
            'hillshade-shadow-color': dark ? '#000000' : '#4d5b55',
            'hillshade-highlight-color': dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.35)',
            'hillshade-accent-color': dark ? '#000000' : '#4d5b55',
            'hillshade-illumination-anchor': 'viewport',
          },
        } as any,
        under,
      );
    }
    const up = !!m.getTerrain();
    if (want && !up) m.setTerrain({ source: 'wayli-dem', exaggeration: 1.5 });
    else if (!want && up) m.setTerrain(null as any);
    if (m.getLayer('wayli-shade')) m.setLayoutProperty('wayli-shade', 'visibility', want ? 'visible' : 'none');
  } catch {
    /* an older MapLibre, or a style still loading: the map stays flat */
  }
}
/** Depth when the map is tilted: a sky and a haze towards the horizon, a low side light that shades the buildings. */
export function applySky(m: MLMap): void {
  const dark = wantDarkMap();
  try {
    m.setSky(
      dark
        ? ({
            'sky-color': '#0a1322',
            'horizon-color': '#243247',
            'fog-color': '#15181c',
            'sky-horizon-blend': 0.7,
            'horizon-fog-blend': 0.6,
            'fog-ground-blend': 0.8,
            'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0],
          } as any)
        : ({
            'sky-color': '#8fc1f2',
            'horizon-color': '#dbe7f3',
            'fog-color': '#f4f5f2',
            'sky-horizon-blend': 0.7,
            'horizon-fog-blend': 0.6,
            'fog-ground-blend': 0.8,
            'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0],
          } as any),
    );
    m.setLight({ anchor: 'viewport', color: '#ffffff', intensity: dark ? 0.35 : 0.55, position: [1.2, 215, 35] });
    if (m.getLayer('building-3d')) {
      m.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.9);
      m.setPaintProperty('building-3d', 'fill-extrusion-vertical-gradient', true);
    }
  } catch {
    /* an older MapLibre without sky: the map stays flat-shaded */
  }
}
