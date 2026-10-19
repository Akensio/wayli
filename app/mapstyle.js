// The basemap, light and dark: OpenFreeMap's Liberty style with every colour replaced by one of two palettes,
// at runtime, so the map keeps all of Liberty's detail (road classes, 3D buildings, places) while the roads
// recede into a quiet, near-neutral ground and the transit lines Wayli draws on top carry the colour.
// Light: cool off-white land, white streets with soft casings, motorways, water and parks tinted with the
// app's turquoise instead of Liberty's yellow. Dark: near-black land with the same turquoise cast, roads as
// lighter greys in a clear hierarchy, deep teal water, light text with a dark halo.

const LIBERTY = 'https://tiles.openfreemap.org/styles/liberty';
const cache = {};

export const PALETTES = {
  // the app's turquoise (#12998b) tints what carries colour: motorways, water, parks, casings and labels; the rest stays neutral
  light: {
    land: '#f2f4f3', landuse: '#ebeeed', park: '#d6e9e1', wood: '#cbe2d8', sand: '#ebe9d9', ice: '#edf1f1', water: '#b9dfe0', waterLine: '#a5d3d4',
    building: '#e5e9e8', buildingOutline: '#d6dcda', aeroway: '#e6e9e8',
    motorway: '#c6e6e0', motorwayCasing: '#8fcbc1', primary: '#ffffff', primaryCasing: '#c9d6d3', secondary: '#ffffff', secondaryCasing: '#d5dedc',
    minor: '#ffffff', minorCasing: '#dde4e2', service: '#f9fbfa', serviceCasing: '#e2e8e6', path: '#dfe6e4', pathCasing: '#d6dedb', rail: '#b9c6c3',
    tunnel: '#edf0ef', tunnelCasing: '#dfe5e3', boundary: '#c3cdca',
    text: '#44534f', place: '#243330', halo: '#ffffff', icon: '#4f716b', iconHalo: '#ffffff',
  },
  dark: {
    land: '#171c1b', landuse: '#1a201f', park: '#182824', wood: '#16241f', sand: '#20231f', ice: '#1b2222', water: '#0d2628', waterLine: '#12393c',
    building: '#202726', buildingOutline: '#2a3331', aeroway: '#1d2423',
    motorway: '#4a6d67', motorwayCasing: '#2a3e3b', primary: '#404d4b', primaryCasing: '#283231', secondary: '#374240', secondaryCasing: '#262f2e',
    minor: '#2e3836', minorCasing: '#22292a', service: '#283130', serviceCasing: '#1f2626', path: '#303a38', pathCasing: '#262e2d', rail: '#48544f',
    tunnel: '#1f2625', tunnelCasing: '#1b2120', boundary: '#374442',
    text: '#b4c4c0', place: '#dde9e6', halo: '#141918', icon: '#8fb3ac', iconHalo: '#141918',
  },
};

/** The palette key a layer's colour property maps to, from the layer's id and the property. */
function roleOf(layer, prop) {
  const id = layer.id || '', type = layer.type;
  if (prop === 'text-color') return /^place|^country|^state|^continent/.test(id) ? 'place' : 'text';
  if (prop === 'text-halo-color' || prop === 'icon-halo-color') return 'halo';
  if (prop === 'icon-color' || prop === 'circle-color') return 'icon';
  if (prop === 'circle-stroke-color') return 'iconHalo';
  if (type === 'background') return 'land';
  if (/water/.test(id)) return type === 'line' ? 'waterLine' : 'water';
  if (/building/.test(id)) return prop === 'fill-outline-color' ? 'buildingOutline' : 'building';
  if (/park|wood|grass|pitch|track$|cemetery|school/.test(id) && type !== 'line') return /wood/.test(id) ? 'wood' : 'park';
  if (/park_outline/.test(id)) return 'park';
  if (/sand/.test(id)) return 'sand';
  if (/ice/.test(id)) return 'ice';
  if (/aeroway/.test(id)) return 'aeroway';
  if (/landuse|landcover/.test(id)) return 'landuse';
  if (/boundary/.test(id)) return 'boundary';
  if (layer['source-layer'] === 'transportation' || /^(road|tunnel|bridge)_/.test(id)) {
    const casing = /casing/.test(id);
    if (/rail/.test(id)) return 'rail';
    if (/^tunnel_/.test(id)) return casing ? 'tunnelCasing' : 'tunnel';
    const cls = /motorway/.test(id) ? 'motorway' : /trunk|primary/.test(id) ? 'primary' : /secondary|tertiary|_link/.test(id) ? 'secondary'
      : /minor|street/.test(id) ? 'minor' : /service|track/.test(id) ? 'service' : /path|pedestrian/.test(id) ? 'path' : 'minor';
    return casing ? cls + 'Casing' : cls;
  }
  return type === 'line' ? 'minor' : 'landuse';
}

