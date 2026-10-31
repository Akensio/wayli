// Back, both ways it reaches the app: Android's close requests (CloseWatcher) and browser history elsewhere. Open a
// way, its line, a stop; Back closes them newest first, then the plan; the menu and settings close the same way; the
// folded bar's X clears everything at once.
import { start, check } from './harness.mjs';

for (const android of [true, false]) {
  const mode = android ? 'Android' : 'history';
  const { page, wait, click, back, planTo, finish } = await start({ android, settings: { lang: 'en', live: false } });
  const where = () =>
    page.evaluate(() => ({
      panel:
        [...document.querySelectorAll('#sheetBody > .detail, #sheetBody > .screen')].find((e) => !e.hidden)?.id || null,
      ways: document.querySelectorAll('.journey').length,
      menu: !!document.getElementById('menu')?.classList.contains('open'),
      settings: !!document.getElementById('settingsPage')?.classList.contains('open'),
    }));
  await planTo('Dizengoff Center');
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await click('.journey');
  await wait(2500);
  await click('#detail .leg [class*="chip"]');
  await wait(3000);
  await click('.linerow.anchor .ghost.slim');
  await wait(3000);
  const opened = await where();
  check(`${mode}: a way, its line and a stop open`, opened, opened.panel === 'stopDetail');
  const steps = [];
  for (let i = 0; i < 4; i++) {
    await back();
    steps.push((await where()).panel);
  }
  const after = await where();
  check(
    `${mode}: Back closes them newest first, then the plan`,
    steps,
    steps.slice(0, 3).join() === 'lineDetail,detail,screen-plan' && after.ways === 0,
  );
  await click('#menuBtn');
  await wait(700);
  await click('button[data-screen="more"]');
  await wait(900);
  const s = await where();
  await back();
  const m = await where();
  await back();
  const none = await where();
  check(
    `${mode}: Back closes settings, then the menu`,
    { s, m, none },
    s.settings && !m.settings && m.menu && !none.menu,
  );
  // the X on the folded bar starts over: every panel closes and the plan is cleared, whatever was opened from it
  await planTo('Dizengoff Center');
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await click('.journey');
  await wait(2500);
  await click('#detail .leg [class*="chip"]');
  await wait(3000);
  const under = await where();
  await page.tap('#sumClear');
  await wait(1500);
  const cleared = await where();
  const sheet = await page.evaluate(() => document.getElementById('sheet')?.dataset.state);
  check(
    `${mode}: the folded bar's X over a line opened from a way clears everything`,
    { under, cleared, sheet },
    under.panel === 'lineDetail' && cleared.panel === 'screen-plan' && cleared.ways === 0 && sheet === 'peek',
  );
  await finish();
}
