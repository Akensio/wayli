// Swipe to close: a layer (the menu drawer, the settings page) follows a finger moving it back the way it came, and
// closes past a third of its width or on a flick; otherwise it slides back. The handlers go on the layer and on
// anything else that should drag it (the dimmed map beside the drawer). A vertical move is left to scrolling, and a
// tap stays a tap; the click that ends a drag is swallowed.
import { useRef } from 'preact/hooks';
import type { RefObject } from 'preact';

type Opts = {
  layer: RefObject<HTMLElement>; // what moves
  fade?: RefObject<HTMLElement>; // what fades with it (the backdrop)
  dir: () => 1 | -1; // the closing direction on screen: +1 to the right, -1 to the left
  onClose: () => void;
};

export function useSwipeClose({ layer, fade, dir, onClose }: Opts) {
  const drag = useRef<{ x: number; y: number; t: number; dx: number; on: boolean; id: number; el: HTMLElement } | null>(
    null,
  );
  const follow = (dx: number) => {
    const l = layer.current;
    if (!l) return;
    l.style.transition = 'none';
    l.style.transform = `translateX(${dx}px)`;
    const f = fade?.current;
    if (f) {
      f.style.transition = 'none';
      f.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / l.offsetWidth));
    }
  };
  const release = () => {
    for (const el of [layer.current, fade?.current])
      if (el) {
        el.style.transition = '';
        el.style.transform = '';
        el.style.opacity = '';
      }
  };
  return {
    onPointerDown: (e: PointerEvent) => {
      drag.current = {
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
        dx: 0,
        on: false,
        id: e.pointerId,
        el: e.currentTarget as HTMLElement,
      };
    },
    onPointerMove: (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x,
        dy = e.clientY - d.y;
      if (!d.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          drag.current = null;
          return;
        } // a vertical scroll
        if (dx * dir() < 10) return;
        d.on = true;
        try {
          d.el.setPointerCapture(e.pointerId);
        } catch {
          /* released already */
        }
      }
      d.dx = dir() > 0 ? Math.max(0, dx) : Math.min(0, dx);
      follow(d.dx);
    },
    onPointerUp: (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d || !d.on) return;
      const w = layer.current?.offsetWidth || 300,
        speed = Math.abs(d.dx) / Math.max(1, e.timeStamp - d.t);
      const shut = Math.abs(d.dx) > w / 3 || speed > 0.6;
      // the click that ends a drag is not a tap (it comes before the timer)
      const el = d.el,
        swallow = (c: Event) => {
          c.stopPropagation();
          c.preventDefault();
        };
      el.addEventListener('click', swallow, { capture: true });
      setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 0);
      release(); // from where the finger left it, the layer goes on (closing) or back (staying)
      if (shut) onClose();
    },
    onPointerCancel: () => {
      drag.current = null;
      release();
    },
  };
}
