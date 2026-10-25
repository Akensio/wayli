import type { IconName } from './icons';

/** An icon from the sprite. `chev` marks a chevron that flips in RTL. */
export function Icon({ name, class: cls = '' }: { name: IconName; class?: string }) {
  return <svg class={`i${cls ? ' ' + cls : ''}`} aria-hidden="true"><use href={`#i-${name}`} /></svg>;
}
