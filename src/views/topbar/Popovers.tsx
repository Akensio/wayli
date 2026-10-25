// The two popovers under the option chips, each closed by Done (or a tap elsewhere, or Go): when (now, depart at or
// arrive by; for the last two a calendar day, an hour and a minute on three wheels, set on Done as a draft) and bicycle
// (none, to the stop, take it along; folding once a bike is chosen). The trip is planned again on close.
import { Icon } from '../../widgets/Icon';
import { Wheel } from '../../widgets/Wheel';
import { t, lang } from '../../lib/i18n';
import { dayShort, calendarOf, calToday } from '../../lib/time';
import * as search from '../../state/search';

const Seg = <T extends string>({ id, value, options, onPick }: { id: string; value: T; options: { v: T; label: string }[]; onPick: (v: T) => void }) => (
  <div class="seg pill" id={id}>
    {options.map((o) => <button type="button" data-mode={o.v} aria-pressed={o.v === value} onClick={() => onPick(o.v)}>{o.label}</button>)}
  </div>
);

const two = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, h) => ({ key: two(h), label: two(h) }));
const MINUTES = Array.from({ length: 60 }, (_, m) => ({ key: two(m), label: two(m) }));

export function WhenPopover() {
  void lang.value;
  const w = search.whenDraft.value; if (!w) return null;
  const set = (patch: Partial<search.When>) => { const d = search.whenDraft.value; if (d) search.whenDraft.value = { ...d, ...patch }; };   // two wheels can turn at once
  const rtl = lang.value === 'he';
  const day = <Wheel id="dayWheel" class="day" label={t('wheelDay')} items={search.calDays.value.map((d) => ({ key: d, label: dayShort(d) }))} value={w.cal} onChange={(cal) => set({ cal })} />;
  const time = <>
    <Wheel id="hourWheel" class="num" label={t('wheelHour')} items={HOURS} value={w.hh} onChange={(hh) => set({ hh })} />
    <span class="colon">:</span>
    <Wheel id="minuteWheel" class="num" label={t('wheelMinute')} items={MINUTES} value={w.mm} onChange={(mm) => set({ mm })} />
  </>;
  return (
    <div id="whenBody">
      <Seg id="timeMode" value={w.mode} onPick={(mode) => set({ mode })}
        options={[{ v: 'now' as const, label: t('now') }, { v: 'depart' as const, label: t('departAt') }, { v: 'arrive' as const, label: t('arriveBy') }]} />
      {w.mode !== 'now' && (
        // the time reads left to right in every language; the day sits on the side the language starts from
        <div class="wheels" dir="ltr"><div class="band" />{rtl ? <>{time}{day}</> : <>{day}{time}</>}</div>
      )}
    </div>
  );
}

export function BikePopover() {
  void lang.value;
  const touch = () => { search.optDirty.value = true; };
  return (
    <div id="bikeBody">
      <Seg id="bikeMode" value={search.bike.value} onPick={(v) => { search.bike.value = v; touch(); }}
        options={[{ v: 'none' as const, label: t('bikeNone') }, { v: 'park' as const, label: t('bikePark') }, { v: 'along' as const, label: t('bikeAlong') }]} />
      <label class="check pilltoggle" id="foldingRow" hidden={search.bike.value === 'none'}>
        <input type="checkbox" id="folding" checked={search.folding.value} onChange={(e) => { search.folding.value = (e.currentTarget as HTMLInputElement).checked; touch(); }} /> <span>{t('folding')}</span>
      </label>
    </div>
  );
}

/** The chips' texts, shared with the summary box: short, so the bicycle chip keeps its room ("18:30", "By 19:00",
 *  "Tomorrow 08:00"; the day only when it is not today, by the calendar). */
function timeChipText(): string {
  if (!search.timeTouched.value) return t('now');
  const { cal, time } = calendarOf(search.day.value, search.atSeconds());
  const day = cal !== calToday() ? dayShort(cal) + ' ' : '';
  return `${search.timeMode.value === 'arrive' ? t('arriveByShort') + ' ' : ''}${day}${time}`;
}
function bikeChipText(): string {
  const b = search.bike.value;
  return t(b === 'along' ? 'bikeAlong' : b === 'park' ? 'bikePark' : 'bikeNone') + (b !== 'none' && search.folding.value ? ' · ' + t('folding') : '');
}
export const TimeChipInner = () => <><Icon name="clock" /> {timeChipText()}</>;
export const BikeChipInner = () => <><Icon name="bike" /> {bikeChipText()}</>;
