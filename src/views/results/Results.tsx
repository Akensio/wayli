// The list of ways: a head line (how many, with what, how live), the bicycle-only way when there is one, the
// filters, the rides that just left, those still in reach with a hurry, the cards, and earlier/later at the foot. While a plan is being made
// the list gives way to one line.
import { useState } from 'preact/hooks';
import type { ComponentChildren, VNode } from 'preact';
import { Icon } from '../../widgets/Icon';
import { Fold } from '../../widgets/Fold';
import { TimeRange } from '../../widgets/TimeRange';
import type { IconName } from '../../widgets/icons';
import { t, lang } from '../../lib/i18n';
import * as clock from '../../engine/clock.js';
import { fmt, secOf, timeOf } from '../../lib/time';
import * as search from '../../state/search';
import * as results from '../../state/results';
import { describePlace } from '../../journey/format';
import { LegChips } from './LegChips';
import { JourneyCard } from './JourneyCard';
import { SortChip } from './SortMenu';
import type { Journey, Query } from '../../journey/types';
import { ridesOf } from '../../journey/types';
import { plan } from '../../controllers/planner';
import { openDetail } from '../../controllers/detail';
import { startTrip } from '../../controllers/follow';

function Head({ q, n, at }: { q: Query; n: number; at: number | null }) {
  let note = '';
  if (q.bike === 'along') note = q.folding ? t('foldingNote') : t('withBikeOnBoard');
  else if (q.bike === 'park') note = t('parkNote');
  return (
    <div class="results-head muted">
      <span>
        {at ? t('resultsFrom', { time: timeOf(at) }) + ' · ' : ''}
        {t('found', { n })}
        {note}
        {q.arriveBy ? ' · ' + t('arriveByNote', { time: fmt(secOf(q.at)) }) : ''}
        {q.liveTried && (
          <>
            {' '}
            ·{' '}
            <span class={`live${q.liveAsOf ? ' ok' : ''}`}>
              {q.liveAsOf ? t('livePlanned', { time: timeOf(q.liveAsOf) }) : t('schedOnly')}
            </span>
          </>
        )}
      </span>
      <span class="spacer" />
      {at && (
        <button
          type="button"
          class="linkbtn"
          onClick={() => {
            search.resetNow();
            plan();
          }}
        >
          {t('planAgain')}
        </button>
      )}
    </div>
  );
}

function Filters() {
  const f = results.filters.value;
  const Chip = ({ label, on, icon, onClick }: { label: string; on: boolean; icon?: IconName; onClick: () => void }) => (
    <button type="button" class={`chipbtn${on ? ' on' : ''}`} onClick={onClick}>
      {icon && (
        <>
          <Icon name={icon} />{' '}
        </>
      )}
      {label}
    </button>
  );
  return (
    <div class="filters">
      <Chip label={t('fDirect')} on={f.fDirect} onClick={() => results.setFilter({ fDirect: !f.fDirect })} />
      <Chip label={t('train')} on={f.fTrain} icon="train" onClick={() => results.setFilter({ fTrain: !f.fTrain })} />
      <SortChip />
    </div>
  );
}

/** A quiet line that opens on a tap to a few compact ways, each with a word on where it stands and a button (the ways
 *  in reach if the rider hurries, and the rides that just left, share it). `fixed` shows the rows under a plain title. */
function Strip({
  cls,
  hint,
  fixed,
  children,
}: {
  cls: string;
  hint: string;
  fixed?: boolean;
  children: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div class={`strip ${cls}`}>
      {fixed ? (
        <div class="muted">{hint}</div>
      ) : (
        <Fold class="strip-hint" open={open} onClick={() => setOpen(!open)}>
          {hint}
        </Fold>
      )}
      <div class="strip-rows" hidden={!fixed && !open}>
        {children}
      </div>
    </div>
  );
}
/** One way in a strip: its times and lines (a tap opens it), a note, and a button to start following it. */
function StripRow({ j, q, note, act }: { j: Journey; q: Query; note: VNode; act: string }) {
  return (
    <div class="strip-row">
      <div class="txt" onClick={() => openDetail(j, q)}>
        <TimeRange from={j.depart} to={j.arrive} />
        <span class="chips">
          <LegChips legs={ridesOf(j.legs)} />
        </span>
        {note}
      </div>
      <button
        type="button"
        class="ghost"
        onClick={(e) => {
          e.stopPropagation();
          startTrip(j, q);
        }}
      >
        <Icon name="play" /> {act}
      </button>
    </div>
  );
}
/** Ways whose leave time has passed but whose ride the rider can still reach with a brisk walk: the leave time in red
 *  and how late it is (docs/architecture.md, "When to leave: the result list"). */
function HurryStrip({ hurry, q }: { hurry: Journey[]; q: Query }) {
  const nowSec = clock.nowOn(q.day);
  return (
    <Strip cls="hurry" hint={hurry.length === 1 ? t('hurryHint1') : t('hurryHint', { n: hurry.length })}>
      {hurry.slice(0, 4).map((j) => (
        <StripRow
          j={j}
          q={q}
          act={t('startTrip')}
          note={
            <span class="late">
              {t('hurryLate', { time: fmt(j.depart), n: Math.max(1, Math.round((nowSec - j.depart) / 60)) })}
            </span>
          }
        />
      ))}
    </Strip>
  );
}
/** Rides that just left: on a fresh plan one quiet line that opens on a tap (most riders want the next departures);
 *  on a plan restored from earlier they are shown, since the rider is likely on the way already. */
