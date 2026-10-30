// The star on a panel's bar that saves what the panel shows (a trip, a stop, a line) on this device, filled when saved.
import { Icon } from './Icon';
import { t } from '../lib/i18n';

export function StarButton({ id, on, onClick }: { id: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class={`star${on ? ' on' : ''}`}
      id={id}
      title={t('savePlace')}
      aria-pressed={on}
      onClick={onClick}
    >
      <Icon name="star" />
    </button>
  );
}
