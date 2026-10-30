// The basemap, light and dark: OpenFreeMap's Liberty style with every colour replaced by one of two palettes,
// at runtime, so the map keeps all of Liberty's detail (road classes, 3D buildings, places) while the roads
// recede into a quiet, near-neutral ground and the transit lines Wayli draws on top carry the colour.
// Light: cool off-white land, white streets with soft casings, motorways, water and parks tinted with the
// app's turquoise instead of Liberty's yellow. Dark: near-black land with the same turquoise cast, roads as
// lighter greys in a clear hierarchy, deep teal water, light text with a dark halo.

const LIBERTY = 'https://tiles.openfreemap.org/styles/liberty';
const cache: Partial<Record<string, LibertyStyle>> = {};

/** A layer of the style as this file touches it: id, type, source layer, filter and the colour properties. */
type Layer = {
  id: string;
  type: string;
  'source-layer'?: string;
  filter?: unknown;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
};
/** Liberty's style document, as fetched; only `layers` and `name` are read or written. */
export type LibertyStyle = { name?: string; layers?: Layer[]; [k: string]: unknown };

const TEAL = {
  // the app's turquoise (#12998b) tints what carries colour: motorways, water, parks, casings and labels; the rest stays neutral
  light: {
    land: '#f2f4f3',
    landuse: '#ebeeed',
    park: '#d6e9e1',
    wood: '#cbe2d8',
    sand: '#ebe9d9',
    ice: '#edf1f1',
    water: '#b9dfe0',
    waterLine: '#a5d3d4',
    building: '#e5e9e8',
    buildingOutline: '#d6dcda',
    aeroway: '#e6e9e8',
    motorway: '#c6e6e0',
    motorwayCasing: '#8fcbc1',
    primary: '#ffffff',
    primaryCasing: '#c9d6d3',
    secondary: '#ffffff',
    secondaryCasing: '#d5dedc',
    minor: '#ffffff',
    minorCasing: '#dde4e2',
    service: '#f9fbfa',
    serviceCasing: '#e2e8e6',
    path: '#dfe6e4',
    pathCasing: '#d6dedb',
    rail: '#b9c6c3',
    tunnel: '#edf0ef',
    tunnelCasing: '#dfe5e3',
    boundary: '#c3cdca',
    text: '#44534f',
    place: '#243330',
    halo: '#ffffff',
    icon: '#4f716b',
    iconHalo: '#ffffff',
  },
  dark: {
    land: '#171c1b',
    landuse: '#1a201f',
    park: '#182824',
    wood: '#16241f',
    sand: '#20231f',
    ice: '#1b2222',
    water: '#0d2628',
    waterLine: '#12393c',
    building: '#202726',
    buildingOutline: '#2a3331',
    aeroway: '#1d2423',
    motorway: '#4a6d67',
    motorwayCasing: '#2a3e3b',
    primary: '#404d4b',
    primaryCasing: '#283231',
    secondary: '#374240',
    secondaryCasing: '#262f2e',
    minor: '#2e3836',
    minorCasing: '#22292a',
    service: '#283130',
    serviceCasing: '#1f2626',
    path: '#303a38',
    pathCasing: '#262e2d',
    rail: '#48544f',
    tunnel: '#1f2625',
    tunnelCasing: '#1b2120',
    boundary: '#374442',
    text: '#b4c4c0',
    place: '#dde9e6',
    halo: '#141918',
    icon: '#8fb3ac',
    iconHalo: '#141918',
  },
};
const NEUTRAL = {
  light: {
    land: '#f3f2ee',
    landuse: '#edebe6',
    park: '#dbe9d2',
    wood: '#d2e2c8',
    sand: '#efe8d0',
    ice: '#edf0f1',
    water: '#c3d8ee',
    waterLine: '#b5cde8',
    building: '#e8e6e1',
    buildingOutline: '#dad7d0',
    aeroway: '#e9e7e2',
    motorway: '#f4d9a0',
    motorwayCasing: '#e0c285',
    primary: '#ffffff',
    primaryCasing: '#d5d1c9',
    secondary: '#ffffff',
    secondaryCasing: '#dcd8d1',
    minor: '#ffffff',
    minorCasing: '#e3e0d9',
    service: '#faf9f6',
    serviceCasing: '#e6e3dc',
    path: '#e6e3dc',
    pathCasing: '#dedbd3',
    rail: '#c9c4bb',
    tunnel: '#efede8',
    tunnelCasing: '#e2dfd8',
    boundary: '#cbc6be',
    text: '#4a4f57',
    place: '#2d3136',
    halo: '#ffffff',
    icon: '#6a7079',
    iconHalo: '#ffffff',
  },
  dark: {
    land: '#191c21',
    landuse: '#1c1f25',
    park: '#1a2420',
    wood: '#182119',
    sand: '#22231e',
    ice: '#1d2126',
    water: '#0e1a2c',
    waterLine: '#132238',
    building: '#22262d',
    buildingOutline: '#2b3038',
    aeroway: '#1f2329',
    motorway: '#565b67',
    motorwayCasing: '#33373f',
    primary: '#454a54',
    primaryCasing: '#2a2e35',
    secondary: '#3b4048',
    secondaryCasing: '#272b32',
    minor: '#31353d',
    minorCasing: '#24282e',
    service: '#2a2e35',
    serviceCasing: '#212529',
    path: '#33373f',
    pathCasing: '#272b31',
    rail: '#4a4f59',
    tunnel: '#20242a',
    tunnelCasing: '#1c1f25',
    boundary: '#3a3f48',
    text: '#b6bcc6',
    place: '#e0e4e9',
    halo: '#15181d',
    icon: '#9aa1ab',
    iconHalo: '#15181d',
  },
};
/** The palettes: `teal` carries the app's turquoise, `neutral` is the quiet grey family (Positron, Transit app); each light and dark. */
/** What a colour in the style stands for: a role, each palette giving it a colour. */
export type Role = keyof typeof TEAL.light;
export type Palette = Record<Role, string>;
export type Tint = 'teal' | 'neutral';
export type Shade = 'light' | 'dark';
export const PALETTES: Record<Tint, Record<Shade, Palette>> = { teal: TEAL, neutral: NEUTRAL };

