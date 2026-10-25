// Wayli starts here: the icon sprite, the components (the top bar, what floats over the map, the sheet with
// every screen and panel, the drawer, the settings page), the sheet's gestures, then the controllers behind them (boot.ts), which
// fill in what the components need (the `hooks` of state/*).
import './map/maplibre';   // first: the map library as a global, before any module that uses it
// then the app's styles, after the map library's: its defaults must not win a tie (a tap's lingering :hover greyed the
// following locate button when they came first, 2026-10-22)
import './styles.css';
import { render, h } from 'preact';
import { installSprite } from './widgets/icons';
import { installRipple } from './widgets/ripple';
import { TopBar } from './views/topbar/TopBar';
import { Floating, PickBar, LiveNote, Menus } from './views/shell/Floating';
import { Sheet } from './views/shell/Sheet';
import { Drawer } from './views/pages/Drawer';
import { SettingsPage } from './views/pages/SettingsPage';
import { attachSheetGestures } from './views/sheet/gestures';
import { attachBarPull } from './views/sheet/pullRefresh';
import * as sheet from './state/sheet';

const el = (id: string) => document.getElementById(id)!;
installSprite();
installRipple();
render(h(TopBar, {}), el('topbar-root'));
render(h(Drawer, {}), el('drawer-root'));
render(h(SettingsPage, {}), el('settings-root'));
render(h(Floating, {}), el('floating-root'));
render(h(LiveNote, {}), el('livenote-root'));
render(h(PickBar, {}), el('pickbar-root'));
render(h(Sheet, {}), el('sheet-root'));
render(h(Menus, {}), el('menus-root'));
attachSheetGestures(el('sheet'), el('sheetHandle'), el('sheetBody'));
attachBarPull(el('topbar'));
sheet.set('peek');
document.body.classList.add('booted');   // the shell paints now, icons and all, in one go
import('./boot');   // after the first paint
