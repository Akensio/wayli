// The panels' stack and Back (src/state/nav.ts), on both ways Back reaches it: browser history (an entry per panel,
// whose steps back arrive later as popstate) and Android's CloseWatchers (one per entry, Back closes the newest).
// A small fake of each stands in for the browser; the scenarios are the ones that broke before.
import { test, expect, vi } from 'vitest';

type Nav = typeof import('../src/state/nav.ts');

/** History as a browser keeps it: states and a position; go and back report a popstate a moment later. */
function fakeHistory() {
  const listeners: ((e: { state: unknown }) => void)[] = [];
  let states: unknown[] = [null],
    at = 0;
  const pop = () => listeners.forEach((l) => l({ state: states[at] }));
  return {
    listeners,
    get length() {
      return at + 1; // the entries Back can still reach, the first included
    },
    history: {
      pushState(s: unknown) {
        states = [...states.slice(0, at + 1), s];
        at++;
      },
      replaceState(s: unknown) {
        states[at] = s;
      },
      // the browser moves later, to a place counted from where the call was made: an entry pushed meanwhile is
      // stepped over (the race the stack's queue is for)
      go(n: number) {
        const to = Math.max(0, Math.min(states.length - 1, at + n));
        setTimeout(() => {
          at = to;
          pop();
        }, 0);
      },
      back() {
        this.go(-1);
      },
    },
  };
}
/** CloseWatchers as Android's Chrome keeps them: Back closes the newest one alive. */
function fakeWatchers() {
  const alive: { onclose: (() => void) | null; destroy(): void }[] = [];
  class CloseWatcher {
    onclose: (() => void) | null = null;
    constructor() {
      alive.push(this);
    }
    destroy() {
      const i = alive.indexOf(this);
      if (i >= 0) alive.splice(i, 1);
    }
  }
  const phoneBack = () => {
    const w = alive.pop();
    w?.onclose?.();
  };
  return { CloseWatcher, alive, phoneBack };
}

/** A fresh nav module on a fresh fake browser; `closed` lists the panels closed, in order. */
async function start(android: boolean) {
  vi.resetModules();
  const h = fakeHistory(),
    w = fakeWatchers();
  const mem = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  g.window = Object.assign(g, {
    addEventListener: (type: string, l: (e: { state: unknown }) => void) => {
      if (type === 'popstate') h.listeners.push(l);
    },
    CloseWatcher: android ? w.CloseWatcher : undefined,
  });
  g.history = h.history;
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: android ? 'Mozilla/5.0 (Linux; Android 14)' : 'Mozilla/5.0 (Macintosh)' },
    configurable: true,
  });
  const nav: Nav = await import('../src/state/nav.ts');
  (await import('../src/state/sheet.ts')).hooks.changed = () => {}; // the map and the list follow the sheet in the app
  const closed: string[] = [];
  Object.assign(nav.hooks, {
    closed: (id: string) => void closed.push(id),
    clearPlan: () => void closed.push('plan'),
    leaveSearch: () => void closed.push('search'),
    changed: () => {},
  });
  // the phone's own Back: a history step, or the newest CloseWatcher
  const phoneBack = async () => {
    if (android) w.phoneBack();
    else h.history.back();
    await settle();
  };
  return { nav, closed, phoneBack, h, w };
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const ids = (nav: Nav) => nav.stack.value.map((e) => (e.kind === 'overlay' ? e.id : e.kind));

for (const android of [false, true]) {
  const where = android ? 'Android' : 'history';

  test(`${where}: Back closes the panels newest first`, async () => {
    const { nav, closed, phoneBack } = await start(android);
    nav.push({ kind: 'plan' });
    for (const id of ['detail', 'lineDetail', 'stopDetail']) nav.showOverlay(id);
    await phoneBack();
    await phoneBack();
    expect(ids(nav)).toEqual(['plan', 'detail']);
    expect(closed).toEqual(['stopDetail', 'lineDetail']);
    await phoneBack();
    await phoneBack();
    expect(ids(nav)).toEqual([]);
    expect(closed).toEqual(['stopDetail', 'lineDetail', 'detail', 'plan']);
  });

  test(`${where}: what the app closed itself, Back does not find again`, async () => {
    const { nav, closed, phoneBack, h, w } = await start(android);
    nav.push({ kind: 'plan' });
    nav.showOverlay('detail');
    nav.showOverlay('lineDetail');
    nav.close('lineDetail'); // its X
    await settle();
    expect(ids(nav)).toEqual(['plan', 'detail']);
    nav.closeAll();
    await settle();
    expect(ids(nav)).toEqual([]);
    expect(android ? w.alive.length : h.length).toBe(android ? 0 : 1); // nothing left for Back
    const before = closed.length;
    await phoneBack();
    expect(closed.length).toBe(before);
  });

  test(`${where}: a panel opened while a step back is on its way is the next one Back closes`, async () => {
    const { nav, closed, phoneBack, h } = await start(android);
    nav.push({ kind: 'plan' });
    nav.showOverlay('detail');
    nav.close('detail');
    nav.showOverlay('stopDetail'); // at once, before the browser reports the step back
    await settle();
    if (!android) expect(h.length).toBe(3); // the first, the plan, the stop
    await phoneBack();
    expect(ids(nav)).toEqual(['plan']);
    expect(closed).toEqual(['detail', 'stopDetail']);
  });

  test(`${where}: asking again for a panel below closes those opened over it`, async () => {
    const { nav, closed, phoneBack } = await start(android);
    nav.showOverlay('lineDetail');
    nav.showOverlay('stopDetail');
    nav.showOverlay('lineDetail'); // the stop page's chip asked for the line again
    await settle();
    expect(ids(nav)).toEqual(['lineDetail']);
    expect(closed).toEqual(['stopDetail']);
    await phoneBack();
    expect(ids(nav)).toEqual([]);
  });

  test(`${where}: the detail that became the trip followed closes as the trip followed`, async () => {
    const { nav, closed, phoneBack } = await start(android);
    nav.push({ kind: 'plan' });
    nav.showOverlay('detail');
    expect(nav.swap('detail', 'follow')).toBe(true);
    expect(closed).toEqual(['detail']); // the detail's own timers stop
    await phoneBack();
    expect(ids(nav)).toEqual(['plan']);
    expect(closed).toEqual(['detail', 'follow']);
  });
}
