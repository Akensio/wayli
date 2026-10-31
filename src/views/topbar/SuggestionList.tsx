// The rows of a search box's list, for one answer of controllers/suggest (the box, SearchField, holds the list's frame,
// its placement and its animation): the quick entries of an empty trip box, places and line numbers matching, lines
// or stops near or matching with those opened lately, or the line saying why there is nothing. Each row only says what
// was tapped; the box closes its list and passes the choice on.
import { t } from '../../lib/i18n';
import { Icon } from '../../widgets/Icon';
import type { IconName } from '../../widgets/icons';
import { LineChip } from '../../widgets/LineChip';
import { viewParts } from '../../widgets/ViewRow';
import { toast } from '../../widgets/toast';
import { placeName } from '../../state/names';
import { savedPlaces, recentPlaces } from '../../state/store.ts';
import * as search from '../../state/search';
import type { Place, LineGroup, StopGroup } from '../../state/search';
import type { View } from '../../state/store.ts';
import { agencyName } from '../../display/operators';
import { distText } from '../../display/places';
import type { SearchHit } from '../../worker/ops.ts';
import type { Rows } from '../../controllers/suggest';

/** An answer the list draws (a "none" answer closes the list instead). */
export type Shown = Exclude<Rows, { kind: 'none' }>;

/** What the list hands back to its box: a place (a quick entry, a saved or recent place, a result), a line's
 *  direction, a stop, something opened lately, the two quick actions, and a recent place starred (to list again). */
export type ListActions = {
  onPlace: (p: Place) => void;
  onLine: (r: { route: number }) => void;
  onStop: (g: StopGroup) => void;
  onRecent: (v: View) => void;
  onLocate: () => void;
  onMap: () => void;
  onStarred: () => void;
};

const STOP_ICON = { bus: 'bus', rail: 'train', lrt: 'tram' } as const;

