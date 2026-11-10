// Rides between two stops as rows: when each leaves and arrives as it stands now (the listed time struck beside a live
// one that differs), how long it takes, where it heads, and the countdown. One list for the trains between two stations
// and for the other rides doing a journey's leg.
import { Icon } from '../../widgets/Icon';
import { t } from '../../common/i18n';
import { nowOn } from '../../engine/clock.ts';
import * as live from '../../state/live';
import { now } from '../../state/clock';
import { dur } from '../../text/durations';
import { liveClass } from '../../text/live';
import { timeAt, toCome } from '../../trip/now';
import type { TrainRow } from '../../worker/ops.ts';
import { LineChip } from '../../widgets/LineChip';
import { ShownTime } from '../../widgets/ShownTime';
import { InCell } from '../../widgets/LiveMark';
import { Tappable } from '../../widgets/Tappable';

type Props = {
  rows: TrainRow[];
  day: string;
  counting: boolean; // the list is for now: countdowns
  mine?: number | null; // the trip a journey rides, marked
  stops?: boolean; // say how many stops each makes
  onOpen: (trip: number, stop: number) => void;
};

export function RideRows({ rows, day, counting, mine = null, stops = false, onOpen }: Props) {
  void now.value;
  const n = nowOn(day);
  // each ride as it stands now; for a list from now, the ones still to come (and the journey's own), as they leave
  const list = rows
    .map((r) => ({
      r,
      dep: timeAt(live.at, r.trip, r.boardPos, r.dep, n),
      arr: timeAt(live.at, r.trip, r.alightPos, r.arr, n),
    }))
    .filter(({ r, dep }) => !counting || r.trip === mine || toCome(dep, n));
  if (counting) list.sort((a, b) => a.dep.time - b.dep.time);
  return (
    <>
      {list.map(({ r, dep, arr }) => {
        const cls = `time${liveClass(dep.live)}`;
        return (
          <Tappable
            class={`trainrow${dep.live?.passed ? ' gone' : ''}${r.trip === mine ? ' mine' : ''}`}
            key={r.trip}
            onClick={() => onOpen(r.trip, r.fromStop)}
          >
            <ShownTime planned={r.dep} live={dep.live ? dep.time : null} class={cls} />
            <span class="arrow">
              <Icon name="chevronEnd" class="chev" />
            </span>
            <ShownTime planned={r.arr} live={arr.live ? arr.time : null} class={cls} />
            <span class="what">
              <span>
                <LineChip line={r.line} routeType={r.routeType} agency={r.agency} /> {dur(arr.time - dep.time)}
                {stops && <> · {r.stops === 1 ? t('stops1') : t('stopsN', { n: r.stops })}</>}
              </span>
              <small>
                <bdi>{t('toward', { headsign: r.headsign })}</bdi>
              </small>
            </span>
            <InCell live={dep.live} time={dep.time} listed={r.dep} day={day} counting={counting} />
          </Tappable>
        );
      })}
    </>
  );
}
