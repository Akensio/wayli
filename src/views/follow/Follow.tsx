// The trip in progress: what to do now (walk, wait, ride, get off), the next ride's vehicle, a faster way when
// one was found, and the legs ahead. The state machine (follow.js) is pure; this draws its view.
import { Icon } from '../../widgets/Icon';
import { t, lang } from '../../lib/i18n';
import { fmt } from '../../lib/time';
import * as clock from '../../engine/clock.js';
import { view as followView, canStepBack } from '../../engine/follow.js';
import * as follow from '../../state/follow';
import { now } from '../../state/clock';
import { lineText, inShort } from '../../journey/format';
import { LegChips } from '../results/LegChips';
import { LegRow } from '../detail/LegRow';
import type { Leg } from '../../journey/types';
import { payLink } from '../../journey/pay';

type View = { kind: 'done' | 'walk' | 'final' | 'wait' | 'ride'; leg: Leg; toRide?: Leg; minutes: number; departsIn: number; stopsLeft: number; alight: { name: string }; nextStop: { name: string } };

/** The card proposing the alternative. */
function AltCard({ alt }: { alt: follow.Alt }) {
  const a = follow.active.value!, j = alt.journey, o = alt.origin;
  const rides = j.legs.filter((l) => l.type === 'ride');
  const cur = a.journey.legs[a.state.step];
  const sameVehicle = o.kind === 'ride' && rides[0] && rides[0].trip === cur.trip;
  const first = o.kind === 'ride' ? t('altGetOff', { stop: sameVehicle ? rides[0].to!.name : o.offAt!.name }) : o.kind === 'wait' ? t('altInstead', { line: lineText(cur.line) }) : '';
  const nextRide = sameVehicle ? rides[1] : rides[0];
  const then = nextRide ? t('altThen', { line: lineText(nextRide.line), headsign: nextRide.headsign || '', time: fmt(nextRide.depart!) }) : '';
  return (
    <div class="altcard" id="followAlt">
      <div class="title"><Icon name="bolt" /> {t('fasterWay')}</div>
      <div>{first}{first && then ? ' · ' : ''}{then}</div>
      <div class="chips"><LegChips legs={j.legs} /></div>
      <div class="muted">{t('altArrive', { time: fmt(j.arrive), n: Math.round(alt.gain / 60) })}</div>
      <div class="row"><button type="button" class="primary slim" onClick={() => follow.hooks.switchTo(alt)}>{t('switchRoute')}</button><button type="button" class="ghost" onClick={() => follow.hooks.dismiss(alt)}>{t('keepRoute')}</button></div>
    </div>
  );
}

export function Follow() {
  void lang.value; void follow.tick.value; void now.value;
  const a = follow.active.value, ll = follow.legLive.value;
  if (!a) return null;
  const j = a.journey, nowS = clock.nowOn(a.day), dest = a.q.to.name;
  const v = followView(j, a.state, nowS) as unknown as View;
  const badge = follow.liveBadge.value, liveLine = badge ? ` · ${badge.text}` : '';
  const pos = follow.pos.value, fresh = pos && Date.now() - pos.at < 90000;
  let title = dest, big = '', small = '', alert = false;
  if (v.kind === 'done') { big = t('arrived'); }
  else if (v.kind === 'walk' || v.kind === 'final') {
    const l = v.leg;
    title = v.toRide ? t('followTitle', { line: lineText(v.toRide.line), to: dest }) : t('walkTitle', { to: dest });
    big = v.kind === 'final' ? t('walkToDest', { min: v.minutes, name: dest }) : l.mode === 'bike' ? t('bikeTo', { min: v.minutes, name: l.to!.name }) : t('walkTo', { min: v.minutes, name: l.to!.name });
    small = v.toRide ? `${lineText(v.toRide.line)} ${t('departsAt', { time: fmt(v.toRide.depart!) })}${inShort(v.departsIn)}${liveLine}` : t('arrivesAt', { time: fmt(l.arrive!) });
  } else if (v.kind === 'wait') {
    const l = v.leg;
    title = t('followTitle', { line: lineText(l.line), to: dest });
    big = t('waitFor', { line: lineText(l.line), stop: l.from!.name });
    small = `${t('departsAt', { time: fmt(l.depart!) })}${inShort(v.departsIn)} · ${t('toward', { headsign: l.headsign || '' })}${liveLine}`;
  } else if (v.kind === 'ride') {
    const l = v.leg;
    title = t('followTitle', { line: lineText(l.line), to: dest });
    if (v.stopsLeft <= 1) { alert = true; big = t('getOffNext'); small = v.alight.name; }
    else { big = t('getOffAt', { name: v.alight.name }); small = `${t('stopsLeft', { n: v.stopsLeft })} · ${t('nextStopIs', { name: v.nextStop.name })} · ${t('arrivesAt', { time: fmt(l.arrive!) })}`; }
  }
  const alt = follow.alt.value;
  const curRide = j.legs.findIndex((l, i) => i >= a.state.step && l.type === 'ride');   // its stops open by themselves
  return (
    <>
      <div class="fhead">
        <button type="button" class="iconbtn flat" id="followHide" title={t('hide')} aria-label={t('hide')} onClick={follow.hooks.hide}><Icon name="chevronDown" /></button>
        <h2 id="followTitle">{title}</h2>
        <button type="button" class="endbtn" id="followEnd" onClick={follow.hooks.end}><Icon name="close" /> {t('endTripLong')}</button>
      </div>
      <div class={`nowcard${alert ? ' alert' : ''}`} id="followCard">
        <span class={`livebadge ${badge ? badge.cls : ''}`} id="followLive" hidden={!badge}>{badge ? badge.text : ''}</span>
        <div class="big" id="followBig">{big}</div>
        <div class="small" id="followSmall">{small}</div>
        <div class="stepper">
          <button type="button" id="followBack" disabled={!canStepBack(a.state)} onClick={follow.hooks.back}><Icon name="back" class="chev" /> {t('prevStep')}</button>
          <button type="button" class="next" id="followSkip" hidden={v.kind === 'done'} onClick={follow.hooks.skip}>{t('nextStep')} <Icon name="chevronEnd" class="chev" /></button>
        </div>
        {v.kind === 'wait' && <a class="ghost btnlink" id="followPay" href={payLink()} target="_blank" rel="noopener" title={t('payHint')}><Icon name="card" /> <span>{t('pay')}</span></a>}
        <div class="gps" id="followGps"><Icon name="locate" /> {fresh ? t('gpsOk', { acc: Math.round(pos!.acc || 0) }) : t('gpsNo')}</div>
      </div>
      {alt && <AltCard alt={alt} />}
      <div class="legs" id="followNext">
        {j.legs.map((l, i) => { const x = ll[i]; return <LegRow key={i} l={l} mode="follow" cls={i < a.state.step ? 'done' : i === a.state.step ? 'current' : ''} after={i > 0 && l.type !== 'ride' && j.legs[i - 1].arrive === l.depart}
          badge={x ? x.badge : undefined} change={x ? x.change : null} stopLive={x ? x.stops : null} defaultStopsOpen={i === curRide} passedUpTo={i === a.state.step && a.state.onBoard ? a.state.rideIdx : null} />; })}
      </div>
    </>
  );
}
