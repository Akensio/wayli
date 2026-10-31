// What the map's bubbles and markers show, as components: a vehicle's bubble, a stop's, a tapped place's, the picked
// point's, and a vehicle's marker. popups.ts opens them in MapLibre's popups (rendered with Preact into the popup's
// element, unmounted when it closes); nothing on the map is built from HTML strings.
import type { Signal } from '@preact/signals';
import { t } from '../lib/i18n';
import { fmt, timeOf } from '../lib/time';
import * as delays from '../engine/delays.ts';
import { agencyName } from '../journey/agencies';
import { delayText, signed } from '../journey/format';
import { LineChip } from '../widgets/LineChip';
import { Icon } from '../widgets/Icon';
import type { IconName } from '../widgets/icons';
import type { StopInfo } from '../worker/ops.ts';

/** A vehicle as its bubble shows it. */
export type VehicleInfo = {
  line: string;
  routeType: number;
  headsign: string;
  agency: string;
  delay?: number | null;
  stale: boolean;
  seen: Date;
  velocity?: number | null;
  trip: number;
  route: number | null;
  offDay?: boolean;
};

/** A vehicle's bubble: line, direction, operator, when it reported (and how long ago when that is a while), speed,
 *  how late it runs; its line, with its trip chosen. */
export function VehicleBubble({ v, onLine }: { v: VehicleInfo; onLine: () => void }) {
  const d = v.delay != null ? delays.delayMinutes(v.delay) : null;
  const ago = Date.now() - new Date(v.seen).getTime();
  return (
    <div class="pop">
      <div class="row">
        <LineChip line={v.line} routeType={v.routeType} agency={v.agency} />
        <b>{v.headsign ? t('toward', { headsign: v.headsign }) : ''}</b>
      </div>
      <div class="muted">
        {v.agency && (
          <>
            <bdi>{agencyName(v.agency)}</bdi> ·{' '}
          </>
        )}
        {t('seenAgo', { time: timeOf(v.seen) })}
        {ago >= 180e3 ? ` (${t('agoMin', { n: Math.round(ago / 60000) })})` : ''}
        {v.velocity != null ? ` · ${Math.round(v.velocity)} ${t('kmh')}` : ''}
      </div>
      {d != null && (
        <div>
          <span class={`live ${v.stale ? 'unsure' : 'ok'}`}>
            {delayText(d)}
            {v.stale ? ' ?' : ''}
          </span>
        </div>
      )}
      {v.offDay ? (
        // a line the feed has no trips of today (it reports anyway): named, nothing to open
        <div class="muted">{t('offDayLine')}</div>
      ) : (
        <div class="row">
          <button type="button" class="ghost" disabled={!(v.trip >= 0 || v.route != null)} onClick={onLine}>
            {t('popLine')}
          </button>
        </div>
      )}
    </div>
  );
}

/** What a stop's bubble offers; `times` only on a line's page (the line as a timetable at this stop). */
export type StopActions = {
  times?: () => void;
  stop: () => void;
  from: () => void;
  to: () => void;
  line: (route: number) => void;
};
/** A stop's bubble: its name, city and sign number, when what the sheet holds passes it, its lines, and the actions. */
export function StopBubble({
  info,
  at,
  onLine,
  act,
}: {
  info: StopInfo;
  at: number | null;
  onLine: boolean;
  act: StopActions;
}) {
  return (
    <div class="pop">
      <b>{info.name}</b>
      <div class="muted">
        {info.city || ''}
        {info.code ? ' · ' + info.code : ''}
      </div>
      {at != null && <div class="pop-at">{t(onLine ? 'lineHere' : 'rideHere', { time: fmt(at) })}</div>}
      <div class="chips">
        {info.lines.slice(0, 8).map((l, i) => (
          <LineChip
            key={i}
            line={l.label}
            routeType={l.type}
            agency={l.agency}
            onClick={l.route != null ? () => act.line(l.route!) : undefined}
          />
        ))}
      </div>
      <div class="row">
        {act.times && (
          <button type="button" class="primary slim" onClick={act.times}>
            {t('timesHere')}
          </button>
        )}
        <button type="button" class="ghost" onClick={act.stop}>
          {t('stopDetails')}
        </button>
        <button type="button" class="ghost" onClick={act.from}>
          {t('fromHere')}
        </button>
        <button type="button" class="ghost" onClick={act.to}>
          {t('toHere')}
        </button>
      </div>
    </div>
  );
}

/** A tapped place: its name (filled in when the reverse geocoding answers), to here and from here. */
export function PlaceBubble({ name, to, from }: { name: Signal<string>; to: () => void; from: () => void }) {
  return (
    <div class="pop">
      <b>{name.value}</b>
      <div class="row">
        <button type="button" class="primary slim" onClick={to}>
          {t('toHere')}
        </button>
        <button type="button" class="ghost" onClick={from}>
          {t('fromHere')}
        </button>
      </div>
    </div>
  );
}

/** The point picked on the map: its name (filled in later), whether it is a stop, and Choose. */
export function PickBubble({ name, stop, choose }: { name: Signal<string>; stop: boolean; choose: () => void }) {
  return (
    <div class="pop">
      <b>{name.value}</b>
      {stop && <div class="muted">{t('kindStop')}</div>}
      <div class="row">
        <button type="button" class="primary slim" onClick={choose}>
          {t('choose')}
        </button>
      </div>
    </div>
  );
}

/** A vehicle's marker: what runs, the minutes late on the rider's own vehicle (the bubble has them for the rest), and
 *  a triangle on the rim pointing where it heads (`heading` in degrees, -1 for none). */
export function VehicleMark({ icon, delayMin, heading }: { icon: IconName; delayMin: number | null; heading: number }) {
  return (
    <>
      <Icon name={icon} />
      {delayMin != null ? ` ${signed(delayMin)}` : ''}
      {heading >= 0 && <span class="heading" style={{ transform: `rotate(${heading}deg)` }} />}
    </>
  );
}
