// The list of ways: a head line (how many, with what, how live), the bicycle-only way when there is one, the
// filters, the rides that just left, the cards, and earlier/later at the foot. While a plan is being made
// the list gives way to one line.
import { useState } from 'preact/hooks';
import { Icon } from '../../widgets/Icon';
import { TimeRange } from '../../widgets/TimeRange';
import type { IconName } from '../../widgets/icons';
import { t, lang } from '../../lib/i18n';
import * as live from '../../engine/live.js';
import { fmt, secOf } from '../../lib/time';
import * as search from '../../state/search';
import * as results from '../../state/results';
import { describePlace } from '../../journey/format';
import { LegChips } from './LegChips';
import { JourneyCard } from './JourneyCard';
import { SortChip } from './SortMenu';
import type { Journey, Query } from '../../journey/types';

const clock = (ms: number) => new Date(ms).toLocaleTimeString(lang.value === 'he' ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
const plan = () => results.hooks.plan();

function Head({ q, n, at }: { q: Query; n: number; at: number | null }) {
  const note = q.bike === 'along' ? (q.folding ? t('foldingNote') : t('withBikeOnBoard')) : q.bike === 'park' ? t('parkNote') : '';
  return (
    <div class="results-head muted">
      <span>
        {at ? t('resultsFrom', { time: clock(at) }) + ' · ' : ''}{t('found', { n })}{note}{q.arriveBy ? ' · ' + t('arriveByNote', { time: fmt(secOf(q.at)) }) : ''}
        {q.liveTried && <> · <span class={`live${q.liveAsOf ? ' ok' : ''}`}>{q.liveAsOf ? t('livePlanned', { time: clock(q.liveAsOf) }) : t('schedOnly')}</span></>}
      </span>
      <span class="spacer" />
      {at && <button type="button" class="linkbtn" onClick={() => { search.resetNow(); plan(); }}>{t('planAgain')}</button>}
    </div>
  );
}

function Filters() {
  const f = results.filters.value;
  const Chip = ({ label, on, icon, onClick }: { label: string; on: boolean; icon?: IconName; onClick: () => void }) => (
    <button type="button" class={`chipbtn${on ? ' on' : ''}`} onClick={onClick}>{icon && <><Icon name={icon} /> </>}{label}</button>
  );
  return (
    <div class="filters">
      <Chip label={t('fDirect')} on={f.fDirect} onClick={() => results.setFilter({ fDirect: !f.fDirect })} />
      <Chip label={t('fTrain')} on={f.fTrain} icon="train" onClick={() => results.setFilter({ fTrain: !f.fTrain })} />
      <SortChip />
    </div>
  );
}

/** Rides that just left: on a fresh plan one quiet line that opens on a tap (most riders want the next departures);
 *  on a plan restored from earlier they are shown, since the rider is likely on the way already. */
function GoneStrip({ gone, q, restored }: { gone: Journey[]; q: Query; restored: boolean }) {
  const [open, setOpen] = useState(false);
  const nowSec = live.nowOn(q.day);
  const rows = (
    <div class="gone-rows" hidden={!restored && !open}>
      {gone.slice().sort((a, b) => b.depart - a.depart).slice(0, 4).map((j) => (   // the four most recent: the one the rider is on is among them
        <div class="gone">
          <div class="txt" onClick={() => results.hooks.openDetail(j, q)}>
            <TimeRange from={j.depart} to={j.arrive} />
            <span class="chips"><LegChips legs={j.legs.filter((l) => l.type === 'ride')} /></span>
            <span class="muted">{t('leftAgo', { n: Math.max(1, Math.round((nowSec - results.rideDep(j)) / 60)) })}</span>
          </div>
          <button type="button" class="ghost" onClick={(e) => { e.stopPropagation(); results.hooks.startTrip(j, q); }}><Icon name="play" /> {t('aboard')}</button>
        </div>
      ))}
    </div>
  );
  return (
    <div class="gone-strip">
      {restored ? <div class="muted">{t('goneTitle')}</div>
        : <button type="button" class={`gone-hint${open ? ' open' : ''}`} onClick={() => setOpen(!open)}>{gone.length === 1 ? t('goneHint1') : t('goneHint', { n: gone.length })} <Icon name="chevronDown" /></button>}
      {rows}
    </div>
  );
}

export function Results() {
  void lang.value;
  const st = results.status.value, r = results.result.value, q = results.query.value, at = results.resultsAt.value;
  if (st !== 'idle') return <div id="results"><div class="empty">{t(st)}</div></div>;
  if (!r || !q) return <div id="results" />;
  const { cards, gone, filteredOut } = results.list.value;
  const bikeOnly = r.bikeOnly;
  return (
    <div id="results">
      <Head q={q} n={(r.groups || r.journeys).length} at={at} />
      {gone.length > 0 && <GoneStrip gone={gone} q={q} restored={!!at} />}
      {bikeOnly ? (
        <div class="journey" onClick={() => results.hooks.openDetail({ depart: 0, arrive: bikeOnly.seconds, transfers: 0, legs: [{ type: 'access', mode: 'bike', seconds: bikeOnly.seconds, path: bikeOnly.path, to: { name: describePlace(q.to) } }] }, q, true)}>
          <div class="top"><span class="times"><span class="chip bike"><Icon name="bike" /></span> {t('bikeOnly', { min: Math.round(bikeOnly.seconds / 60), km: (bikeOnly.metres / 1000).toFixed(1) })}</span></div>
        </div>
      ) : q.bike !== 'none' && r.streets && !q.from.stops && !q.to.stops ? <div class="muted">{t('noBikeOnly')}</div> : null}
      {!r.journeys.length ? (
        <>
          <div class="empty">{t(r.reason || 'noJourney')}</div>
          <div class="results-foot">
            <button type="button" class="ghost" onClick={() => { search.setAt(search.atSeconds() + 3600); plan(); }}>{t('tryLater')}</button>
            {r.reason && (q.maxWalk || 0) < 30 && <button type="button" class="ghost" onClick={() => results.hooks.plan({ maxWalk: 30 })}>{t('tryMoreWalk')}</button>}
          </div>
        </>
      ) : (
        <>
          <Filters />
          {filteredOut && <div class="empty">{t('filterNone')}</div>}
          {cards.map((c) => <JourneyCard key={c.idx} card={c} />)}
          <div class="results-foot">
            <button type="button" class="ghost" onClick={() => { search.setAt(Math.max(0, search.atSeconds() - 3600)); plan(); }}>{t('earlier')}</button>
            <button type="button" class="ghost" onClick={() => { search.setAt(search.atSeconds() + 3600); plan(); }}>{t('later')}</button>
          </div>
        </>
      )}
    </div>
  );
}

