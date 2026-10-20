// Wayli starts here: the icon sprite, then the components the app has so far (the top bar, the plan screen, the journey detail, the trip being followed, the pages, the drawer),
// the sheet's gestures, then the rest of the app, which still runs as one script and fills in what the
// components need (the `hooks` of state/*).
import { render, h } from 'preact';
import { installSprite } from './ui/icons';
import { installRipple } from './ui/ripple';
import { TopBar } from './features/topbar/TopBar';
import { PlanScreen } from './features/results/PlanScreen';
import { Detail } from './features/detail/Detail';
import { Follow } from './features/follow/Follow';
import { ResumeBar } from './features/follow/ResumeBar';
import { Drawer } from './features/pages/Drawer';
import { Nearby } from './features/pages/Nearby';
import { Saved } from './features/pages/Saved';
import { Settings } from './features/pages/Settings';
import { Chooser } from './features/pages/Chooser';
import { attachSheetGestures } from './features/sheet/gestures';
import { attachBarPull } from './features/sheet/pullRefresh';
import * as sheet from './state/sheet';

const el = (id: string) => document.getElementById(id)!;
installSprite();
installRipple();
render(h(TopBar, {}), el('topbar-root'));
render(h(PlanScreen, {}), el('screen-plan'));
render(h(Detail, {}), el('detail'));
render(h(Follow, {}), el('follow'));
render(h(ResumeBar, {}), el('resume-root'));
render(h(Drawer, {}), el('drawer-root'));
render(h(Nearby, {}), el('screen-nearby'));
render(h(Saved, {}), el('screen-saved'));
render(h(Settings, {}), el('screen-more'));
render(h(Chooser, {}), el('chooser'));
attachSheetGestures(el('sheet'), el('sheetHandle'), el('sheetBody'));
attachBarPull(el('topbar'));
sheet.set('peek');
document.body.classList.add('booted');   // the shell paints now, icons and all, in one go
import('./app.js');
