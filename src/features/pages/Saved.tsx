// Saved places (home, work, more), saved trips and saved stops, all on this device.
import { Icon } from '../../ui/Icon';
import { placeName, named } from '../../state/names';
import { FromTo } from '../../ui/FromTo';
import { t, lang } from '../../i18n';
import { toast } from '../../ui/toast';
import { savedPlaces, favs } from '../../store.js';
import * as saved from '../../state/saved';
import * as results from '../../state/results';
import { StopList } from './StopList';
import type { Place } from '../../state/search';
import type { Stop } from '../../state/nearby';

type SavedTrip = { from: Place; to: Place; bike: string; folding?: boolean };

export function Saved() {
  void lang.value; void saved.tick.value;
  const sp = savedPlaces.get() as { home: Place | null; work: Place | null; more: Place[] };
  const trips = favs.get('trips') as Record<string, SavedTrip>, stops = favs.get('stops') as Record<string, Stop>;
  const choose = async (slot: 'home' | 'work') => { const c = await saved.hooks.choosePlace(t(slot === 'home' ? 'chooseHome' : 'chooseWork')); if (c) { savedPlaces.set(slot, c); saved.refresh(); } };
  return (
    <>
      <h2 class="sec">{t('savedPlaces')}</h2>
      <div id="savedPlaces" class="stops-list">
        {(['home', 'work'] as const).map((slot) => { const p = sp[slot]; return (
          <div class="saved-row" key={slot}>
            <span class="ic"><Icon name={slot === 'home' ? 'home' : 'work'} /></span>
            <span class="txt" onClick={() => (p ? saved.hooks.planTo(named(p)) : choose(slot))}><span class={`name${p ? '' : ' unset'}`}>{p ? placeName(p) : t('notSet')}</span><small>{t(slot)}</small></span>
            <button type="button" class="ghost" onClick={() => choose(slot)}>{p ? t('change') : '+'}</button>
          </div>
        ); })}
        {sp.more.map((p) => (
          <div class="saved-row">
            <span class="ic"><Icon name="star" /></span>
            <span class="txt" onClick={() => saved.hooks.planTo(named(p))}><span class="name">{placeName(p)}</span></span>
            <button type="button" class="ghost" onClick={() => { savedPlaces.remove(p); saved.refresh(); toast(t('removed')); }}><Icon name="close" /></button>
          </div>
        ))}
        <button type="button" class="ghost" style="margin-bottom:8px" onClick={async () => { const c = await saved.hooks.choosePlace(t('choosePlace')); if (c) { savedPlaces.add(c); saved.refresh(); toast(t('saved')); } }}>{t('addPlace')}</button>
      </div>
      <h2 class="sec">{t('favTrips')}</h2>
      <div id="favTrips">
        {!Object.keys(trips).length && <div class="empty">{t('favEmptyTrips')}</div>}
        {Object.values(trips).map((v) => (
          <div class="journey" onClick={() => results.hooks.replan({ from: named(v.from), to: named(v.to), bike: v.bike, folding: !!v.folding, day: '', at: '', arriveBy: false })}>
            <div class="top"><span class="times"><FromTo from={placeName(v.from)} to={placeName(v.to)} /></span></div>
            <div class="sub">{v.bike !== 'none' && <><Icon name="bike" /> </>}{t(v.bike === 'along' ? 'bikeAlong' : v.bike === 'park' ? 'bikePark' : 'bikeNone')}</div>
          </div>
        ))}
      </div>
      <h2 class="sec">{t('favStops')}</h2>
      <div id="favStops" class="stops-list"><StopList stops={Object.values(stops)} onStop={saved.hooks.openStop} onLine={saved.hooks.openLine} /></div>
    </>
  );
}
