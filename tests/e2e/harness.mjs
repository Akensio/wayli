// What the browser smokes share: the built site served from site/ on a free port, a phone-sized Chromium on the first
// service day the site carries (09:30, the rider near HaShalom station), the page's errors collected, small helpers,
// and checks that print each step and set the exit code. Playwright is not a dependency of the app: it is found from
// this folder's node_modules or at the path in $PLAYWRIGHT.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.gz': 'application/gzip',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};
/** A public spot by HaShalom station, where the smokes put the rider. */
export const HERE = { latitude: 32.0733, longitude: 34.7932 };

function playwright() {
  const req = createRequire(import.meta.url);
  for (const where of [process.env.PLAYWRIGHT, 'playwright'].filter(Boolean))
    try {
      return req(where);
    } catch {
      /* the next place */
    }
  console.error('Playwright not found: npm i -D playwright (not kept in package.json), or set PLAYWRIGHT=<its path>.');
  process.exit(2);
}

/** The static site with Range requests (the app fetches big files in pieces). */
function serve() {
  if (!existsSync(path.join(ROOT, 'data/manifest.json'))) {
    console.error('No built site with data in site/: run the build (pipeline/build_site.py) first.');
    process.exit(2);
  }
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !existsSync(f) || !statSync(f).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const body = readFileSync(f),
      type = TYPES[path.extname(f)] || 'application/octet-stream',
      m = /bytes=(\d+)-(\d+)?/.exec(req.headers.range || '');
    if (m) {
      const a = +m[1],
        b = m[2] ? +m[2] : body.length - 1;
      res.writeHead(206, {
        'content-type': type,
        'content-range': `bytes ${a}-${b}/${body.length}`,
        'accept-ranges': 'bytes',
      });
      res.end(body.subarray(a, b + 1));
      return;
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': body.length });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let failures = 0;
/** One step: its result printed, and whether it holds; a failed check fails the run. */
export function check(name, result, ok) {
  const pass = !!ok;
  if (!pass) failures++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(result)}`);
}

/** A browser on the app. `android`: Back as a CloseWatcher (Escape); otherwise browser history. */
export async function start({ android = true, settings = { lang: 'en' } } = {}) {
  const pw = playwright();
  const server = await serve();
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data/manifest.json'), 'utf8'));
  const day = manifest.days[0].date;
  const browser = await pw.chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const dev = pw.devices['Pixel 5'];
  const ctx = await browser.newContext({
    ...dev,
    userAgent: android
      ? dev.userAgent
      : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
    geolocation: HERE,
    permissions: ['geolocation'],
    locale: 'en-GB',
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200));
  });
  await page.clock.setFixedTime(new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T06:30:00Z`));
  await page.addInitScript((s) => {
    try {
      localStorage.setItem('wayli-settings', JSON.stringify(s));
    } catch {
      /* private mode */
    }
  }, settings);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page
    .waitForFunction(() => !document.querySelector('#status')?.textContent?.includes('…'), null, { timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(12000);

  const wait = (ms) => page.waitForTimeout(ms);
  const h = {
    page,
    errors,
    wait,
    /** Whether the element with this id is there and not hidden. */
    shown: (id) => page.evaluate((id) => !!document.getElementById(id) && !document.getElementById(id).hidden, id),
    /** Click the nth match; false when there is none. */
    click: (sel, nth = 0) =>
      page.evaluate(
        ([sel, nth]) => {
          const el = document.querySelectorAll(sel)[nth];
          if (el) el.click();
          return !!el;
        },
        [sel, nth],
      ),
    count: (sel) => page.evaluate((sel) => document.querySelectorAll(sel).length, sel),
    text: (sel) => page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim().slice(0, 60) ?? null, sel),
    value: (sel) => page.evaluate((sel) => document.querySelector(sel)?.value ?? null, sel),
    /** The phone's Back: Escape is a close request (CloseWatcher) on Android, history elsewhere. */
    back: async (n = 1) => {
      for (let i = 0; i < n; i++) {
        if (android) await page.keyboard.press('Escape');
        else await page.goBack();
        await wait(800);
      }
    },
    /** Plan to a place typed in the To box, taking the first result. */
    planTo: async (q) => {
      await page.tap('#toQ');
      await wait(700);
      await page.fill('#toQ', q);
      await wait(2000);
      await page.tap('#toDrop button:not(.quick)');
      await wait(7000);
    },
    /** Close the browser and the server; the exit code says whether every check and the page held. */
    finish: async () => {
      check('no errors on the page', errors.length ? errors : 'none', errors.length === 0);
      await browser.close();
      server.close();
      if (failures) {
        console.log(`${failures} failed`);
        process.exitCode = 1;
      }
    },
  };
  return h;
}
