// One leg of a journey as a row, the look the detail (DetailLeg) and the follow screen (follow/FollowLeg) share: the
// times down the side, a dot in the line's colour, and what to do: a ride's line chip with what the screen says of it,
// or the walk or bicycle ride in words. Each screen fills the times and the ride's words; the frame lays them out.
// Also here, for both screens: an estimated time's mark, and a ride's stops along it as a fold.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { t } from '../../common/i18n';
import { fmt } from '../../common/time';
import { routeColor } from '../../widgets/lineColors';
import { legMinutes } from '../../text/durations';
import { isRide } from '../../trip/journey';
import type { Leg, WalkLeg, StopAlong } from '../../trip/journey';
import { LineChip } from '../../widgets/LineChip';
import { Fold } from '../../widgets/Fold';
import { exitText } from '../../text/travel';

/** A walk or a bicycle ride in words: to where it goes, or from where it starts when it ends the journey. */
export function walkText(l: WalkLeg): string {
  const min = legMinutes(l.seconds);
  // the station entrance the walk comes out of or goes in by, when the station has them
  const doors = [exitText(l.exit, false), exitText(l.entry, true)]
    .filter(Boolean)
    .map((x) => ` · ${x}`)
    .join('');
  if (l.type === 'egress')
    return (
      (l.mode === 'bike' ? t('bikeFrom', { min, name: l.from!.name }) : t('walkFrom', { min, name: l.from!.name })) +
      doors
    );
  return (l.mode === 'bike' ? t('bikeTo', { min, name: l.to!.name }) : t('walkTo', { min, name: l.to!.name })) + doors;
}

/** A time of a leg as shown down the side: an estimated ride's (a line no feed carries) says so with a "~". */
export const legTime = (l: Leg, sec: number): string => (isRide(l) && l.estimated ? '~' : '') + fmt(sec);

type FrameProps = {
  l: Leg;
  cls?: string; // the screen's standing of the leg: done, current, focus
  times: ComponentChildren; // down the side
  onClick?: () => void; // a tap on the leg; never from its chip, nor from what unfolds under it (`folds`, `wide`)
  onChip?: () => void; // a ride's chip, when its line can be opened
  head?: ComponentChildren; // a ride: what the screen says of it, after the chip
  folds?: ComponentChildren; // a ride: what opens under its words (its stops, its other rides)
  wide?: ComponentChildren; // a ride: a row of its own under the leg, the whole width of the list
};

/** The frame of one leg. A tap on the leg is the screen's (`onClick`); a tap on the chip opens the line instead, and a
 *  tap inside `folds` or `wide` is theirs alone (a fold opened is not a ride focused). */
export function LegFrame({ l, cls = '', times, onClick, onChip, head, folds, wide }: FrameProps) {
  const foldsRef = useRef<HTMLDivElement>(null),
    wideRef = useRef<HTMLDivElement>(null);
  const inside = (e: MouseEvent) =>
    [foldsRef.current, wideRef.current].some((el) => el && el.contains(e.target as Node));
  if (!isRide(l))
    return (
      <div class={`leg ${l.type}${cls ? ' ' + cls : ''}`} onClick={onClick}>
        <span class="t">{times}</span>
        <span class="dot" />
        <span class="what">{walkText(l)}</span>
      </div>
    );
  return (
    <div
      class={`leg ${l.type} t${l.routeType}${cls ? ' ' + cls : ''}`}
      onClick={
        onClick
          ? (e) => {
              if (!inside(e)) onClick();
            }
          : undefined
      }
    >
      <span class="t">{times}</span>
      <span class="dot" style={{ background: routeColor(l.routeType, l.agency) }} />
      <span class="what">
        <LineChip
          line={l.line}
          routeType={l.routeType}
          agency={l.agency}
          onClick={
            onChip && l.route != null
              ? (e) => {
                  e.stopPropagation();
                  onChip();
                }
              : undefined
          }
        />{' '}
        {head}
        {folds && <div ref={foldsRef}>{folds}</div>}
      </span>
      {wide && (
        <div class="wide" ref={wideRef}>
          {wide}
        </div>
      )}
    </div>
  );
}

type StopsProps = {
  stops: StopAlong[];
  opens?: boolean; // opens by itself when this turns true (following: the current ride)
  passedUpTo?: number | null; // following on board: the rider's own stop index, which outranks the vehicle's word
};

/** A ride's stops as a fold: each at its time as it stands now (the listed one struck beside it when a minute or more
 *  apart), the passed ones dimmed, the next one tagged, the last one in bold. */
export function StopsAlongFold({ stops, opens, passedUpTo }: StopsProps) {
  const [open, setOpen] = useState(!!opens);
  useEffect(() => {
    if (opens) setOpen(true);
  }, [opens]); // opens when the ride becomes the current one
  return (
    <>
      <Fold open={open} onClick={() => setOpen(!open)}>
        {open ? t('hideStops') : t('showStops')}
      </Fold>
      <div class="stoplist" hidden={!open}>
        {stops.map((s, k) => {
          const listed = s.sched ?? s.arr;
          const passed = passedUpTo != null ? k <= passedUpTo : !!s.passed,
            next = passedUpTo != null && k === passedUpTo + 1,
            last = k === stops.length - 1;
          return (
            // a loop line can call at a stop twice: its place along the ride tells the two apart
            <div key={`${k}:${s.stop}`} class={`${passed ? 'passed' : ''}${next ? ' next' : ''}${last ? ' last' : ''}`}>
              <span>
                {Math.abs(s.arr - listed) >= 60 ? (
                  <>
                    <s>{fmt(listed)}</s> {fmt(s.arr)}
                  </>
                ) : (
                  fmt(s.arr)
                )}
              </span>
              <span>
                {s.name}
                {next && <small class="tag"> {t('nextTag')}</small>}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
