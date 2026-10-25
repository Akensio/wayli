// The data worker (worker.js) holds the timetable, the street graph and the address book and answers every
// query, so the UI never blocks. This is the UI's end: one promise per request.
import type { estimateDelay } from '../live.js';
export type Progress = { label: string; got: number; total?: number; unpacking?: boolean };
const worker = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
/** Data files are addressed from the page, not from the worker's own folder under assets/. */
export const DATA_URL = new URL('data/', location.href).href;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
let nextId = 1;
export const hooks = { progress: (_m: Progress) => {}, failed: (_msg: string) => {} };

export function call<T = any>(op: string, args?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, args });
  });
}
worker.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'progress') { hooks.progress(m); return; }
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  if (m.error) p.reject(new Error(m.error)); else p.resolve(m.result);
};
worker.onerror = (e) => hooks.failed(e.message || 'worker');

// a trip's stops are asked for once per loaded day
const tsCache = new Map<number, Promise<any>>();
export const tripStopsCached = (trip: number): Promise<any> => { if (!tsCache.has(trip)) tsCache.set(trip, call('tripStops', { trip })); return tsCache.get(trip)!; };
export const resetCaches = (): void => { tsCache.clear(); };
/** A vehicle's delay and its time at each stop ahead, made in the worker where the learned section times are
 *  (live.js estimateDelay); null when it cannot be told. */
type Estimate = ReturnType<typeof estimateDelay>;
export const estimate = (vehicle: any, stops: any[], day: string): Promise<Estimate> => call<Estimate>('estimate', { vehicle: { ...vehicle }, stops, day }).catch(() => null);
