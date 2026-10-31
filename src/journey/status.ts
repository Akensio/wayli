// The notification's line for a trip being followed (controllers/alerts.ts tripStatus): what to do next, in words.
import { t } from '../lib/i18n';
import { fmt } from '../lib/time';
import { lineText } from './format';
import type { FollowView } from './follow.ts';

/** The title and the body for the step the rider is at, or null once arrived. `liveTime`: the vehicle's live time at
 *  the stop that matters (to board while waiting, to get off on board), null without one; `now` and the times are
 *  seconds on the service day. */
export function statusLine(v: FollowView, dest: string, liveTime: number | null, now: number): [string, string] | null {
  if (v.kind === 'done') return null;
  const asOf = t('statusAsOf', { time: fmt(now) });
  if (v.kind === 'ride') {
    const l = v.leg,
      at = liveTime ?? l.arrive;
    const body =
      v.stopsLeft <= 1
        ? t('statusLast', { name: v.alight.name, time: fmt(at) })
        : t('statusRide', { n: v.stopsLeft, name: v.alight.name, time: fmt(at) });
    return [t('followTitle', { line: lineText(l.line), to: dest }), `${body} · ${asOf}`];
  }
  if (v.kind === 'wait') {
    const l = v.leg,
      at = liveTime ?? l.depart;
    return [
      t('followTitle', { line: lineText(l.line), to: dest }),
      `${t('statusWait', { line: lineText(l.line), stop: l.from?.name ?? '', time: fmt(at) })} · ${asOf}`,
    ];
  }
  const l = v.leg;
  return [
    v.toRide ? t('followTitle', { line: lineText(v.toRide.line), to: dest }) : t('walkTitle', { to: dest }),
    `${v.kind === 'final' ? t('walkToDest', { min: v.minutes, name: dest }) : t('walkTo', { min: v.minutes, name: l.to?.name ?? '' })} · ${asOf}`,
  ];
}
