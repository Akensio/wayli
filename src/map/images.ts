// Marker images drawn on canvas at 2x: station badges and the vehicles' heading arrows.
import { ICONS, modeIcon } from '../widgets/icons';
import { routeColor } from '../display/colors';

export const BADGE_KINDS = ['rail', 'lrt', 'station', 'bus'] as const;
/** A station badge (rail, lrt, bus station) or the smaller bus-stop badge: a white disc with a coloured ring and the mode's glyph. */
export function stationImage(kind: string): ImageData {
  const station = kind !== 'bus',
    size = station ? 44 : 30,
    c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  let color = station ? routeColor(3) : '#5f6b72';
  if (kind === 'rail') color = routeColor(2);
  else if (kind === 'lrt') color = routeColor(0);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - (station ? 2.5 : 2), 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = station ? 3 : 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  const k = (station ? 26 : 18) / 24;
  ctx.translate((size - 24 * k) / 2, (size - 24 * k) / 2);
  ctx.scale(k, k);
  ctx.lineWidth = station ? 2.1 : 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.stroke(new Path2D(ICONS[modeIcon(kind)]));
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
