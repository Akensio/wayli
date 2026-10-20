// Wayli starts here: the icon sprite, then the components the app has so far (the top bar), then the rest
// of the app, which still runs as one script and fills in what the components need (state/search.ts `hooks`).
import { render, h } from 'preact';
import { installSprite } from './ui/icons';
import { TopBar } from './features/topbar/TopBar';

installSprite();
render(h(TopBar, {}), document.getElementById('topbar-root')!);
document.body.classList.add('booted');   // the shell paints now, icons and all, in one go
import('./app.js');
