// Wayli's real-time relay, a Cloudflare Worker (AGPL-3.0).
// Hasadna publishes the Ministry of Transport's SIRI feed as one brotli-compressed JSON file a minute
// (https://open-bus-siri-requester.hasadna.org.il/, YYYY/MM/DD/HH/MM.br in UTC), about a minute old, while their
// database runs up to 15 minutes behind at rush hour (measured 2026-10-21). The files carry no CORS header, so a
// browser cannot read them. This passes the newest file through untouched, labelled as brotli-encoded JSON so the
// browser unpacks it itself, with the header added. Nothing about the rider is sent: the one parameter, ?ago=N (0-10),
// asks for the snapshot N minutes before the newest (the app compares two to spot positions that froze).
const BASE = 'https://open-bus-siri-requester.hasadna.org.il';
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-snapshot' };
const fail = (status, text) => new Response(text, { status, headers: { ...CORS, 'content-type': 'text/plain' } });

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...CORS, 'access-control-allow-methods': 'GET' } });
    const url = new URL(req.url);
    if (req.method !== 'GET' || url.pathname !== '/siri/latest') return fail(404, 'not found');
    const ago = Math.max(0, Math.min(10, parseInt(url.searchParams.get('ago') || '0', 10) || 0));
    // which minute is the newest (rewritten by Hasadna's requester every minute)
    const st = await fetch(`${BASE}/daemon_status.json`, { cf: { cacheTtl: 10, cacheEverything: true } });
    if (!st.ok) return fail(502, 'status unavailable');
    const last = (await st.json()).last_snapshot_id;
    const m = /^(\d{4})\/(\d\d)\/(\d\d)\/(\d\d)\/(\d\d)$/.exec(last || '');
    if (!m) return fail(502, 'unexpected status');
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - ago * 60e3), p = (n) => String(n).padStart(2, '0');
    const id = `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${p(d.getUTCHours())}/${p(d.getUTCMinutes())}`;
    // a minute's file never changes once written, so the edge may keep it
    const snap = await fetch(`${BASE}/${id}.br`, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!snap.ok) return fail(502, 'snapshot unavailable');
    return new Response(snap.body, {
      encodeBody: 'manual',
      headers: { ...CORS, 'content-type': 'application/json', 'content-encoding': 'br', 'cache-control': 'public, max-age=15', 'x-snapshot': id },
    });
  },
};
