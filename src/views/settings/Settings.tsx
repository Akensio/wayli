// Settings and more: language, the map's and the menus' look, the longest walk, live data and alerts,
// install, clearing history, about.
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../../widgets/Icon';
import { compassReport } from '../../map/heading';
import { t, lang } from '../../lib/i18n';
import { toast } from '../../widgets/toast';
import { recentPlaces, recentTrips, recentViews, lastSearch, recentKeep, trimRecents, RECENT_CHOICES, stored } from '../../lib/store.js';
import * as settings from '../../state/settings';
import * as app from '../../state/app';
import * as data from '../../state/data';
import type { IconName } from '../../widgets/icons';

const Seg = ({ id, value, options, onPick }: { id: string; value: string; options: { v: string; label: string }[]; onPick: (v: string) => void }) => (
  <div class="seg pill" id={id}>{options.map((o) => <button type="button" data-v={o.v} aria-pressed={o.v === value} onClick={() => onPick(o.v)}>{o.label}</button>)}</div>
);
const Item = ({ icon, label, children, wide = false }: { icon: IconName; label: any; children?: any; wide?: boolean }) => (
  <div class={`item${wide ? ' wide' : ''}`}><span class="ii"><Icon name={icon} /></span><span class="lbl">{label}</span>{children}</div>
);
const Toggle = ({ icon, label, id, on, onChange }: { icon: IconName; label: any; id: string; on: boolean; onChange: (on: boolean) => void }) => (
  <label class="item"><span class="ii"><Icon name={icon} /></span><span class="lbl">{label}</span><span class="switch"><input type="checkbox" id={id} checked={on} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} /><i /></span></label>
);
const Act = ({ icon, label, id, onClick, hidden = false }: { icon: IconName; label: string; id: string; onClick: () => void; hidden?: boolean }) => (
  <button type="button" class="item act" id={id} hidden={hidden} onClick={onClick}><span class="ii"><Icon name={icon} /></span><span class="lbl">{label}</span><Icon name="chevronEnd" class="chev" /></button>
);

