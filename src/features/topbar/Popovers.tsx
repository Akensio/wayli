// The two popovers under the option chips: when (now, depart at or arrive by; for the last two a day, an hour and a
// minute on three wheels) and bicycle (none, to the stop, take it along; folding once a bike is chosen). A change
// applies at once; the trip is planned again when the popover closes.
import { Icon } from '../../ui/Icon';
import { Wheel } from '../../ui/Wheel';
import { t, lang } from '../../i18n';
import { dayShort } from '../../time';
import * as search from '../../state/search';

const Seg = <T extends string>({ id, value, options, onPick }: { id: string; value: T; options: { v: T; label: string }[]; onPick: (v: T) => void }) => (
  <div class="seg pill" id={id}>
    {options.map((o) => <button type="button" data-mode={o.v} aria-pressed={o.v === value} onClick={() => onPick(o.v)}>{o.label}</button>)}
  </div>
);

const two = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, h) => ({ key: two(h), label: two(h) }));
const MINUTES = Array.from({ length: 60 }, (_, m) => ({ key: two(m), label: two(m) }));
type When = 'now' | 'depart' | 'arrive';

export function WhenPopover() {
  void lang.value;
  const touch = () => { search.optDirty.value = true; };
  const when: When = !search.timeTouched.value ? 'now' : search.timeMode.value;
  const pick = (w: When) => {
    if (w === 'now') search.resetNow();
    else { search.timeMode.value = w; search.timeTouched.value = true; }
    touch();
  };
  const [hh, mm] = search.at.value.split(':');
  const setTime = (h: string, m: string) => { search.at.value = `${h}:${m}`; search.timeTouched.value = true; touch(); };
  const rtl = lang.value === 'he';
  const day = <Wheel id="dayWheel" class="day" label={t('wheelDay')} items={search.days.value.map((d) => ({ key: d, label: dayShort(d) }))} value={search.day.value} onChange={(d) => { search.chooseDay(d); touch(); }} />;
  const time = <>
    <Wheel id="hourWheel" class="num" label={t('wheelHour')} items={HOURS} value={hh} onChange={(h) => setTime(h, mm)} />
    <span class="colon">:</span>
    <Wheel id="minuteWheel" class="num" label={t('wheelMinute')} items={MINUTES} value={mm} onChange={(m) => setTime(hh, m)} />
  </>;
  return (
    <div id="whenBody">
      <Seg id="timeMode" value={when} onPick={pick}
        options={[{ v: 'now' as const, label: t('now') }, { v: 'depart' as const, label: t('departAt') }, { v: 'arrive' as const, label: t('arriveBy') }]} />
      {when !== 'now' && (
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
 *  "Tomorrow 08:00"; the day only when it is not today's). */
export function timeChipText(): string {
  const o = search.options();
  if (!o.timeTouched) return t('now');
  const day = o.day && o.day !== search.hooks.startDay() ? dayShort(o.day) + ' ' : '';
  return `${o.arriveBy ? t('arriveByShort') + ' ' : ''}${day}${o.at}`;
}
export function bikeChipText(): string {
  const b = search.bike.value;
  return t(b === 'along' ? 'bikeAlong' : b === 'park' ? 'bikePark' : 'bikeNone') + (b !== 'none' && search.folding.value ? ' · ' + t('folding') : '');
}
export const TimeChipInner = () => <><Icon name="clock" /> {timeChipText()}</>;
export const BikeChipInner = () => <><Icon name="bike" /> {bikeChipText()}</>;
