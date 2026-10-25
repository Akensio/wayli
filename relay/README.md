# relay: the real-time relay

`relay.js` is a Cloudflare Worker (free plan) at
https://wayli-relay.wayli.workers.dev: it serves Hasadna's newest raw SIRI
snapshot with CORS, so the app gets live positions about a minute old.
`.github/workflows/relay.yml` deploys it whenever this folder changes,
with the repository's `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
secrets; `wrangler.toml` is its configuration.
