// Dragging the sheet: from anywhere on it while it is collapsed or half open (the body does not scroll then),
// from the handle and the top 96 px always. A short pull (40 px) steps one size in its direction; a long one
// lands where it is let go. A tap on the handle steps through the sizes. A tap elsewhere stays a tap.
import * as sheet from '../../state/sheet';
import * as search from '../../state/search';
import * as nav from '../../state/nav';
import type { SheetState } from '../../state/sheet';
import { pullRefresh } from './pullRefresh';

const onPage = () => nav.page.value; // pages over the whole screen do not drag
const clampH = (h: number) => Math.max(sheet.px('peek'), Math.min(sheet.px('full'), h));

export function attachSheetGestures(el: HTMLElement, handle: HTMLElement, body: HTMLElement): void {
  let startX = 0,
    startY = 0,
    startH = 0,
    startState: SheetState = 'peek',
    moved = false,
    dragging = false,
    swallow = false;
  let trail: { t: number; y: number }[] = []; // the last few (time, y) of the finger, for its speed at release
  const track = (y: number) => {
    trail.push({ t: performance.now(), y });
    if (trail.length > 8) trail.shift();
  };
  const speed = () => {
    const n = trail.length;
    if (n < 2) return 0;
    let i = n - 2;
    while (i > 0 && trail[n - 1].t - trail[i].t < 60) i--;
    const dt = trail[n - 1].t - trail[i].t;
    return dt > 0 ? (trail[n - 1].y - trail[i].y) / dt : 0;
  };
  const swallowNextClick = () => {
    swallow = true;
    setTimeout(() => {
      swallow = false;
    }, 60);
  };
  /** Where a drag lands. The nearest size to where it was let go; a short pull (40 px) or a quick one (0.5 px/ms)
   *  steps one size in its direction instead of falling back; only a long drag past the midpoint opens or closes
   *  all the way (as Android's own sheets do: speed picks the next size, never the far one). `v` is the finger's
   *  speed, down positive. */
  const settle = (hh: number, fromH: number, fromState: SheetState, v = 0) => {
    const dy = hh - fromH,
      i0 = sheet.ORDER.indexOf(fromState);
    let best: SheetState = 'peek';
    for (const st of ['half', 'full'] as const)
      if (Math.abs(sheet.px(st) - hh) < Math.abs(sheet.px(best) - hh)) best = st;
    let dir = 0;
    if (Math.abs(v) >= 0.5 && Math.abs(dy) >= 12) dir = v < 0 ? 1 : -1;
    else if (Math.abs(dy) > 40) dir = dy > 0 ? 1 : -1;
    if (dir) {
      const step = sheet.ORDER[Math.max(0, Math.min(2, i0 + dir))];
      if ((sheet.ORDER.indexOf(best) - i0) * dir <= 0) best = step; // a decisive move lands at least one size along
    }
    sheet.set(best);
  };
  const release = (fromH: number, fromState: SheetState) => {
    el.classList.remove('dragging');
    const hh = sheet.visible();
    sheet.dragEnd();
    settle(hh, fromH, fromState, speed());
  };

  // the pointer: a mouse anywhere, a finger on the handle or the top while half or fully open
  el.addEventListener('pointerdown', (e) => {
    if (e.button || onPage()) return;
    const target = e.target as HTMLElement,
      onHandle = handle.contains(target);
    if (target.closest('.hbtn')) return; // the handle row's buttons: a tap, never a drag
    const nearTop = e.clientY - el.getBoundingClientRect().top < 96;
    if (e.pointerType === 'touch' && sheet.state.value === 'peek') return; // a finger on the collapsed sheet: the touch handler below
    // the body scrolls when half or fully open (a finger there is the touch handler's, at the scroll edges); the handle and the top always drag
    if (
      !onHandle &&
      (target.closest('input, select, textarea') ||
        ((sheet.state.value === 'full' || (sheet.state.value === 'half' && e.pointerType === 'touch')) && !nearTop))
    )
      return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startH = sheet.visible();
    startState = sheet.state.value;
    moved = false;
    trail = [{ t: performance.now(), y: e.clientY }];
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = startY - e.clientY,
      dx = e.clientX - startX;
    if (!moved) {
      if (Math.abs(dy) < 4 && Math.abs(dx) < 4) return;
      moved = true;
      el.classList.add('dragging');
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      search.foldBar(); // dragging the results: the boxes fold away
    }
    track(e.clientY);
    sheet.drag(clampH(startH + dy));
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (!moved) {
      el.classList.remove('dragging');
      sheet.dragEnd();
      return;
    } // a tap: the handle's click handler cycles the sizes
    swallowNextClick();
    release(startH, startState);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener(
    'click',
    (e) => {
      if (swallow) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );
  handle.addEventListener('click', (e) => {
    if (!swallow && !(e.target as HTMLElement).closest('.hbtn')) sheet.toggle();
  });

  // Collapsed, every touch on the sheet is ours (touch-action none, so the browser never claims a gesture and
  // the events keep coming): a pull up opens it, a pull down is the pull-to-refresh. The direction is read
  // once, after 6 px.
  {
    let pOn = false,
      pMode = '',
      pY = 0,
      pH = 0;
    el.addEventListener(
      'touchstart',
      (e) => {
        pOn = false;
        if (
          sheet.state.value !== 'peek' ||
          e.touches.length !== 1 ||
          onPage() ||
          (e.target as HTMLElement).closest('input, select, textarea')
        )
          return;
        pOn = true;
        pMode = '';
        pY = e.touches[0].clientY;
        pH = sheet.visible();
        trail = [{ t: performance.now(), y: pY }];
      },
      { passive: true },
    );
    el.addEventListener(
      'touchmove',
      (e) => {
        if (!pOn) return;
        const y = e.touches[0].clientY,
          up = pY - y;
        if (!pMode) {
          if (Math.abs(up) < 6) return;
          pMode = up > 0 ? 'sheet' : 'refresh';
          if (pMode === 'sheet') {
            el.classList.add('dragging');
            search.foldBar();
          }
        }
        if (pMode === 'refresh') pullRefresh.move(-up - 6);
        else {
          track(y);
          sheet.drag(clampH(pH + up));
        }
      },
      { passive: true },
    );
    const pEnd = () => {
      if (!pOn) return;
      pOn = false;
      if (!pMode) return;
      swallowNextClick();
      if (pMode === 'refresh') {
        pullRefresh.end();
        return;
      }
      release(pH, 'peek');
    };
    el.addEventListener('touchend', pEnd);
    el.addEventListener('touchcancel', pEnd);
  }
  // Half or fully open, the list scrolls natively and the browser cancels pointer events; but a finger pulling past
  // an edge of the list only overscrolls, and touch events keep coming: past the top edge, pulling down folds the
  // sheet; past the bottom edge (or with nothing to scroll), pulling up opens it.
  {
    let tY = 0,
      tH = 0,
      tOn = false,
      tMoved = false,
      tTop = false,
      tBottom = false,
      tState: SheetState = 'half';
    body.addEventListener(
      'touchstart',
      (e) => {
        tOn = false;
        if (sheet.state.value === 'peek' || dragging || e.touches.length !== 1 || onPage()) return;
        tOn = true;
        tMoved = false;
        tY = e.touches[0].clientY;
        tH = sheet.visible();
        tState = sheet.state.value;
        tTop = body.scrollTop <= 0;
        tBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 2;
        trail = [{ t: performance.now(), y: tY }];
      },
      { passive: true },
    );
    body.addEventListener(
      'touchmove',
      (e) => {
        if (!tOn) return;
        const down = e.touches[0].clientY - tY;
        if (!tMoved) {
          if (Math.abs(down) < 5) return;
          if (!(down > 0 ? tTop : tBottom)) {
            tOn = false;
            return;
          } // not at the edge in that direction: the list scrolls
          tMoved = true;
          el.classList.add('dragging');
          search.foldBar();
        }
        track(e.touches[0].clientY);
        sheet.drag(clampH(tH - down));
      },
      { passive: true },
    );
    const tEnd = () => {
      if (!tOn) return;
      tOn = false;
      if (!tMoved) return;
      release(tH, tState);
    };
    body.addEventListener('touchend', tEnd);
    body.addEventListener('touchcancel', tEnd);
    // a mouse wheel scrolling up past the top folds it too
    let wheelAt = 0;
    body.addEventListener(
      'wheel',
      (e) => {
        if (onPage() || Date.now() - wheelAt < 700) return;
        const st = sheet.state.value;
        if (st !== 'peek' && body.scrollTop === 0 && e.deltaY < -20) {
          wheelAt = Date.now();
          sheet.set(st === 'full' ? 'half' : 'peek');
        } else if (st === 'half' && e.deltaY > 20 && body.scrollTop + body.clientHeight >= body.scrollHeight - 2) {
          wheelAt = Date.now();
          sheet.set('full');
        }
      },
      { passive: true },
    );
  }
}
