// The status pill: what is loading and how far, a ready line that fades after four seconds, errors that stay.
import { t } from '../common/i18n';
import * as app from '../state/app';
import { hooks as workerHooks } from '../worker/client';
import type { Progress } from '../worker/client';

let timer = 0;
export function setStatus(text: string, error = false, frac: number | null = null): void {
  app.status.value = { text, error, frac };
  clearTimeout(timer);
  if (!error && frac == null)
    timer = window.setTimeout(() => {
      app.status.value = { text, error, frac, hidden: true };
    }, 4000);
}
/** A load that failed, as the pill says it. */
export const loadFailed = (e: unknown): void =>
  setStatus(t('loadFail', { msg: e instanceof Error ? e.message : String(e) }), true);

/** The words for a file on its way, by where its bytes come from: the phone's own copy (opening: nothing travels), an
 *  older copy and the build's deltas to it (updating), or the network (downloading). The files the rider waits for
 *  say so; the rest (the courses, the bus times, the stops' search) arrive quietly in the background. */
const WORDS: Record<string, Record<'open' | 'update' | 'download', string>> = {
  timetable: { open: 'openTT', update: 'updateTT', download: 'loadingTT' },
  places: { open: 'openPL', update: 'updatePL', download: 'loadingPL' },
  search: { open: 'openPL', update: 'updatePL', download: 'loadingPL' },
  streets: { open: 'openST', update: 'updateST', download: 'loadingST' },
};
function showProgress(m: Progress): void {
  const words = WORDS[m.label];
  if (!words) return;
  if (m.how === 'open') {
    setStatus(t(words.open), false, null);
    return;
  }
  const mb = (m.got / 1e6).toFixed(1) + (m.total ? ' / ' + (m.total / 1e6).toFixed(1) : '') + ' MB';
  setStatus(
    `${t(words[m.how || 'download'])}: ${m.unpacking ? t('unpacking') : mb}`,
    false,
    m.total ? m.got / m.total : null,
  );
}
/** Start: the worker's loading progress and failures on the status line. */
export function install(): void {
  workerHooks.progress = showProgress;
  workerHooks.failed = (msg) => setStatus(t('loadFail', { msg }), true);
}
