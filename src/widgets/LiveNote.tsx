// How live the times on a page are, in a few words: as of when, that no vehicle reports, that live times could not be
// had, or that they are off. Read from the one live store, so every page says the same.
import { t } from '../common/i18n';
import { timeOf } from '../common/time';
import * as live from '../state/live';

export function LiveNote({ id }: { id?: string }) {
  let text = t('liveOff');
  if (live.state.value === 'failed') text = t('liveFail');
  else if (live.state.value === 'ok')
    text = live.asOf.value ? t('liveUpdated', { time: timeOf(live.asOf.value) }) : t('liveNoVehicle');
  return (
    <span class="muted" id={id}>
      {text}
    </span>
  );
}
