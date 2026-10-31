// Wayli's icons: one stroke set on a 24-unit grid, drawn as an inline SVG sprite once (installSprite) and
// referenced by name (the Icon component); the map badges draw the same
// paths on canvas.

/** The vehicle icon for a GTFS route type: a train, a tram, else a bus. */
export function vehicleIcon(routeType?: number | null): IconName {
  if (routeType === 2) return 'train';
  if (routeType === 0) return 'tram';
  return 'bus';
}
/** The vehicle icon for a mode name (engine/modes.js): rail a train, lrt a tram, else a bus. */
export function modeIcon(mode?: string | null): IconName {
  if (mode === 'rail') return 'train';
  if (mode === 'lrt') return 'tram';
  return 'bus';
}
export const ICONS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  user: 'M12 12.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5zM4.5 21a7.5 7.5 0 0 1 15 0',
  close: 'M6 6l12 12M18 6L6 18',
  swap: 'M8 4v16M5 17l3 3 3-3M16 20V4M13 7l3-3 3 3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5L16 16',
  locate:
    'M12 2v3M12 19v3M2 12h3M19 12h3M12 17.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM12 13.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z',
  pin: 'M12 21.5c-4.3-4.6-6.5-8.3-6.5-11.5a6.5 6.5 0 1 1 13 0c0 3.2-2.2 6.9-6.5 11.5zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  star: 'M12 3.2l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17.1 6.6 20l1.1-6.1-4.5-4.3 6.1-.8z',
  sliders: 'M4 6h8M16 6h4M4 12h3M11 12h9M4 18h11M19 18h1M14 4v4M9 10v4M17 16v4',
  route: 'M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 19h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6',
  bus: 'M6 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM4 10.5h16M7 18v2.5M17 18v2.5M8 14.5h.5M15.5 14.5h.5',
  train:
    'M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM4 10h16M8.5 14h.5M15 14h.5M8 21l1.5-3M16 21l-1.5-3',
  cable: 'M3 5.5l18-3M12 4v4M7 8h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM5 13h14M12 8v5',
  taxi: 'M5 17v-4.5L7 7h10l2 5.5V17M3.5 17h17v2.5h-17zM7.5 19.5V21M16.5 19.5V21M10 4.5h4V7h-4zM7.5 14.5h.5M16 14.5h.5',
  tram: 'M7 6h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3zM4 12h16M8.5 15.5h.5M15 15.5h.5M9 2l3 2 3-2M12 4v2M8 21l1.5-3M16 21l-1.5-3',
  walk: 'M13.5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9.5 10l3-2.5 2.5 1.5 2 3M12.5 7.5l-1.5 6 3 2.5 1.5 6M11.5 13l-2.5 2.5-1.5 6',
  bike: 'M5.5 18.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18.5 18.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 15h6.5l2.5-7.5h-5.5l-3.5 7.5M12 15l-3-7.5M7.5 7.5h3M14.5 7.5l4 7.5M14.5 7.5l1-2.5h2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  card: 'M3.5 6.5h17v11h-17zM3.5 10.5h17M7 14.5h4',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4.5h4.5M12 8v4.5l3 2',
  map: 'M9 3.5L3 5.5v15l6-2 6 2 6-2v-15l-6 2zM9 3.5v15M15 5.5v15',
  home: 'M3.5 11l8.5-7 8.5 7v8.5a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5a1.5 1.5 0 0 1-1.5-1.5z',
  work: 'M4 8h16a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18',
  play: 'M7 4.5v15l12-7.5z',
  chevronDown: 'M6 9.5l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevronEnd: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  bolt: 'M13 2.5L4.5 13.5h7l-1 8 9-11h-7z',
  arrowsLR: 'M4 8h16M16.5 4.5L20 8l-3.5 3.5M20 16H4M7.5 12.5L4 16l3.5 3.5',
  share: 'M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  refresh: 'M20.5 11a8.5 8.5 0 0 0-15-4.5L3 9M3 3.5V9h5.5M3.5 13a8.5 8.5 0 0 0 15 4.5L21 15M21 20.5V15h-5.5',
  bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 21h4',
  sound: 'M4 10v4h3l5 4V6L7 10zM15.5 9a4.2 4.2 0 0 1 0 6M18.5 6a8.5 8.5 0 0 1 0 12',
  live: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2',
  mountain: 'M2.5 19.5l6.5-11 4 6.5 2.5-3.5 6 8zM7.2 10.7l1.8 1.3 1.6-1.2',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  trash: 'M4 7h16M10 11.5v6M14 11.5v6M6 7l1 13h10l1-13M9 7V4h6v3',
  download: 'M12 3.5v12M7 11l5 5 5-5M4 20h16',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.5h.01',
  shield: 'M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6zM9 12l2 2 4-4',
};
const FILLED_ICONS = new Set(['play']);
export type IconName = keyof typeof ICONS;

/** Put the sprite into the document once, so every `<use href="#i-...">` resolves. */
export function installSprite(): void {
  if (document.getElementById('wayli-sprite')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'wayli-sprite';
  svg.setAttribute('style', 'display:none');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = Object.entries(ICONS)
    .map(
      ([k, d]) =>
        `<symbol id="i-${k}" viewBox="0 0 24 24"><path d="${d}"${FILLED_ICONS.has(k) ? ' fill="currentColor" stroke="none"' : ''}/></symbol>`,
    )
    .join('');
  document.body.prepend(svg);
}