/** A stop in the list: what stops there, its name, where, the number on its sign, how far; a bus stop's lines. */
export function StopRow({ g, onStop }: { g: StopGroup; onStop: (g: StopGroup) => void }) {
  return (
    <button type="button" class={`stoprow m-${g.mode}`} onClick={() => onStop(g)}>
      <span class="sic">
        <Icon name={STOP_ICON[g.mode]} />
      </span>
      <span class="txt">
        <bdi>{g.name}</bdi>
        <small>{[g.city, g.code, g.dist != null ? distText(g.dist) : ''].filter(Boolean).join(' · ')}</small>
        {g.lines.length > 0 && (
          <span class="slines">
            {g.lines.slice(0, 6).map((l) => (
              <LineChip key={l.label} line={l.label} routeType={l.type} agency={l.agency} />
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

/** A line in the list: its chip, where it runs and who runs it, then a row per direction (a tap opens that direction). */
export function LineRow({ g, onLine }: { g: LineGroup; onLine: (r: { route: number }) => void }) {
  const rail = g.mode === 'rail';
  return (
    <div class={`lgroup m-${g.mode}`}>
      <button type="button" class="lhead" onClick={() => onLine(g.dirs[0])}>
        <LineChip line={g.line} routeType={g.routeType} agency={g.agency} mode={g.mode} />
        <span class="txt">
          <bdi>{rail ? g.area.join(' – ') : g.area.join(' – ') || agencyName(g.agency)}</bdi>
          <small>
            {rail ? t('tripsToday', { n: g.trips }) : agencyName(g.agency)}
            {g.estimated ? ' · ' + t('estShort') : ''}
            {g.dist != null ? ' · ' + t('lineAway', { d: distText(g.dist) }) : ''}
          </small>
        </span>
      </button>
      {g.dirs.map((d) => (
        <button key={d.route} type="button" class="ldir" onClick={() => onLine(d)}>
          <span class="arrow">
            <Icon name="chevronEnd" class="chev" />
          </span>
          <span class="txt">
            <bdi>{t('toward', { headsign: d.headsign })}</bdi>
            <small>{t('tripsToday', { n: d.trips })}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

/** A chosen result as the planner takes it: a stop as is, a place with its city in the name. */
const fromResult = (g: SearchHit): Place =>
  g.kind === 'stop'
    ? (g as unknown as Place)
    : { name: g.city && g.kind !== 'city' ? `${g.name}, ${g.city}` : g.name, lat: g.lat, lon: g.lon };
/** What kind of place a result is, as its small print: a stop (with its platforms), a named place, or the kind's name. */
function resultKind(g: SearchHit): string {
  if (g.kind === 'stop') return g.platforms && g.platforms > 1 ? t('platforms', { n: g.platforms }) : t('kindStop');
  if (g.kind === 'poi') return g.label || t('kindPoi');
  return t('kind' + g.kind[0].toUpperCase() + g.kind.slice(1));
}
/** What identifies a result among the others: a stop's key, else its kind, name and point. */
const resultKey = (g: SearchHit): string =>
  g.kind === 'stop' ? g.key : `${g.kind}|${g.name}|${g.city}|${g.lat},${g.lon}`;

/** A place matched by what is typed: its name, its kind, its city, how near the house number found is. */
function PlaceRow({ g, onPlace }: { g: SearchHit; onPlace: (p: Place) => void }) {
  return (
    <button type="button" onClick={() => onPlace(fromResult(g))}>
      {g.name}
      <small>
        {resultKind(g)}
        {g.city ? ' · ' + g.city : ''}
        {g.kind !== 'stop' && g.approx != null ? ' · ' + t('approxNo', { n: g.approx }) : ''}
      </small>
    </button>
  );
}

/** Something opened lately (a line, a stop, a station, the trains between two stations), read as the history drawer
 *  and the saved page read it (widgets/ViewRow), in the list's own button. */
function RecentViewRow({ v, onOpen }: { v: View; onOpen: (v: View) => void }) {
  const p = viewParts(v);
  return (
    <button type="button" class="quick recentrow" onClick={() => onOpen(v)}>
      {p.chip ? p.lead : <span class="ic">{p.lead}</span>}
      <span class="txt">{p.text}</span>
    </button>
  );
}

/** A saved place's icon by its slot: home, work, or a star for the rest. */
function slotIcon(slot: string): IconName {
  if (slot === 'home') return 'home';
  if (slot === 'work') return 'work';
  return 'star';
}
/** An empty trip box's list: my location, pick on the map, the saved places, then up to six recent places not saved
 *  (each with a star that saves it). Read from the phone's store as it draws. */
function QuickRows({ a }: { a: ListActions }) {
  const saved = savedPlaces.all();
  const recent = recentPlaces.list().filter((r) => !savedPlaces.has(r));
  return (
    <>
      <button key="locate" type="button" class="quick" onClick={a.onLocate}>
        <span class="ic">
          <Icon name="locate" />
        </span>
        <span class="txt">{t('myLoc')}</span>
      </button>
      <button key="map" type="button" class="quick" onClick={a.onMap}>
        <span class="ic">
          <Icon name="map" />
        </span>
        <span class="txt">{t('pickTitle')}</span>
      </button>
      {saved.map((p) => (
        <button key={`${p.slot}:${p.name}`} type="button" class="quick" onClick={() => a.onPlace(p)}>
          <span class="ic">
            <Icon name={slotIcon(p.slot)} />
          </span>
          <span class="txt">
            {p.slot === 'more' ? placeName(p) : t(p.slot)}
            <small>{p.slot === 'more' ? '' : placeName(p)}</small>
          </span>
        </button>
      ))}
      {recent.slice(0, 6).map((p) => (
        // two buttons side by side (a button cannot hold another): the place, and saving it
        <div key={`recent:${p.name}`} class="quickrow">
          <button type="button" class="quick" onClick={() => a.onPlace(p)}>
            <span class="ic">
              <Icon name="history" />
            </span>
            <span class="txt">{placeName(p)}</span>
          </button>
          <button
            type="button"
            class="mini"
            title={t('savePlace')}
            aria-label={t('savePlace')}
            onClick={() => {
              savedPlaces.add(p);
              toast(t('saved'));
              a.onStarred();
            }}
          >
            <Icon name="star" />
          </button>
        </div>
      ))}
    </>
  );
}

/** The heading over the stops found: the stations (all, or the light rail's) or the stops near when nothing was typed,
 *  "stops" for a search. */
function stopsGroupTitle(near: boolean): string {
  if (!near) return t('grpStops');
  if (search.stopFilter.value === 'rail') return t('stationsAll');
  if (search.stopFilter.value === 'lrt') return t('stationsLrt');
  return t('stopsNear');
}
/** The line under an empty list: a hint before typing, "no match" after, or that the address book is still loading. */
function emptyHint(rows: Exclude<Shown, { kind: 'quick' }>): string {
  if (rows.kind === 'lines') return rows.near ? t('linesHint') : t('lineNoMatch');
  if (rows.kind === 'stops') return rows.near ? t('stopsHint') : t('noMatch');
  return rows.placesLoaded ? t('noMatch') : t('placesPending');
}
/** The disabled last row saying why nothing is listed. */
const Empty = ({ rows }: { rows: Exclude<Shown, { kind: 'quick' }> }) => (
  <button type="button" disabled>
    {emptyHint(rows)}
  </button>
);

/** Those opened lately, under their heading (the line and stop searches, while empty). */
function Recents({ views, onOpen }: { views: View[]; onOpen: (v: View) => void }) {
  if (!views.length) return null;
  return (
    <>
      <div class="grp">{t('recentOnly')}</div>
      {views.map((v, i) => (
        <RecentViewRow key={`${v.type}:${v.at ?? i}`} v={v} onOpen={onOpen} />
      ))}
    </>
  );
}

/** The rows of one answer, in the order the list has always had: recents, lines, stops, places, else the hint. */
export function SuggestionList({ rows, a }: { rows: Shown; a: ListActions }) {
  if (rows.kind === 'quick') return <QuickRows a={a} />;
  if (rows.kind === 'lines')
    return (
      <>
        <Recents views={rows.recent} onOpen={a.onRecent} />
        {rows.groups.length > 0 && (
          <div class="grp">{rows.near && search.lineFilter.value === 'all' ? t('linesNear') : t('grpLines')}</div>
        )}
        {rows.groups.map((g) => (
          <LineRow key={g.key} g={g} onLine={a.onLine} />
        ))}
        {!rows.groups.length && !rows.recent.length && <Empty rows={rows} />}
      </>
    );
  if (rows.kind === 'stops')
    return (
      <>
        <Recents views={rows.recent} onOpen={a.onRecent} />
        {rows.groups.length > 0 && <div class="grp">{stopsGroupTitle(rows.near)}</div>}
        {rows.groups.map((g) => (
          <StopRow key={g.key} g={g} onStop={a.onStop} />
        ))}
        {!rows.groups.length && !rows.recent.length && <Empty rows={rows} />}
      </>
    );
  return (
    <>
      {rows.lines.length > 0 && <div class="grp">{t('grpLines')}</div>}
      {rows.lines.map((g) => (
        <LineRow key={g.key} g={g} onLine={a.onLine} />
      ))}
      {rows.lines.length > 0 && rows.results.length > 0 && <div class="grp">{t('grpPlaces')}</div>}
      {rows.results.map((g) => (
        <PlaceRow key={resultKey(g)} g={g} onPlace={a.onPlace} />
      ))}
      {!rows.results.length && !rows.lines.length && <Empty rows={rows} />}
    </>
  );
}
