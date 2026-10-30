// A fold: the one button that opens or closes what follows it, a label and a chevron that turns when open. Every fold
// in the app is this (the just-left and hurry lines, a timetable's whole day, a ride's stops and its other rides, the
// line page's timetable), so they all look and behave alike. `pill` draws it as a chip.
import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

type Props = {
  open: boolean;
  onClick: () => void;
  children: ComponentChildren;
  pill?: boolean;
  class?: string;
  id?: string;
};

export function Fold({ open, onClick, children, pill, class: cls = '', id }: Props) {
  return (
    <button
      type="button"
      id={id}
      class={`fold${pill ? ' pill' : ''}${open ? ' open' : ''}${cls ? ' ' + cls : ''}`}
      aria-expanded={open}
      onClick={onClick}
    >
      <span>{children}</span>
      <Icon name="chevronDown" />
    </button>
  );
}
