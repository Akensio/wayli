// Line colours: trains navy, light rail red (both lines running are "the red line"), buses in their operator's
// colour (approximate brand colours; the table is the one place to correct them), other operators slate green.
import type { Leg } from './types';

const AGENCY_COLORS: [string, string][] = [
  ['אגד', '#008761'], ['דרך אגד', '#008761'], ['דן', '#2457d6'], ['מטרופולין', '#f07f1a'], ['קווים', '#7b2d90'], ['סופרבוס', '#d94e1f'],
  ['נתיב אקספרס', '#8db600'], ['אלקטרה אפיקים', '#1d4f91'], ['תנופה', '#2a9fd6'], ['אקסטרה', '#c2185b'], ['גלים', '#3b8ea5'], ['בית שמש אקספרס', '#b06d1e'],
];
const BUS_DEFAULT = '#4f7a6a', TRAIN_COLOR = '#1b3a6b', LRT_COLOR = '#d7263d';
export const agencyColor = (agency?: string | null): string => { const a = String(agency || ''); for (const [k, c] of AGENCY_COLORS) if (a.startsWith(k)) return c; return BUS_DEFAULT; };
export const routeColor = (type?: number | null, agency?: string | null): string => (type === 2 ? TRAIN_COLOR : type === 0 ? LRT_COLOR : agencyColor(agency));
/** Dark text on light colours, white on the rest. */
export function textOn(hex: string): string { const n = parseInt(hex.slice(1), 16); const lum = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); return lum > 150 ? '#1b1f24' : '#ffffff'; }
/** A line chip's colours as a style object (components) ... */
export const chipColors = (type?: number | null, agency?: string | null): { background: string; color: string } => { const c = routeColor(type, agency); return { background: c, color: textOn(c) }; };
/** ... and as an attribute string (the legacy HTML builders). */
export const chipStyle = (type?: number | null, agency?: string | null): string => { const c = routeColor(type, agency); return ` style="background:${c};color:${textOn(c)}"`; };
export const legColor = (l: Leg): string => (l.type === 'ride' ? routeColor(l.routeType, l.agency) : l.mode === 'bike' ? '#1f5fa8' : '#2b3036');
