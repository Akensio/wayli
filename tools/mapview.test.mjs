// The map follows the sheet (src/map/view.ts): node tools/mapview.test.mjs (exits 1 on a failure). Each row of the
// table the principle was agreed on, then the camera's visible part of the screen.
import assert from 'node:assert/strict';
import { viewFor, visibleArea, centreOffset } from '../src/map/view.ts';

const v = (key, more = {}) => viewFor({ key, ...more });
// nothing searched: the rider's area, every vehicle with the lines near them in front, the camera left alone
assert.deepEqual(v('screen-plan'), { draw: 'nothing', context: false, camera: 'keep', maxZoom: 16, live: 'near' });
// results: the ways, fitted, only their lines' vehicles
assert.equal(v('screen-plan', { results: true }).draw, 'ways');
assert.equal(v('screen-plan', { results: true }).live, 'results');
assert.equal(v('screen-plan', { results: true }).camera, 'fit');
// one way: it and its whole lines faint; fitted, or the ride tapped; its own vehicles
assert.deepEqual(v('detail'), { draw: 'journey', context: true, camera: 'fit', maxZoom: 16, live: 'own' });
assert.equal(v('detail', { focus: 1 }).camera, 'focus');
// following: the trip, its own vehicle
assert.equal(v('follow').draw, 'journey'); assert.equal(v('follow').live, 'own'); assert.equal(v('follow').context, false);
// a line: its course and stops, its own vehicles
assert.equal(v('lineDetail').draw, 'line'); assert.equal(v('lineDetail').live, 'own');
// a stop: its pin, its lines' courses faint, the camera on it, only its lines' vehicles
assert.deepEqual(v('stopDetail'), { draw: 'stop', context: true, camera: 'point', maxZoom: 15, live: 'stop' });
// stops near me: the ring, fitted
assert.equal(v('screen-nearby').draw, 'ring'); assert.equal(v('screen-nearby').camera, 'fit');
// the trains between two stations: their courses, fitted, only their vehicles
assert.equal(v('trainTimes').draw, 'pair'); assert.equal(v('trainTimes').live, 'stop');
// choosing a point: the map alone, no vehicles; pages and anything else: the camera stays
assert.equal(v('picker').live, 'none'); assert.equal(v('picker').draw, 'nothing');
for (const k of ['screen-saved', 'chooser', 'whatever']) { assert.equal(v(k).draw, 'nothing'); assert.equal(v(k).camera, 'keep'); }
// every view draws something it can be fitted to, or keeps the camera
for (const k of ['screen-plan', 'detail', 'follow', 'lineDetail', 'stopDetail', 'trainTimes', 'screen-nearby', 'picker']) {
  const x = v(k, { results: true });
  assert.ok(x.camera === 'keep' || x.draw !== 'nothing', `${k}: a camera move with nothing to aim at`);
}

// the camera's part of the screen: between the bar and the sheet, so a centred point lands mid-way between them
const pad = visibleArea(800, 100, 368);   // a phone 800 px tall, the bar ending at 100, the sheet half open
assert.equal(pad.top, 112); assert.equal(pad.bottom, 384);
const [, dy] = centreOffset(pad);
const centreY = 400 + dy;                  // where the point lands: the screen's middle plus the offset
assert.equal(centreY, pad.top + (800 - pad.top - pad.bottom) / 2, 'mid-way between bar and sheet');
// a sheet over most of the screen still leaves the map a strip to aim at
const tall = visibleArea(800, 100, 780);
assert.ok(800 - tall.top - tall.bottom >= 120);

console.log('mapview: the map follows the sheet ok');
