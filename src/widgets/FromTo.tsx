// "From → to" with each name isolated: a Hebrew name in the English interface, or an English one in Hebrew, keeps
// its own direction instead of reordering the whole line; the arrow points the way the interface reads.
import { lang } from '../lib/i18n';

export const FromTo = ({ from, to }: { from: string; to: string }) => (
  <span class="fromto">
    <bdi>{from}</bdi>
    <span class="arrow">{lang.value === 'he' ? '←' : '→'}</span>
    <bdi>{to}</bdi>
  </span>
);
