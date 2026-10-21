// Wayli's real-time relay, a Cloudflare Worker (AGPL-3.0).
// Hasadna publishes the Ministry of Transport's SIRI feed as one brotli-compressed JSON file a minute
// (https://open-bus-siri-requester.hasadna.org.il/, YYYY/MM/DD/HH/MM.br in UTC), about a minute old, while their
// database runs up to 15 minutes behind at rush hour (measured 2026-10-21). The files carry no CORS header, so a
// browser cannot read them. This passes the newest file through untouched, labelled as brotli-encoded JSON so the
// browser unpacks it itself, with the header added. The request has no parameters: nothing about the rider is sent.
const BASE = 'https://open-bus-siri-requester.hasadna.org.il';
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-snapshot' };
const fail = (status, text) => new Response(text, { status, headers: { ...CORS, 'content-type': 'text/plain' } });

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...CORS, 'access-control-allow-methods': 'GET' } });
    if (req.method !== 'GET' || new URL(req.url).pathname !== '/siri/latest') return fail(404, 'not found');
    // which minute is the newest (rewritten by Hasadna's requester every minute)
    const st = await fetch(`${BASE}/daemon_status.json`, { cf: { cacheTtl: 10, cacheEverything: true } });
    if (!st.ok) return fail(502, 'status unavailable');
    const id = (await st.json()).last_snapshot_id;
    if (!/^\d{4}\/\d\d\/\d\d\/\d\d\/\d\d$/.test(id || '')) return fail(502, 'unexpected status');
    // a minute's file never changes once written, so the edge may keep it
    const snap = await fetch(`${BASE}/${id}.br`, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!snap.ok) return fail(502, 'snapshot unavailable');
    return new Response(snap.body, {
      encodeBody: 'manual',
      headers: { ...CORS, 'content-type': 'application/json', 'content-encoding': 'br', 'cache-control': 'public, max-age=15', 'x-snapshot': id },
    });
  },
};