/** The palette key a layer's colour property maps to, from the layer's id and the property. */
function roleOf(layer: Layer, prop: string): Role {
  const id = layer.id || '',
    type = layer.type;
  if (prop === 'text-color') return /^place|^country|^state|^continent/.test(id) ? 'place' : 'text';
  if (prop === 'text-halo-color' || prop === 'icon-halo-color') return 'halo';
  if (prop === 'icon-color' || prop === 'circle-color') return 'icon';
  if (prop === 'circle-stroke-color') return 'iconHalo';
  if (type === 'background') return 'land';
  if (/water/.test(id)) return type === 'line' ? 'waterLine' : 'water';
  if (/building/.test(id)) return prop === 'fill-outline-color' ? 'buildingOutline' : 'building';
  if (/park|wood|grass|pitch|track$|cemetery|school/.test(id) && type !== 'line')
    return /wood/.test(id) ? 'wood' : 'park';
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
    const roadClass = (
      [
        [/motorway/, 'motorway'],
        [/trunk|primary/, 'primary'],
        [/secondary|tertiary|_link/, 'secondary'],
        [/minor|street/, 'minor'],
        [/service|track/, 'service'],
        [/path|pedestrian/, 'path'],
      ] as [RegExp, string][]
    ).find(([re]) => re.test(id));
    const cls = roadClass ? roadClass[1] : 'minor';
    return (casing ? cls + 'Casing' : cls) as Role;
  }
  return type === 'line' ? 'minor' : 'landuse';
}

