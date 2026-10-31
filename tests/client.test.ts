// The page's end of the data worker (src/worker/client.ts): every call gets an answer or an error naming what it asked.
import { test, expect, vi } from 'vitest';

class FakeWorker {
  static last: FakeWorker;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  sent: { id: number; op: string }[] = [];
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(m: { id: number; op: string }) {
    this.sent.push(m);
  }
}
vi.stubGlobal('Worker', FakeWorker);
vi.stubGlobal('location', { href: 'https://example.org/' });

test('a worker that fails rejects every waiting call, with the operation in the error', async () => {
  // a crash outside an answer used to leave every pending call unsettled, and the busy flags on screen with them
  // (2026-10-31)
  const { call, hooks } = await import('../src/worker/client.ts');
  hooks.failed = () => {};
  const a = call('tripStops', { trip: 1 }),
    b = call('stopInfo', { stop: 2 });
  FakeWorker.last.onerror!({ message: 'boom' });
  await expect(a).rejects.toThrow('tripStops: boom');
  await expect(b).rejects.toThrow('stopInfo: boom');
});

test('an error answer names its operation', async () => {
  const { call } = await import('../src/worker/client.ts');
  const p = call('departures', { stop: 1, fromTime: 0 });
  const { id } = FakeWorker.last.sent[FakeWorker.last.sent.length - 1];
  FakeWorker.last.onmessage!({ data: { id, error: 'no timetable' } });
  await expect(p).rejects.toThrow('departures: no timetable');
});
