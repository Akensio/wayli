// The app's main flow in a browser: plan, a way's detail, its line, a stop, following a trip, the drawer's searches,
// settings and saved places. Every tap here calls a controller; each step says what must hold after it.
import { start, check } from './harness.mjs';

const { page, wait, shown, click, count, text, value, back, planTo, finish } = await start();

await planTo('Dizengoff Center');
check('plan to Dizengoff Center', { ways: await count('.journey') }, (await count('.journey')) > 0);

await click('.journey');
await wait(2500);
check('a way opens its detail', { title: await text('#detailTitle') }, await shown('detail'));

const chip = await click('#detail .leg [class*="chip"]');
await wait(3000);
const rows = await count('.linerow');
check("a ride's chip opens its line", { rows }, chip && (await shown('lineDetail')) && rows > 1);

await click('.linerow', 2);
await wait(1500);
const anchor = await page.evaluate(() =>
  [...document.querySelectorAll('.linerow')].findIndex((e) => e.classList.contains('anchor')),
);
check('a stop of the line becomes its anchor', { anchor }, anchor === 2);

check(
  'the other direction opens',
  {},
  (await click('#lineDetail .chipbtn')) && (await wait(3000), await shown('lineDetail')),
);

await click('.linerow.anchor .ghost.slim');
await wait(3000);
check("the anchor stop's page opens", {}, await shown('stopDetail'));

await click('#stopLive');
await wait(2500);
const deps = await count('#stopDetail .dep');
check('the stop lists its departures', { deps }, deps > 0);

await click('#stopDetail .linkchip');
await wait(3000);
const lineFromStop = await shown('lineDetail');
await click('.linerow.anchor .ghost.slim');
await wait(3000);
check(
  "a line chip on the stop's page opens the line, and back to the stop",
  {},
  lineFromStop && (await shown('stopDetail')),
);

await click('#stopFrom');
await wait(4000);
check(
  '"from here" plans from the stop',
  { from: await value('#fromQ') },
  (await count('.journey')) > 0 && !(await shown('stopDetail')),
);
await back(4);

await click('.journey');
await wait(2500);
await click('#detailStart');
await wait(3000);
const following = await shown('follow');
await click('#followSkip');
await wait(600);
await click('#followBack');
await wait(600);
await click('#followHide');
await wait(1200);
const resumeBar = await page.evaluate(() => !document.getElementById('resumeBar')?.hidden);
await click('#resumeBar');
await wait(1500);
const resumed = await shown('follow');
await click('#followEnd');
await wait(1500);
check(
  'follow a way: start, step, hide, resume, end',
  { following, resumeBar, resumed },
  following && resumeBar && resumed && !(await shown('follow')),
);
await back(2);

await click('#sumClear');
await wait(1500);
// the history under the cleared bar: the ways opened come first (a tap opens the way again), then the searches (a tap
// plans the search again, from now)
await click('.rsubs button', 0);
await wait(500);
await click('.recent');
await wait(2500);
check('cleared; a way opened earlier opens again from the history', {}, await shown('detail'));
await back(1);
await click('.rsubs button', 1);
await wait(500);
const searches = await count('.recent');
await click('.recent');
const replanned = await page
  .waitForFunction(() => document.querySelectorAll('.journey').length > 0, null, { timeout: 20000 })
  .then(() => true)
  .catch(() => false);
check('a search from the history is planned again', { searches }, searches > 0 && replanned);

await click('#menuBtn');
await wait(700);
await click('#menuLines');
await wait(800);
await page.fill('#toQ', '25');
await wait(1500);
const groups = await count('#toDrop .lgroup');
await click('#toDrop .lgroup .lhead');
await wait(3000);
check('the line search finds line 25 and opens it', { groups }, groups > 0 && (await shown('lineDetail')));
await back(3);

await click('#menuBtn');
await wait(700);
await click('#menuStops');
await wait(800);
await page.fill('#toQ', 'Dizengoff');
await wait(2000);
const stops = await count('#toDrop button:not(.quick)');
await click('#toDrop button:not(.quick)');
await wait(3000);
check('the stop search finds stops and opens one', { stops }, stops > 0 && (await shown('stopDetail')));
await back(3);

await click('#menuBtn');
await wait(700);
await click('button[data-screen="more"]');
await wait(900);
const settingsOpen = await page.evaluate(() => document.getElementById('settingsPage')?.classList.contains('open'));
await click('#settingsBack');
await wait(900);
check(
  'settings open and close',
  {},
  settingsOpen && !(await page.evaluate(() => document.getElementById('settingsPage')?.classList.contains('open'))),
);
await back(1);

await click('#menuBtn');
await wait(700);
await click('button[data-screen="saved"]');
await wait(900);
await click('#savedPlaces .txt');
await wait(900);
const chooser = await shown('chooser');
await click('#chLoc');
await wait(3500);
check('home set from my location', { home: await text('#savedPlaces .txt') }, chooser && !(await shown('chooser')));

await click('#savedPlaces .txt', 1);
await wait(900);
await click('#chMap');
await wait(1200);
const pickBar = await page.evaluate(() => !!document.getElementById('pickCancel')?.offsetParent);
await click('#pickCancel');
await wait(900);
check(
  'picking on the map starts and cancels',
  {},
  pickBar && !(await page.evaluate(() => !!document.getElementById('pickCancel')?.offsetParent)),
);
await back(2);

await finish();
