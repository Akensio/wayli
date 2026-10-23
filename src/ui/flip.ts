// Layout changes that animate themselves (FLIP: first, last, invert, play). Mark the parts of a component with
// `data-flip="name"` and call useFlip with the state that reshapes it: when that state changes, each part that
// stayed glides from where it was to where it is, each new part pops in (unless it has a CSS entrance of its own),
// and each part that went fades out where it was, as a copy, since the real one is already gone. Every change of
// that state animates the same way, whatever it was and whatever it became.
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';

type Box = { left: number; top: number; width: number; height: number };
type Seen = Map<string, { el: HTMLElement; rect: Box }>;
const EASE = 'cubic-bezier(.2, .8, .2, 1)';

/** Where an element is laid out inside `root`, leaving out any transform (a part still playing its entrance is
 *  measured where it will be, not where the animation has it this frame). */
function box(el: HTMLElement, root: HTMLElement): Box {
  let left = 0, top = 0, e: HTMLElement | null = el;
  while (e && e !== root) { left += e.offsetLeft; top += e.offsetTop; e = e.offsetParent as HTMLElement | null; }
  return { left, top, width: el.offsetWidth, height: el.offsetHeight };
}
/** The marked parts of `root` that are on screen now, with where they are. */
function measure(root: HTMLElement): Seen {
  const out: Seen = new Map();
  for (const el of root.querySelectorAll<HTMLElement>('[data-flip]')) {
    if (!el.getClientRects().length) continue;   // hidden (or inside something hidden)
    out.set(el.dataset.flip!, { el, rect: box(el, root) });
  }
  return out;
}

function play(before: Seen, after: Seen, root: HTMLElement): void {
  for (const [k, a] of after) {
    const b = before.get(k);
    if (b) {
      const dx = b.rect.left - a.rect.left, dy = b.rect.top - a.rect.top;
      if (Math.abs(dx) + Math.abs(dy) > 1) a.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 340, easing: EASE });
    } else if (getComputedStyle(a.el).animationName === 'none') {
      a.el.animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 280, delay: 80, easing: EASE, fill: 'backwards' });
    }
  }
  for (const [k, b] of before) {
    if (after.has(k)) continue;
    // the copy goes where the original was, inside the same component so its styles still apply (ids too: the real
    // element comes first in the document, so lookups by id still find it)
    const ghost = b.el.cloneNode(true) as HTMLElement;
    ghost.classList.add('flip-ghost'); ghost.removeAttribute('hidden'); ghost.removeAttribute('data-flip'); ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
    Object.assign(ghost.style, { position: 'absolute', left: `${b.rect.left}px`, top: `${b.rect.top}px`, width: `${b.rect.width}px`, height: `${b.rect.height}px`,
      margin: '0', pointerEvents: 'none', zIndex: '0', animation: 'none' });
    root.appendChild(ghost);
    ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).onfinish = () => ghost.remove();
  }
}

/** Animate the marked parts of `root` whenever `key` changes (any change, from any state to any other). A null key
 *  (before or after) does not animate: the component has motion of its own then (opening, closing). */
export function useFlip(root: RefObject<HTMLElement>, key: string | null): void {
  const seen = useRef<Seen>(new Map()), was = useRef(key);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const now = measure(el);
    if (was.current !== key && was.current != null && key != null && !matchMedia('(prefers-reduced-motion: reduce)').matches) play(seen.current, now, el);
    was.current = key;
    seen.current = now;
  });
}
