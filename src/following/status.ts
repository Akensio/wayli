// The notification's line for a trip being followed (controllers/alerts.ts tripStatus): what to do next, in words.
import { t } from '../common/i18n';
import { fmt } from '../common/time';
import { lineText } from '../text/travel';
import type { FollowView } from './follow.ts';

/** The title and the body for the step the rider is at, or null once arrived. The view is of the trip as it stands
 *  now (trip/now.ts), so its times are the ones to say; `now` and the times are seconds on the service day. */
export function statusLine(v: FollowView, dest: string, now: number): [string, string] | null {
  if (v.kind === 'done') return null;
  const asOf = t('statusAsOf', { time: fmt(now) });
  if (v.kind === 'ride') {
    const l = v.leg,
      at = l.arrive;
    const body =
      v.stopsLeft <= 1
        ? t('statusLast', { name: v.alight.name, time: fmt(at) })
        : t('statusRide', { n: v.stopsLeft, name: v.alight.name, time: fmt(at) });
    return [t('followTitle', { line: lineText(l.line), to: dest }), `${body} · ${asOf}`];
  }
  if (v.kind === 'wait') {
    const l = v.leg,
      at = l.depart;
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