function GoneStrip({ gone, q, restored }: { gone: Journey[]; q: Query; restored: boolean }) {
  const nowSec = clock.nowOn(q.day);
  let hint = t('goneHint', { n: gone.length });
  if (restored) hint = t('goneTitle');
  else if (gone.length === 1) hint = t('goneHint1');
  return (
    <Strip cls="gone" fixed={restored} hint={hint}>
      {gone
        .slice()
        .sort((a, b) => b.depart - a.depart)
        .slice(0, 4)
        .map((j) => {
          // the four most recent: the one the rider is on is among them
          const left = nowSec - results.rideDep(j); // a ride out of reach may not have left yet
          return (
            <StripRow
              j={j}
              q={q}
              act={t('aboard')}
              note={
                <span class="muted">
                  {left > 0
                    ? t('leftAgo', { n: Math.max(1, Math.round(left / 60)) })
                    : t('leavesIn', { n: Math.max(0, Math.round(-left / 60)) })}
                </span>
              }
            />
          );
        })}
    </Strip>
  );
}

/** No way in the window: why, and the way out. With the next departure known (the worker looked past the window),
 *  "nothing before 20:23" and a button that plans from then; with nothing more that day, "no more ways today" (on a
 *  Friday, that they resume after Shabbat) and a button for the next day the data has; a stop too far, the walk setting. */
function NoWays({ r, q }: { r: { reason?: string; nextAt?: number | null }; q: Query }) {
  const days = search.days.value,
    next = days[days.indexOf(q.day) + 1];
  const friday = new Date(+q.day.slice(0, 4), +q.day.slice(4, 6) - 1, +q.day.slice(6, 8)).getDay() === 5;
  const noMore = !r.reason && r.nextAt == null;
  let message = t('noMoreToday') + (friday ? ' ' + t('afterShabbat') : '');
  if (r.reason) message = t(r.reason);
  else if (r.nextAt != null) message = t('nothingBefore', { time: fmt(r.nextAt) });
  return (
    <>
      <div class="empty">{message}</div>
      <div class="results-foot">
        {r.nextAt != null && (
          <button
            type="button"
            class="ghost"
            onClick={() => {
              search.setAt(r.nextAt!);
              plan();
            }}
          >
            {t('planFrom', { time: fmt(r.nextAt) })}
          </button>
        )}
        {noMore && next && (
          <button
            type="button"
            class="ghost"
            onClick={() => {
              search.setDayAt(next, 5 * 3600);
              plan();
            }}
          >
            {t('tomorrow')}
          </button>
        )}
        {r.reason && (
          <button
            type="button"
            class="ghost"
            onClick={() => {
              search.setAt(search.atSeconds() + 3600);
              plan();
            }}
          >
            {t('tryLater')}
          </button>
        )}
        {r.reason && (q.maxWalk || 0) < 30 && (
          <button type="button" class="ghost" onClick={() => plan({ maxWalk: 30 })}>
            {t('tryMoreWalk')}
          </button>
        )}
      </div>
    </>
  );
}

export function Results() {
  void lang.value;
  const st = results.status.value,
    r = results.result.value,
    q = results.query.value,
    at = results.resultsAt.value;
  if (st !== 'idle')
    return (
      <div id="results">
        <div class="empty">{t(st)}</div>
      </div>
    );
  if (!r || !q) return <div id="results" />;
  const { cards, hurry, gone, filteredOut } = results.list.value;
  const bikeOnly = r.bikeOnly;
  return (
    <div id="results">
      <Head q={q} n={(r.groups || r.journeys).length} at={at} />
      {gone.length > 0 && <GoneStrip gone={gone} q={q} restored={!!at} />}
      {hurry.length > 0 && <HurryStrip hurry={hurry} q={q} />}
      {bikeOnly && (
        <div
          class="journey"
          onClick={() =>
            openDetail(
              {
                depart: 0,
                arrive: bikeOnly.seconds,
                transfers: 0,
                legs: [
                  {
                    type: 'access',
                    mode: 'bike',
                    seconds: bikeOnly.seconds,
                    depart: 0,
                    arrive: bikeOnly.seconds,
                    path: bikeOnly.path,
                    to: { name: describePlace(q.to) },
                  },
                ],
              },
              q,
              true,
            )
          }
        >
          <div class="top">
            <span class="times">
              <span class="chip bike">
                <Icon name="bike" />
              </span>{' '}
              {t('bikeOnly', { min: Math.round(bikeOnly.seconds / 60), km: (bikeOnly.metres / 1000).toFixed(1) })}
            </span>
          </div>
        </div>
      )}
      {!bikeOnly && q.bike !== 'none' && r.streets && !q.from.stops && !q.to.stops && (
        <div class="muted">{t('noBikeOnly')}</div>
      )}
      {!r.journeys.length ? (
        <NoWays r={r} q={q} />
      ) : (
        <>
          <Filters />
          {filteredOut && <div class="empty">{t('filterNone')}</div>}
          {cards.map((c) => (
            <JourneyCard key={c.idx} card={c} />
          ))}
          <div class="results-foot">
            <button
              type="button"
              class="ghost"
              onClick={() => {
                search.setAt(Math.max(0, search.atSeconds() - 3600));
                plan();
              }}
            >
              {t('earlier')}
            </button>
            <button
              type="button"
              class="ghost"
              onClick={() => {
                search.setAt(search.atSeconds() + 3600);
                plan();
              }}
            >
              {t('later')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