const NAMED = { white: '#ffffff', black: '#000000', transparent: 'rgba(0,0,0,0)' };
/** The alpha of a style colour (1 when opaque or unknown). */
function alphaOf(s) {
  const v = (NAMED[String(s).trim().toLowerCase()] || String(s)).trim();
  let m = /^#([0-9a-f]{8})$/i.exec(v); if (m) return parseInt(m[1].slice(6), 16) / 255;
  m = /^#([0-9a-f]{4})$/i.exec(v); if (m) return parseInt(m[1][3] + m[1][3], 16) / 255;
  m = /^(?:rgba|hsla)\(([^)]+)\)$/i.exec(v); if (m) { const p = m[1].split(','); return p.length > 3 ? parseFloat(p[3]) : 1; }
  return 1;
}
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** The palette colour for a role, keeping the alpha the style gave (fades over zoom, see-through areas). */
function paint(original, role, pal) {
  if (typeof original !== 'string') return original;
  const a = alphaOf(original);
  const hex = pal[role] || pal.landuse;
  if (a >= 1) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${+a.toFixed(3)})`;
}
/** Walk a paint/layout value: plain colours, and colours inside expressions (interpolate, match, case, stops). */
function walk(v, role, pal) {
  if (typeof v === 'string') return /^(#|rgb|hsl|white|black|transparent)/i.test(v.trim()) ? paint(v, role, pal) : v;
  if (Array.isArray(v)) return v.map((x) => walk(x, role, pal));
  if (v && typeof v === 'object' && Array.isArray(v.stops)) return { ...v, stops: v.stops.map(([z, c]) => [z, walk(c, role, pal)]) };
  return v;
}
const COLOR_PROPS = ['background-color', 'fill-color', 'fill-outline-color', 'fill-extrusion-color', 'line-color', 'text-color', 'text-halo-color', 'icon-color', 'icon-halo-color', 'circle-color', 'circle-stroke-color'];

/** Liberty in Wayli's palette, 'light' or 'dark'; fetched once per mode. */
export async function styledLiberty(mode = 'light') {
  if (cache[mode]) return cache[mode];
  const pal = PALETTES[mode] || PALETTES.light;
  const style = await (await fetch(LIBERTY)).json();
  for (const layer of style.layers || []) {
    // the sprite's hatchings (construction sites, pedestrian areas, rail ties) are black and white: faint in the dark
    if (mode === 'dark' && layer.paint) {
      if (layer.paint['fill-pattern']) layer.paint['fill-opacity'] = 0.12;
      if (layer.paint['line-pattern']) layer.paint['line-opacity'] = 0.25;
    }
    for (const section of ['paint', 'layout']) {
      const props = layer[section];
      if (!props) continue;
      for (const k of COLOR_PROPS) if (k in props) props[k] = walk(props[k], roleOf(layer, k), pal);
    }
  }
  style.name = `Liberty, Wayli ${mode}`;
  cache[mode] = style;
  return style;
}
