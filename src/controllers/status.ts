// The status pill: what is loading and how far, a ready line that fades after four seconds, errors that stay.
import { t } from '../lib/i18n';
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

function showProgress(m: Progress): void {
  // the files the rider waits for say so; the rest (the courses, the bus times) arrive quietly in the background
  const label = (
    { timetable: t('loadingTT'), places: t('loadingPL'), streets: t('loadingST') } as Record<string, string>
  )[m.label];
  if (!label) return;
  const mb = (m.got / 1e6).toFixed(1) + (m.total ? ' / ' + (m.total / 1e6).toFixed(1) : '') + ' MB';
  setStatus(`${label}: ${m.unpacking ? t('unpacking') : mb}`, false, m.total ? m.got / m.total : null);
}
workerHooks.progress = showProgress;
workerHooks.failed = (msg) => setStatus(t('loadFail', { msg }), true);
