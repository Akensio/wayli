// The two popovers under the option chips: when (depart or arrive, the days as pills, now or a time) and
// bicycle (none, to the stop, take it along; folding once a bike is chosen). A change applies at once.
import { Icon } from '../../ui/Icon';
import { t, lang } from '../../i18n';
import { dayShort } from '../../time';
import * as search from '../../state/search';

const Seg = <T extends string>({ id, value, options, onPick }: { id: string; value: T; options: { v: T; label: string }[]; onPick: (v: T) => void }) => (
  <div class="seg pill" id={id}>
    {options.map((o) => <button type="button" data-mode={o.v} aria-pressed={o.v === value} onClick={() => onPick(o.v)}>{o.label}</button>)}
  </div>
);

export function WhenPopover() {
  void lang.value;
  const touch = () => { search.optDirty.value = true; };
  return (
    <div id="whenBody">
      <Seg id="timeMode" value={search.timeMode.value} onPick={(v) => { search.timeMode.value = v; search.timeTouched.value = true; touch(); }}
        options={[{ v: 'depart' as const, label: t('departAt') }, { v: 'arrive' as const, label: t('arriveBy') }]} />
      <div class="daypills" id="dayPills">
        {search.days.value.map((d) => <button type="button" class={`chipbtn${search.day.value === d ? ' on' : ''}`} data-date={d} onClick={() => { search.chooseDay(d); touch(); }}>{dayShort(d)}</button>)}
      </div>
      <select id="day" hidden value={search.day.value}>{search.days.value.map((d) => <option value={d}>{d}</option>)}</select>
      <div class="timerow">
        <button type="button" class={`chipbtn${search.timeTouched.value ? '' : ' on'}`} id="nowBtn" onClick={() => { search.resetNow(); touch(); }}>{t('now')}</button>
        <input type="time" id="at" class="timepill" value={search.at.value} onInput={(e) => { search.at.value = (e.currentTarget as HTMLInputElement).value; search.timeTouched.value = true; touch(); }} onChange={(e) => search.typeAt((e.currentTarget as HTMLInputElement).value)} />
      </div>
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

/** The chips' texts, shared with the summary box. */
export function timeChipText(): string {
  const o = search.options();
  if (!o.timeTouched) return t('now');
  return `${o.arriveBy ? t('arriveBy') + ' ' : ''}${o.day ? dayShort(o.day) : ''} ${o.at}`;
}
export function bikeChipText(): string {
  const b = search.bike.value;
  return t(b === 'along' ? 'bikeAlong' : b === 'park' ? 'bikePark' : 'bikeNone') + (b !== 'none' && search.folding.value ? ' · ' + t('folding') : '');
}
export const TimeChipInner = () => <><Icon name="clock" /> {timeChipText()}</>;
export const BikeChipInner = () => <><Icon name="bike" /> {bikeChipText()}</>;
