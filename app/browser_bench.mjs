// Headless-Chromium benchmark of feasibility.html, to measure the router in a real browser.
//   node app/browser_bench.mjs "מרכזית המפרץ" "מרכזית באר שבע" 08:00
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '..');
const files = {
  '/': ['app/feasibility.html', 'text/html; charset=utf-8'],
  '/raptor.js': ['app/raptor.js', 'text/javascript'],
  '/timetable.bin.gz': ['data/timetable.bin.gz', 'application/octet-stream'],
};
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const f = files[url.pathname];
  if (!f) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': f[1] });
  res.end(readFileSync(path.join(root, f[0])));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

let chromium, lastErr;
for (const base of ['/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright', root + '/node_modules/playwright']) {
  try { chromium = createRequire(import.meta.url)(base).chromium; break; } catch (e) { lastErr = e; }
}
if (!chromium) throw new Error('playwright not found: ' + (lastErr && lastErr.message));
const [fromQ = 'מרכזית המפרץ', toQ = 'מרכזית באר שבע', at = '08:00'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/?from=${encodeURIComponent(fromQ)}&to=${encodeURIComponent(toQ)}&at=${at}`);
await page.waitForSelector('#run:not([disabled])', { timeout: 120000 });
console.log(`page ready in ${Date.now() - t0} ms`);
console.log('load:', (await page.textContent('#loadStats')).replace(/\s+/g, ' ').trim());
console.log('from:', await page.inputValue('#from'), (await page.textContent('#from option:checked')).trim());
console.log('to:  ', await page.inputValue('#to'), (await page.textContent('#to option:checked')).trim());
await page.click('#run');
await page.waitForSelector('#result:not([hidden])');
console.log('single run:', await page.textContent('#ms'), '|', await page.textContent('#verdict'));
await page.click('#bench');
await page.waitForTimeout(100);
console.log('10 runs:   ', await page.textContent('#ms'), '|', await page.textContent('#verdict'));
console.log((await page.textContent('#journeys')).replace(/\s+/g, ' ').trim().slice(0, 600));
console.log('ua:', await page.textContent('#ua'));
await browser.close();
server.close();
