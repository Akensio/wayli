// Saved places (home, work, more), saved trips, lines and stops, all on this device.
import { Icon } from '../../widgets/Icon';
import { placeName, named } from '../../state/names';
import { FromTo } from '../../widgets/FromTo';
import { t, lang } from '../../lib/i18n';
import { bikeText } from '../../display/travel';
import { toast } from '../../widgets/toast';
import { savedPlaces, favs, stored } from '../../state/store.ts';
import { StopList } from './StopList';
import type { Place } from '../../state/search';
import { ViewRow } from '../../widgets/ViewRow';
import * as chooser from '../../state/chooser';
import { planTo, replan, openView } from '../../controllers/planner';
import { openStop } from '../../controllers/stop';
import { openLine } from '../../controllers/line';
import { Tappable } from '../../widgets/Tappable';

export function Saved() {
  void lang.value;
  void stored.value;
  const sp = savedPlaces.get() as { home: Place | null; work: Place | null; more: Place[] };
  const trips = favs.get('trips'),
    stops = favs.get('stops'),
    lines = favs.get('lines');
  const choose = async (slot: 'home' | 'work') => {
    const c = await chooser.open(t(slot === 'home' ? 'chooseHome' : 'chooseWork'));
    if (c) {
      savedPlaces.set(slot, c);
    }
  };
  return (
    <>
      <h2 class="sec">{t('savedPlaces')}</h2>
      <div id="savedPlaces" class="stops-list">
        {(['home', 'work'] as const).map((slot) => {
          const p = sp[slot];
          return (
            <div class="saved-row" key={slot}>
              <span class="ic">
                <Icon name={slot === 'home' ? 'home' : 'work'} />
              </span>
              <Tappable tag="span" class="txt" onClick={() => (p ? planTo(named(p)) : choose(slot))}>
                <span class={`name${p ? '' : ' unset'}`}>{p ? placeName(p) : t('notSet')}</span>
                <small>{t(slot)}</small>
              </Tappable>
              <button type="button" class="ghost" onClick={() => choose(slot)}>
                {p ? t('change') : '+'}
              </button>
            </div>
          );
        })}
        {sp.more.map((p) => (
          <div class="saved-row" key={`${p.name}|${p.lat},${p.lon}`}>
            <span class="ic">
              <Icon name="star" />
            </span>
            <Tappable tag="span" class="txt" onClick={() => planTo(named(p))}>
              <span class="name">{placeName(p)}</span>
            </Tappable>
            <button
              type="button"
              class="ghost"
              onClick={() => {
                savedPlaces.remove(p);
                toast(t('removed'));
              }}
            >
              <Icon name="close" />
            </button>
          </div>
        ))}
        <button
          type="button"
          class="ghost"
          style="margin-bottom:8px"
          onClick={async () => {
            const c = await chooser.open(t('choosePlace'));
            if (c) {
              savedPlaces.add(c);
              toast(t('saved'));
            }
          }}
        >
          {t('addPlace')}
        </button>
      </div>
      <h2 class="sec">{t('favTrips')}</h2>
      <div id="favTrips">
        {!Object.keys(trips).length && <div class="empty">{t('favEmptyTrips')}</div>}
        {Object.entries(trips).map(([k, v]) => (
          <Tappable
            key={k}
            class="journey"
            onClick={() =>
              replan({
                from: named(v.from),
                to: named(v.to),
                bike: v.bike,
                folding: !!v.folding,
                day: '',
                at: '',
                arriveBy: false,
              })
            }
          >
            <div class="top">
              <span class="times">
                <FromTo from={placeName(v.from)} to={placeName(v.to)} />
              </span>
            </div>
            <div class="sub">
              {v.bike !== 'none' && (
                <>
                  <Icon name="bike" />{' '}
                </>
              )}
              {bikeText(v.bike)}
            </div>
          </Tappable>
        ))}
      </div>
      {Object.keys(lines).length > 0 && (
        <>
          <h2 class="sec">{t('favLines')}</h2>
          <div id="favLines">
            {Object.values(lines).map((v, i) => (
              <ViewRow key={i} v={v} onOpen={openView} />
            ))}
          </div>
        </>
      )}
      <h2 class="sec">{t('favStops')}</h2>
      <div id="favStops" class="stops-list">
        <StopList stops={Object.values(stops)} onStop={(s) => openStop(s)} onLine={(r) => openLine(r)} />
      </div>
    </>
  );
}
