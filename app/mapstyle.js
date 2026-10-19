// The basemap, light and dark: OpenFreeMap's Liberty style with every colour replaced by one of two palettes,
// at runtime, so the map keeps all of Liberty's detail (road classes, 3D buildings, places) while the roads
// recede into a quiet, near-neutral ground and the transit lines Wayli draws on top carry the colour.
// Light: warm off-white land, white streets with soft grey casings, pale sand motorways, muted water
// (the Positron / Transit-app family of basemaps). Dark: cool near-black land, roads as lighter greys in
// a clear hierarchy, deep blue-black water, light text with a dark halo.

const LIBERTY = 'https://tiles.openfreemap.org/styles/liberty';
const cache = {};

export const PALETTES = {
  light: {
    land: '#f3f2ee', landuse: '#edebe6', park: '#dbe9d2', wood: '#d2e2c8', sand: '#efe8d0', ice: '#edf0f1', water: '#c3d8ee', waterLine: '#b5cde8',
    building: '#e8e6e1', buildingOutline: '#dad7d0', aeroway: '#e9e7e2',
    motorway: '#f4d9a0', motorwayCasing: '#e0c285', primary: '#ffffff', primaryCasing: '#d5d1c9', secondary: '#ffffff', secondaryCasing: '#dcd8d1',
    minor: '#ffffff', minorCasing: '#e3e0d9', service: '#faf9f6', serviceCasing: '#e6e3dc', path: '#e6e3dc', pathCasing: '#dedbd3', rail: '#c9c4bb',
    tunnel: '#efede8', tunnelCasing: '#e2dfd8', boundary: '#cbc6be',
    text: '#4a4f57', place: '#2d3136', halo: '#ffffff', icon: '#6a7079', iconHalo: '#ffffff',
  },
  dark: {
    land: '#191c21', landuse: '#1c1f25', park: '#1a2420', wood: '#182119', sand: '#22231e', ice: '#1d2126', water: '#0e1a2c', waterLine: '#132238',
    building: '#22262d', buildingOutline: '#2b3038', aeroway: '#1f2329',
    motorway: '#565b67', motorwayCasing: '#33373f', primary: '#454a54', primaryCasing: '#2a2e35', secondary: '#3b4048', secondaryCasing: '#272b32',
    minor: '#31353d', minorCasing: '#24282e', service: '#2a2e35', serviceCasing: '#212529', path: '#33373f', pathCasing: '#272b31', rail: '#4a4f59',
    tunnel: '#20242a', tunnelCasing: '#1c1f25', boundary: '#3a3f48',
    text: '#b6bcc6', place: '#e0e4e9', halo: '#15181d', icon: '#9aa1ab', iconHalo: '#15181d',
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
