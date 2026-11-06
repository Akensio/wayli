// Marker images drawn on canvas at 2x: station badges and the vehicles' heading arrows.
import { ICONS, modeIcon } from '../widgets/icons';
import { routeColor } from '../widgets/lineColors';

export const BADGE_KINDS = ['rail', 'lrt', 'station', 'bus'] as const;
/** A station badge (rail, lrt, bus station) or the smaller bus-stop badge: a white disc with a coloured ring and the
 *  mode's glyph. A bus stop's is dark and a little bigger than it was (2026-11-06, the maintainer: stops and stairwells
 *  were not noticeable enough; the stations are right as they are). */
export function stationImage(kind: string): ImageData {
  const station = kind !== 'bus',
    size = station ? 44 : 34,
    c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  let color = station ? routeColor(3) : INK;
  if (kind === 'rail') color = routeColor(2);
  else if (kind === 'lrt') color = routeColor(0);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = station ? 3 : 2.6;
  ctx.strokeStyle = color;
  ctx.stroke();
  const k = (station ? 26 : 20) / 24;
  ctx.translate((size - 24 * k) / 2, (size - 24 * k) / 2);
  ctx.scale(k, k);
  ctx.lineWidth = station ? 2.1 : 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.stroke(new Path2D(ICONS[modeIcon(kind)]));
  return ctx.getImageData(0, 0, size, size);
}
const INK = '#1b1f24'; // the dark of the small badges' rings and glyphs
/** A station entrance's badge: a white disc with a dark ring and the stairs glyph, the bus stop badge's size. */
export function doorImage(): ImageData {
  const size = 34,
    c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  const k = 18 / 24;
  ctx.translate((size - 24 * k) / 2, (size - 24 * k) / 2);
  ctx.scale(k, k);
  ctx.lineWidth = 2.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke(new Path2D(ICONS.stairs));
  return ctx.getImageData(0, 0, size, size);
}
/** A small upward triangle in a colour, with a white edge. */
export function arrowImage(color: string): ImageData {
  const size = 36,
    c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  ctx.moveTo(size / 2, 4);
  ctx.lineTo(size - 7, size - 6);
  ctx.lineTo(size / 2, size - 13);
  ctx.lineTo(7, size - 6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ffffff';
  ctx.lineJoin = 'round';
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}
