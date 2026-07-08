# Optional CORS proxy

EPG Viewer fetches EPG source URLs straight from the browser — no backend.
Most sources work fine, but some don't send permissive
`Access-Control-Allow-Origin` headers, which the browser will then block.

Two ways around that, in order of preference:

1. **Upload the file directly** (the app's "Upload" button) — bypasses CORS
   entirely since there's no cross-origin fetch involved.
2. **Deploy this proxy** and point the app at it (Settings menu in the app).
   The app only falls back to it when a direct fetch fails.

This is a small [Cloudflare Worker](https://developers.cloudflare.com/workers/)
that fetches a target URL server-side and re-adds CORS headers scoped to your
own deployed app origin. It stays within Cloudflare's free tier for typical
use.

## Deploy

1. `npm install -g wrangler` (or `npx wrangler`), then `wrangler login`.
2. Edit `worker.js` and set `ALLOWED_ORIGIN` to your deployed app's exact
   origin (e.g. `https://epg-guru.github.io`).
3. From this directory: `wrangler deploy`.
4. Copy the resulting `https://*.workers.dev` URL into the app's Settings
   menu (gear icon next to Presets).

## Security notes

- **Not a general-purpose open proxy.** `ALLOWED_ORIGIN` restricts which
  *web pages* can read the response via CORS, but anyone who can reach the
  worker's URL directly (curl, another script) can still make it fetch any
  public `http(s)` URL. Don't point it at anything you wouldn't want
  incidentally exposed.
- Blocks the obvious private/internal IP ranges (including the
  `169.254.169.254` cloud metadata endpoint) as a basic SSRF guard. This is
  best-effort, not a hardened filter — don't run this in front of anything
  sensitive.
- Caps response size at 2GB, but only when the upstream sends a
  `Content-Length` header.
- If you'd rather not run any infrastructure at all, just don't configure a
  proxy — the app works fine without one for any CORS-friendly source, and
  the Upload button always works regardless.
