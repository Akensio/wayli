// Wayli starts here: the icon sprite, the components (the top bar, what floats over the map, the sheet with
// every screen and panel, the drawer), the sheet's gestures, then the rest of the app, which still runs as one
// script and fills in what the components need (the `hooks` of state/*).
import { render, h } from 'preact';
import { installSprite } from './ui/icons';
import { installRipple } from './ui/ripple';
import { TopBar } from './features/topbar/TopBar';
import { Floating, PickBar, LiveNote } from './features/shell/Floating';
import { Sheet } from './features/shell/Sheet';
import { Drawer } from './features/pages/Drawer';
import { attachSheetGestures } from './features/sheet/gestures';
import { attachBarPull } from './features/sheet/pullRefresh';
import * as sheet from './state/sheet';

const el = (id: string) => document.getElementById(id)!;
installSprite();
installRipple();
render(h(TopBar, {}), el('topbar-root'));
render(h(Drawer, {}), el('drawer-root'));
render(h(Floating, {}), el('floating-root'));
render(h(LiveNote, {}), el('livenote-root'));
render(h(PickBar, {}), el('pickbar-root'));
render(h(Sheet, {}), el('sheet-root'));
attachSheetGestures(el('sheet'), el('sheetHandle'), el('sheetBody'));
attachBarPull(el('topbar'));
sheet.set('peek');
document.body.classList.add('booted');   // the shell paints now, icons and all, in one go
import('./app.js');
