// A trip in progress whose screen was hidden: one bar over the map to go back to it.
import { Icon } from '../../widgets/Icon';
import { t, lang } from '../../lib/i18n';
import * as follow from '../../state/follow';
import { lineText } from '../../journey/format';
import { resumeTrip } from '../../controllers/follow';

export function ResumeBar() {
  void lang.value;
  const a = follow.resumable.value;
  const ride = a && a.journey.legs.find((l) => l.type === 'ride');
  return (
    <button type="button" class="resume" id="resumeBar" hidden={!a} onClick={resumeTrip}>
      <span class="ic">
        <Icon name="bus" />
      </span>
      <span class="txt" id="resumeText">
        {a ? `${ride ? lineText(ride.line) + ' · ' : ''}${a.q.to.name}` : ''}
      </span>
      <span class="go">{t('resume')}</span>
    </button>
  );
}
