// The data worker (worker.ts) holds the timetable, the street graph and the address book and answers every
// query, so the UI never blocks. This is the UI's end: one promise per request.
import type { OpName, Ops, OpArgs, Estimate, Vehicle, TripStop, TripStops } from './ops';
export type Progress = { label: string; got: number; total?: number; unpacking?: boolean };
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
/** Data files are addressed from the page, not from the worker's own folder under assets/. */
export const DATA_URL = new URL('data/', location.href).href;
/** The calls waiting for their answer, by id, with the operation asked (for the error's message). */
const pending = new Map<number, { op: OpName; resolve: (v: any) => void; reject: (e: Error) => void }>(); // any: the answer's type is the caller's K
let nextId = 1;
export const hooks = { progress: (_m: Progress) => {}, failed: (_msg: string) => {} };

/** Ask the worker one thing by name; the arguments and the answer are what ops.ts says for it. */
export function call<K extends OpName>(op: K, ...rest: OpArgs<K>): Promise<Ops[K]['result']> {
  const args = rest[0];
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { op, resolve, reject });
    worker.postMessage({ id, op, args });
  });
}
worker.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'progress') {
    hooks.progress(m);
    return;
  }
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  if (m.error) p.reject(new Error(`${p.op}: ${m.error}`));
  else p.resolve(m.result);
};
// the worker failed outside an answer (a module that would not load, an uncaught error): nothing it was asked will be
// answered, so every waiting call fails now rather than hanging with its busy flag set
worker.onerror = (e) => {
  const msg = e.message || 'worker';
  for (const [id, p] of pending) {
    pending.delete(id);
    p.reject(new Error(`${p.op}: ${msg}`));
  }
  hooks.failed(msg);
};

// a trip's stops are asked for once per loaded day
const tsCache = new Map<number, Promise<TripStops>>();
export const tripStopsCached = (trip: number): Promise<TripStops> => {
  let p = tsCache.get(trip);
  if (!p) {
    p = call('tripStops', { trip });
    p.catch(() => tsCache.delete(trip)); // a failure is asked again next time, not remembered
    tsCache.set(trip, p);
  }
  return p;
};
export const resetCaches = (): void => {
  tsCache.clear();
};
/** A vehicle's delay and its time at each stop ahead, made in the worker where the learned section times are
 *  (delays.ts estimateDelay); null when it cannot be told. */
export const estimate = (vehicle: Vehicle, stops: TripStop[], day: string): Promise<Estimate> =>
  call('estimate', { vehicle: { ...vehicle }, stops, day }).catch(() => null);
