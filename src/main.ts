// Wayli starts here: the icon sprite, the components (the top bar, what floats over the map, the sheet with
// every screen and panel, the drawer, the settings page), the sheet's gestures, then the start of the app (boot.ts):
// the map, a trip in progress, the data.
import './map/maplibre'; // first: the map library as a global, before any module that uses it
// then the app's styles, after the map library's: its defaults must not win a tie (a tap's lingering :hover greyed the
// following locate button when they came first, 2026-10-22)
import './styles/index.css';
import { render, h } from 'preact';
import { installSprite } from './widgets/icons';
import { installRipple } from './widgets/ripple';
import { TopBar } from './views/topbar/TopBar';
import { Floating, PickBar, LiveNote, Menus } from './views/shell/Floating';
import { Sheet } from './views/shell/Sheet';
import { Drawer } from './views/menu/Drawer';
import { SettingsPage } from './views/settings/SettingsPage';
import * as sheet from './state/sheet';
import { installControllers } from './controllers/install';

const el = (id: string) => document.getElementById(id)!;
installControllers(); // their hooks filled before anything can be tapped
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
sheet.set('peek');
document.body.classList.add('booted'); // the shell paints now, icons and all, in one go
import('./boot'); // after the first paint