const NAMED: Record<string, string> = { white: '#ffffff', black: '#000000', transparent: 'rgba(0,0,0,0)' };
/** The alpha of a style colour (1 when opaque or unknown). */
function alphaOf(s: unknown): number {
  const v = (NAMED[String(s).trim().toLowerCase()] || String(s)).trim();
  let m = /^#([0-9a-f]{8})$/i.exec(v);
  if (m) return parseInt(m[1].slice(6), 16) / 255;
  m = /^#([0-9a-f]{4})$/i.exec(v);
  if (m) return parseInt(m[1][3] + m[1][3], 16) / 255;
  m = /^(?:rgba|hsla)\(([^)]+)\)$/i.exec(v);
  if (m) {
    const p = m[1].split(',');
    return p.length > 3 ? parseFloat(p[3]) : 1;
  }
  return 1;
}
const hexToRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
/** The palette colour for a role, keeping the alpha the style gave (fades over zoom, see-through areas). */
function paint(original: unknown, role: Role, pal: Palette): unknown {
  if (typeof original !== 'string') return original;
  const a = alphaOf(original);
  const hex = pal[role] || pal.landuse;
  if (a >= 1) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${+a.toFixed(3)})`;
}
/** Walk a paint/layout value: plain colours, and colours inside expressions (interpolate, match, case, stops). */
function walk(v: unknown, role: Role, pal: Palette): unknown {
  if (typeof v === 'string') return /^(#|rgb|hsl|white|black|transparent)/i.test(v.trim()) ? paint(v, role, pal) : v;
  if (Array.isArray(v)) return v.map((x) => walk(x, role, pal));
  if (v && typeof v === 'object' && Array.isArray((v as { stops?: unknown }).stops))
    return { ...v, stops: (v as { stops: [unknown, unknown][] }).stops.map(([z, c]) => [z, walk(c, role, pal)]) };
  return v;
}
const COLOR_PROPS = [
  'background-color',
  'fill-color',
  'fill-outline-color',
  'fill-extrusion-color',
  'line-color',
  'text-color',
  'text-halo-color',
  'icon-color',
  'icon-halo-color',
  'circle-color',
  'circle-stroke-color',
];

/** Liberty in Wayli's palette, 'light' or 'dark'; fetched once per mode. */
export async function styledLiberty(mode: Shade = 'light', tint: Tint = 'teal'): Promise<LibertyStyle> {
  const key = tint + ':' + mode;
  if (cache[key]) return cache[key];
  const pal = (PALETTES[tint] || TEAL)[mode] || TEAL.light;
  const style = (await (await fetch(LIBERTY)).json()) as LibertyStyle;
  for (const layer of style.layers || []) {
    // an app for riders in Israel does not name "Palestinian Territories" on its map (Gadi, 2026-10-24): that country
    // label is left out, by its code and by its name in either language, whatever language the labels are shown in
    if (layer['source-layer'] === 'place' && /^label_(country|state)/.test(layer.id)) {
      const not = (field: string, part: string) => ['!', ['in', part, ['coalesce', ['get', field], '']]];
      layer.filter = [
        'all',
        layer.filter || true,
        ['!=', ['coalesce', ['get', 'iso_a2'], ''], 'PS'],
        not('name:en', 'Palestin'),
        not('name', 'Palestin'),
        not('name:he', 'פלסטינ'),
      ];
    }
    // the stops on the map are the feed's, served today (map/index.ts): OpenStreetMap's own bus stops and stations
    // in the basemap's points of interest doubled them, and named stops no line serves any more (Neve Sha'anan, by
    // the old central bus station: Gadi, 2026-10-24)
    if (layer['source-layer'] === 'poi' && /^poi_r/.test(layer.id))
      layer.filter = [
        'all',
        layer.filter || true,
        ['!', ['match', ['get', 'class'], ['bus', 'railway', 'rail', 'tram'], true, false]],
      ];
    // the sprite's hatchings (construction sites, pedestrian areas, rail ties) are black and white: faint in the dark
    if (mode === 'dark' && layer.paint) {
      if (layer.paint['fill-pattern']) layer.paint['fill-opacity'] = 0.12;
      if (layer.paint['line-pattern']) layer.paint['line-opacity'] = 0.25;
    }
    for (const section of ['paint', 'layout'] as const) {
      const props = layer[section];
      if (!props) continue;
      for (const k of COLOR_PROPS) {
        if (!(k in props)) continue;
        const role = roleOf(layer, k);
        // Liberty draws trunk roads in one layer with the primary ones; in Israel much of Route 4 and the climb on
        // Route 1 are trunk roads, not motorways, and came out white like a city avenue: trunk takes the motorway's
        // colours, by the road's class, primary keeps its own
        props[k] =
          /^(road|bridge)_trunk_primary/.test(layer.id) && typeof props[k] === 'string' && role.startsWith('primary')
            ? [
                'match',
                ['get', 'class'],
                'trunk',
                walk(props[k], role.replace('primary', 'motorway') as Role, pal),
                walk(props[k], role, pal),
              ]
            : walk(props[k], role, pal);
      }
    }
  }
  style.name = `Liberty, Wayli ${tint} ${mode}`;
  cache[key] = style;
  return style;
}
