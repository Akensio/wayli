// The map's own controls and bubbles: locate (a tap follows the rider, a second zooms in, a drag lets go), the compass
// (hidden while north is up), a place's bubble and planning to it, a stop's bubble over the results, and choosing a
// saved place by pointing at the map.
import { start, check, HERE } from './harness.mjs';

const { page, wait, shown, click, count, text, finish } = await start();
const cam = () =>
  page.evaluate(() => {
    const m = window.wayliDebug.map,
      c = m.getCenter();
    return {
      zoom: +m.getZoom().toFixed(2),
      lat: +c.lat.toFixed(4),
      lon: +c.lng.toFixed(4),
      bearing: +m.getBearing().toFixed(1),
    };
  });
const near = (c) => Math.abs(c.lat - HERE.latitude) < 0.01 && Math.abs(c.lon - HERE.longitude) < 0.01;

// the compass first: once locate follows the rider, the camera is the rider's
const hiddenAt = () =>
  page.evaluate(() =>
    document.querySelector('.maplibregl-ctrl-compass').closest('.maplibregl-ctrl').classList.contains('wayli-hidden'),
  );
const flat = await hiddenAt();
await page.evaluate(() => window.wayliDebug.map.setBearing(40));
await wait(300);
const turned = await hiddenAt();
// a tap asks the map to turn north. The turn itself is MapLibre's animation, which runs on the clock the harness holds
// at a fixed time, so it may not move here: the check is that the compass asks, and the turn is then finished by hand.
const north = await page.evaluate(() => {
  const m = window.wayliDebug.map;
  let asked = false;
  const reset = m.resetNorthPitch.bind(m);
  m.resetNorthPitch = (...a) => ((asked = true), reset(...a));
  document.querySelector('.maplibregl-ctrl-compass').click();
  m.resetNorthPitch = reset;
  m.stop();
  m.jumpTo({ bearing: 0, pitch: 0 });
  return asked;
});
await wait(300);
check(
  'compass: hidden with north up, shown turned, a tap turns north up',
  { flat, turned, north, hiddenAgain: await hiddenAt() },
  flat && !turned && north && (await hiddenAt()),
);

await page.evaluate(() => window.wayliDebug.map.jumpTo({ center: [34.85, 32.1], zoom: 12 }));
await wait(500);
await page.tap('.maplibregl-ctrl-geolocate');
await wait(2500);
const first = await cam();
check(
  'locate: the first tap brings the map to the rider',
  first,
  near(first) && (await count('.maplibregl-user-location-dot')) === 1,
);
await page.tap('.maplibregl-ctrl-geolocate');
await wait(1200);
const second = await cam();
check('locate: a second tap zooms to the neighbourhood', second, second.zoom > first.zoom);
await page.mouse.move(200, 300);
await page.mouse.down();
await page.mouse.move(260, 360, { steps: 5 });
await page.mouse.up();
await wait(800);
const letGo = await page.evaluate(() =>
  document.querySelector('.maplibregl-ctrl-geolocate').className.includes('background'),
);
await page.tap('.maplibregl-ctrl-geolocate');
await wait(1200);
check('locate: a drag lets go, a tap brings it back', { letGo }, letGo && near(await cam()));

await page.evaluate(
  ([lon, lat]) => window.wayliDebug.map.jumpTo({ center: [lon, lat], zoom: 16 }),
  [HERE.longitude, HERE.latitude],
);
await wait(1500);
const at = await page.evaluate(() => {
  const r = document.getElementById('mainMap').getBoundingClientRect();
  return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.3 };
});
await page.mouse.click(at.x, at.y);
await wait(2500);
const place = await text('.wayli-pop .pop b');
check("a tap on the map: the place's bubble", { place }, !!place && (await count('.wayli-pop button')) > 0);
await click('.wayli-pop .primary');
await wait(6000);
check('"to here" plans to it', {}, (await count('.journey')) > 0 && (await count('.wayli-pop')) === 0);

const stop = await page.evaluate(() => {
  const m = window.wayliDebug.map,
    layers = ['journey-stops', 'journey-stations', 'lm-stops', 'lm-stations'].filter((l) => m.getLayer(l)),
    f = m.queryRenderedFeatures({ layers })[0];
  if (!f) return null;
  const p = m.project(f.geometry.coordinates),
    c = m.getContainer().getBoundingClientRect();
  return { x: c.left + p.x, y: c.top + p.y };
});
if (stop) {
  await page.mouse.click(stop.x, stop.y);
  await wait(2500);
}
check(
  'a stop on the drawn way: its bubble with its lines',
  { title: await text('.wayli-pop .pop b') },
  !!stop && (await count('.wayli-pop .lchip')) > 0,
);

await click('#menuBtn');
await wait(700);
await click('button[data-screen="saved"]');
await wait(900);
await click('#savedPlaces .txt', 1);
await wait(900);
await click('#chMap');
await wait(1500);
const mid = await page.evaluate(() => {
  const r = document.getElementById('mainMap').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.click(mid.x, mid.y);
await wait(3000);
const name = await text('.wayli-pop .pop b');
await click('.wayli-pop .primary');
await wait(1500);
check('a saved place chosen by pointing at the map', { name }, !!name && !(await shown('chooser')));

await finish();