export function Settings() {
  void lang.value; void stored.value;
  const s = settings.get();
  const looks = [{ v: 'light', label: t('mapLight') }, { v: 'dark', label: t('mapDark') }, { v: 'system', label: t('mapSystem') }];
  const setWalk = (v: number) => settings.set({ maxWalk: Math.max(3, Math.min(45, Math.round(v) || 15)) });
  const look = (patch: Partial<settings.Settings>) => { settings.set(patch); app.hooks.appearanceChanged(); };
  const feed = app.feedInfo.value;
  const theme = s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system';
  const split = s.lookSplit != null ? !!s.lookSplit : settings.mapChoice() !== theme;   // set apart before this switch existed
  return (
    <>
      <h2 class="sec">{t('settings')}</h2>
      <div class="group">
        <div class="grouphead">{t('grpGeneral')}</div>
        <div class="list">
          <Item icon="globe" label={t('setLang')}><Seg id="setLang" value={lang.value} options={[{ v: 'he', label: 'עברית' }, { v: 'en', label: 'English' }]} onPick={(v) => app.hooks.setLang(v as 'he' | 'en')} /></Item>
          {/* one look for the whole app; the map and the menus apart only when asked */}
          <Item icon="sun" label={t('setLook')}><Seg id="setLook" value={split ? '' : theme} options={looks} onPick={(v) => look({ theme: v, map: v, lookSplit: false })} /></Item>
          <Toggle icon="sliders" id="setSplit" label={t('setSplit')} on={split} onChange={(on) => look(on ? { lookSplit: true } : { lookSplit: false, map: theme })} />
          {split && <>
            <Item icon="map" label={t('setMap')}><Seg id="setMap" value={settings.mapChoice()} options={looks} onPick={(v) => look({ map: v })} /></Item>
            <Item icon="menu" label={t('setTheme')}><Seg id="setTheme" value={theme} options={looks} onPick={(v) => look({ theme: v })} /></Item>
          </>}
          <Item icon="map" label={t('setTint')}><Seg id="setTint" value={s.mapTint === 'neutral' ? 'neutral' : 'teal'} options={[{ v: 'teal', label: t('tintTeal') }, { v: 'neutral', label: t('tintNeutral') }]} onPick={(v) => look({ mapTint: v })} /></Item>
          <Toggle icon="mountain" id="setTerrain" label={<><span>{t('setTerrain')}</span><small>{t('terrainHint')}</small></>} on={!!s.terrain} onChange={(on) => look({ terrain: on })} />
        </div>
      </div>
      <div class="group">
        <div class="grouphead">{t('grpPlan')}</div>
        <div class="list">
          <Item icon="walk" label={<><span>{t('setWalk')}</span><small>{t('setWalkHint')}</small></>}>
            <div class="stepper"><button type="button" id="walkMinus" aria-label="-" onClick={() => setWalk(s.maxWalk - 1)}>−</button><input type="number" id="setWalk" min={3} max={45} inputMode="numeric" value={s.maxWalk} onChange={(e) => setWalk(+(e.currentTarget as HTMLInputElement).value)} /><button type="button" id="walkPlus" aria-label="+" onClick={() => setWalk(s.maxWalk + 1)}>+</button></div>
          </Item>
          <Item icon="pin" wide label={<><span>{t('setStopFilter')}</span><small>{t('setStopFilterHint')}</small></>}>
            <Seg id="setStopFilter" value={['bus', 'rail', 'lrt'].includes(s.stopFilter as string) ? s.stopFilter as string : 'all'} options={[{ v: 'all', label: t('fAll') }, { v: 'bus', label: t('fBus') }, { v: 'rail', label: t('train') }, { v: 'lrt', label: t('lrt') }]} onPick={(v) => settings.set({ stopFilter: v })} />
          </Item>
        </div>
      </div>
      <div class="group">
        <div class="grouphead">{t('grpLive')}</div>
        <div class="list">
          <Toggle icon="live" id="setLive" label={<><span>{t('setLive')}</span><small>{t('liveNote')}</small></>} on={!!s.live} onChange={(on) => settings.set({ live: on })} />
          {data.manifest.value?.bustimes && <Toggle icon="route" id="setTraffic" label={<><span>{t('setTraffic')}</span><small>{t('trafficNote')}</small></>} on={s.traffic !== false} onChange={(on) => settings.set({ traffic: on })} />}
          <Toggle icon="bell" id="setNotify" label={t('setNotify')} on={!!s.notify} onChange={async (on) => { settings.set({ notify: on }); if (on) await app.hooks.requestAlertPermission(); }} />
          <Toggle icon="sound" id="setSound" label={t('setSound')} on={!!s.sound} onChange={(on) => settings.set({ sound: on })} />
          <Act icon="bell" id="testAlert" label={t('testAlert')} onClick={() => app.hooks.testAlert()} />
        </div>
      </div>
      <div class="group">
        <div class="grouphead">{t('grpApp')}</div>
        <div class="list">
          <Act icon="download" id="installBtn" label={t('install')} hidden={!app.installable.value} onClick={() => app.hooks.install()} />
          <div class="item text" id="installHint" hidden={!app.installHint.value}>{app.installHint.value}</div>
          <Item icon="history" wide label={<><span>{t('setRecentN')}</span><small>{t('setRecentNHint')}</small></>}>
            <Seg id="setRecentN" value={String(recentKeep())} options={RECENT_CHOICES.map((n) => ({ v: String(n), label: String(n) }))} onPick={(v) => { settings.set({ recentN: +v }); trimRecents(); }} />
          </Item>
          <Act icon="trash" id="clearHistory" label={t('clearHistory')} onClick={() => { recentPlaces.clear(); recentTrips.clear(); recentViews.clear(); lastSearch.clear(); toast(t('historyCleared')); }} />
        </div>
      </div>
      <div class="group">
        <div class="grouphead">{t('grpAbout')}</div>
        <div class="list"><div class="item text" id="aboutBox" dangerouslySetInnerHTML={{ __html: t('about', { feed: feed ? `${feed.start || ''}–${feed.end || ''}, ${feed.built || ''}` : '' }) }} />
          <CompassLine /></div>
      </div>
      <div class="muted center" id="ver">{app.version.value}</div>
    </>
  );
}

/** What the phone's compass sends, live while the page is open (the cone on the position dot depends on it). */
function CompassLine() {
  const [line, setLine] = useState(compassReport());
  useEffect(() => { const id = window.setInterval(() => setLine(compassReport()), 1000); return () => clearInterval(id); }, []);
  return <div class="item text muted small" id="compassLine">{t('compassLine')}: {line}</div>;
}
