// A departure and an arrival time, the earlier on the left in every language (times read left to right, also
// in Hebrew), with the arrow pointing from one to the other.
import { fmt } from '../lib/time';

export const TimeRange = ({ from, to, class: cls = 'times' }: { from: number; to: number; class?: string }) => (
  <span class={cls} dir="ltr">
    {fmt(from)} → {fmt(to)}
  </span>
);
