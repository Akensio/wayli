// Operators' names in English, where the feed has only Hebrew.
import { lang } from '../lib/i18n';

const AGENCY_EN: Record<string, string> = {
  'רכבת ישראל': 'Israel Railways',
  אגד: 'Egged',
  'אלקטרה אפיקים תחבורה': 'Electra Afikim',
  'אלקטרה אפיקים': 'Electra Afikim',
  דן: 'Dan',
  'ש.א.מ': 'Sham',
  'נסיעות ותיירות': 'Nesiot VeTayarut',
  'גי.בי.טורס': 'GB Tours',
  'מועצה אזורית אילות': 'Eilot Regional Council',
  'נתיב אקספרס': 'Nateev Express',
  מטרופולין: 'Metropoline',
  סופרבוס: 'Superbus',
  קווים: 'Kavim',
  כרמלית: 'Carmelit',
  כפיר: 'Kfir',
  תבל: 'Tevel',
  גלים: 'Galim',
  'מועצה אזורית גולן': 'Golan Regional Council',
  'דן בדרום': 'Dan BaDarom',
  'דן באר שבע': 'Dan Beer Sheva',
  'כבל אקספרס': 'Cable Express',
  תנופה: 'Tnufa',
  'בית שמש אקספרס': 'Beit Shemesh Express',
  אקסטרה: 'Extra',
  'אקסטרה ירושלים': 'Extra Jerusalem',
  'דן נתיבים בעמ': 'Dan Netivim',
  'יונייטד טורס': 'United Tours',
  'מוניות מטרו קו': 'Metro Kav',
  'אודליה מוניות בעמ': 'Odelia',
  'נעים בסופ"ש': "Na'im BeSofash",
  'דרך אגד עוטף ירושלים': 'Egged Jerusalem Envelope',
};
/** An operator's name for display: English where known, else as the feed names it. */
export const agencyName = (a: string): string => (lang.value === 'he' ? a : AGENCY_EN[a] || a);
