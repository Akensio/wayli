// The x at the end of a panel's bar: every panel closes at once, back to the map (Back is one step).
import { Icon } from './Icon';
import { t } from '../i18n';
import * as nav from '../state/nav';

export function CloseAll() {
  return <button type="button" class="closeall" title={t('closeAll')} aria-label={t('closeAll')} onClick={() => nav.closeAll()}><Icon name="close" /></button>;
}
