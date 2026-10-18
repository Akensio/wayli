// A dark basemap with all of Liberty's detail (road classes, 3D buildings, stops, places): the
// Liberty style itself, recoloured at runtime. OpenFreeMap's own dark styles carry far less. Every
// colour in the style is turned by role: ground and water very dark, roads mid grey (casings a touch
// lighter, so they outline), buildings a shade above the ground, text light with a dark halo.

const LIBERTY = 'https://tiles.openfreemap.org/styles/liberty';
let cached = null;

const NAMED = { white: '#ffffff', black: '#000000', red: '#ff0000', transparent: 'rgba(0,0,0,0)' };
function parseColor(s) {
  if (typeof s !== 'string') return null;
  const v = NAMED[s.trim().toLowerCase()] || s.trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [n >> 16, (n >> 8) & 255, n & 255, a];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  m = /^hsla?\(([^)]+)\)$/i.exec(v);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); const [r, g, b] = hslToRgb(p[0] / 360, p[1] / 100, p[2] / 100); return [r, g, b, p.length > 3 ? p[3] : 1]; }
  return null;
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h, s, l) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const out = (h, s, l, a) => { const [r, g, b] = hslToRgb(h, s, l); return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+a.toFixed(3)})`; };

/** Recolour one colour for a role. Lightness is remapped per role; hue kept, saturation softened. */
function turn(s, role) {
  const c = parseColor(s);
  if (!c) return s;
  let [h, sat, l] = rgbToHsl(c[0], c[1], c[2]);
  const a = c[3];
  switch (role) {
    case 'ground': l = 0.07 + (1 - l) * 0.12; sat *= 0.5; break;          // land, parks, water: near black, a hint of hue
    case 'building': l = 0.16 + (1 - l) * 0.08; sat *= 0.3; break;
    case 'road': l = 0.3 + (1 - l) * 0.22; sat *= 0.3; break;            // white streets -> dark grey, yellow motorways -> warm grey
    case 'casing': l = 0.38 + (1 - l) * 0.2; sat *= 0.25; break;         // a touch lighter than the road: an outline
    case 'text': l = 0.82 + (1 - l) * 0.1; sat *= 0.5; break;
    case 'halo': l = 0.09; sat *= 0.3; break;
    case 'icon': l = 0.8; sat *= 0.6; break;
    default: l = 0.2 + (1 - l) * 0.3; sat *= 0.5;
  }
  return out(h, sat, Math.max(0, Math.min(1, l)), a);
}
/** Walk a paint/layout value: plain colours, and colours inside expressions (interpolate, match, case...). */
function walk(v, role) {
  if (typeof v === 'string') return turn(v, role);
  if (Array.isArray(v)) return v.map((x) => walk(x, role));
  if (v && typeof v === 'object' && Array.isArray(v.stops)) return { ...v, stops: v.stops.map(([z, c]) => [z, walk(c, role)]) };
  return v;
}
const ROLE = {
  'background-color': 'ground', 'fill-color': 'ground', 'fill-outline-color': 'ground', 'fill-extrusion-color': 'building',
  'line-color': 'road', 'text-color': 'text', 'text-halo-color': 'halo', 'icon-color': 'icon', 'icon-halo-color': 'halo', 'circle-color': 'icon', 'circle-stroke-color': 'halo',
};
export async function darkLiberty() {
  if (cached) return cached;
  const style = await (await fetch(LIBERTY)).json();
  for (const layer of style.layers || []) {
    const id = layer.id || '';
    const isCasing = /casing|outline/i.test(id);
    const isBuilding = /building/i.test(id);
    for (const section of ['paint', 'layout']) {
      const props = layer[section];
      if (!props) continue;
      for (const k of Object.keys(props)) {
        let role = ROLE[k];
        if (!role) continue;
        if (k === 'line-color' && isCasing) role = 'casing';
        if (k === 'fill-color' && isBuilding) role = 'building';
        props[k] = walk(props[k], role);
      }
    }
  }
  style.name = 'Liberty, dark';
  cached = style;
  return style;
}
