// How the roads' colours come out of the live relay's last minutes, replayed through the real road model (the data
// worker's traffic.ts) in Node, two ways: the steady state (a snapshot a minute for 15 minutes, as the app sees after a
// quarter of an hour open) and the cold start (what the app shows the moment the learned times are in: the snapshot of
// 10 minutes before and the current one, or any list of minutes). Prints how many sections each colours, the share per
// level, and how the two agree where both colour a section. Measuring, not testing (2026-11-05, the maintainer: "I
// think now the traffic of roads shows incorrect data? Probably due to your caching?").
//
//   node --experimental-strip-types measure/trafficreplay.ts [site] [cold minutes, e.g. 10,0]   (default: the live site, 10,0)
//
// The worker modules expect a worker's globals: a `self` with postMessage and location is given here.
export {}; // a module, so the top level may await
const SITE = process.argv[2] && !/^\d/.test(process.argv[2]) ? process.argv[2] : 'https://akensio.github.io/wayli/';
const COLD = (process.argv.find((a, i) => i >= 2 && /^\d/.test(a)) || '10,0').split(',').map(Number);
(globalThis as any).self = { postMessage() {}, location: { href: SITE } };
const { dataOps } = await import('../src/worker/data.ts');
const { snapVehicles, snapTime } = await import('../src/worker/vehicles.ts');
const { noteRoads, trafficOps } = await import('../src/worker/traffic.ts');
const RELAY = 'https://wayli-relay.wayli.workers.dev/siri/latest';
const BOX = { south: 31.95, north: 32.2, west: 34.7, east: 34.95 }; // greater Tel Aviv

const manifest = await (await fetch(SITE + 'data/manifest.json', { cache: 'no-store' })).json();
const file = (f: { file: string; hash?: string; built?: string }) =>
  `${SITE}data/${f.file}?v=${f.hash || f.built || ''}`;
async function load(): Promise<void> {
  const day = manifest.days[0];
  await dataOps.loadTimetable({ url: file(day), bytes: day.bytes }); // also resets the road model (the day's hooks)
  if (manifest.bustimes) await dataOps.loadBusTimes({ url: file(manifest.bustimes), bytes: manifest.bustimes.bytes });
}
async function snapshot(ago: number): Promise<{ t: number; j: any }> {
  const r = await fetch(`${RELAY}?ago=${ago}`, { cache: 'no-store' });
  const id = r.headers.get('x-snapshot') || '';
  return { t: snapTime(id), j: await r.json() };
}
type Feature = { properties: { level: number; x: number; n: number }; geometry: { coordinates: number[][] } };
const keyOf = (f: Feature) => {
  const c = f.geometry.coordinates;
  return `${c[0][0].toFixed(4)},${c[0][1].toFixed(4)}>${c[c.length - 1][0].toFixed(4)},${c[c.length - 1][1].toFixed(4)}`;
};
function summary(name: string, fs: Feature[]): Map<string, Feature> {
  const m = new Map(fs.map((f) => [keyOf(f), f]));
  const levels = [0, 1, 2, 3].map((l) => fs.filter((f) => f.properties.level === l).length);
  console.log(
    `${name}: ${fs.length} sections coloured; free ${levels[0]}, slow ${levels[1]}, jammed ${levels[2]}, stuck ${levels[3]}`,
  );
  return m;
}

console.log(`site ${SITE}, day ${manifest.days[0].date}, replaying the relay's last 15 minutes`);
const snaps = new Map<number, { t: number; j: any }>();
for (let ago = 15; ago >= 0; ago--) snaps.set(ago, await snapshot(ago));
console.log('snapshots', [...snaps.values()].map((s) => new Date(s.t).toISOString().slice(11, 16)).join(' '));
await dataOps.loadShapes({ url: file(manifest.shapes), bytes: manifest.shapes.bytes }); // courses: buses placed on them

await load();
for (let ago = 15; ago >= 0; ago--) noteRoads(snapVehicles(snaps.get(ago)!.j, snaps.get(ago)!.t));
const steady = summary(
  'steady state (a snapshot a minute, 15 minutes)',
  trafficOps.traffic({ box: BOX }).features as unknown as Feature[],
);

await load();
for (const ago of [...COLD].sort((a, b) => b - a)) noteRoads(snapVehicles(snaps.get(ago)!.j, snaps.get(ago)!.t));
const cold = summary(
  `cold start (minutes ago: ${[...COLD].sort((a, b) => b - a).join(', ')})`,
  trafficOps.traffic({ box: BOX }).features as unknown as Feature[],
);

const both = [...cold.keys()].filter((k) => steady.has(k));
const agree = both.filter((k) => cold.get(k)!.properties.level === steady.get(k)!.properties.level).length;
const worse = both.filter((k) => cold.get(k)!.properties.level > steady.get(k)!.properties.level).length;
const better = both.length - agree - worse;
console.log(
  `sections coloured by both: ${both.length}; same level ${agree}, cold start worse ${worse}, cold start better ${better}`,
);
const onlyCold = cold.size - both.length;
console.log(
  `coloured only at the cold start: ${onlyCold} (levels: ${[0, 1, 2, 3].map((l) => [...cold].filter(([k, f]) => !steady.has(k) && f.properties.level === l).length).join('/')}); only in the steady state: ${steady.size - both.length}`,
);
