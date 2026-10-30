// A panel's live times: asked for once, then every 45 s for as long as the panel stays open (the stop page, the trains
// between two stations). `ask` fetches and applies them and answers with the newest report it saw, or undefined when
// there was nothing to ask (or the panel has moved on); the panel's note then says how live it is.
import type { Signal } from '@preact/signals';
import { t } from '../lib/i18n';
import { timeOf } from '../lib/time';
import * as nav from '../state/nav';
import * as map from '../map/index';

const EVERY = 45000;

/** Starts polling for `panel` and returns its timer (cleared when the panel closes or is opened anew). */
export function livePoll(panel: string, note: Signal<string>, ask: () => Promise<Date | null | undefined>): number {
  const once = async (): Promise<void> => {
    if (!map.liveOn()) {
      note.value = t('liveOff');
      return;
    }
    try {
      const newest = await ask();
      if (newest !== undefined) note.value = newest ? t('liveUpdated', { time: timeOf(newest) }) : t('liveNoVehicle');
    } catch {
      note.value = t('liveFail');
    }
  };
  void once();
  const timer = window.setInterval(() => {
    if (!nav.isOpen(panel)) clearInterval(timer);
    else void once();
  }, EVERY);
  return timer;
}
