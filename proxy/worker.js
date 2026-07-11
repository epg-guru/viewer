// Optional serverless CORS proxy for EPG Viewer.
//
// Deploy this yourself (see README.md) and paste its URL into the app's
// Settings menu. It's used ONLY as a fallback when a direct browser fetch
// to an EPG source is blocked by CORS. It re-adds permissive CORS headers
// scoped to your deployed app's origin, and includes basic SSRF/abuse
// guards. This is NOT a general-purpose open proxy — anyone who can reach
// it can make it fetch any public http(s) URL on your behalf, so keep
// ALLOWED_ORIGIN scoped to your own app and don't treat this as a security
// boundary for anything sensitive.

// TODO: set this to your deployed app's exact origin, e.g.
// "https://viewer.epg.guru".
const ALLOWED_ORIGIN = 'https://viewer.epg.guru';

// Best-effort cap — only enforced when upstream sends Content-Length.
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024 * 1024;

// Blocks the obvious private/internal ranges, including the cloud metadata
// endpoint (169.254.169.254) that SSRF attacks commonly target. Not
// exhaustive (DNS rebinding, IPv6-mapped IPv4, etc. aren't covered) — this
// is a best-effort guard, not a hardened SSRF filter.
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

function isBlockedHostname(hostname) {
  return BLOCKED_HOSTNAME_PATTERNS.some((re) => re.test(hostname));
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('url');
    if (!target) {
      return new Response('Missing ?url= parameter', { status: 400, headers: corsHeaders() });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response('Invalid target URL', { status: 400, headers: corsHeaders() });
    }

    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return new Response('Only http/https targets are allowed', { status: 400, headers: corsHeaders() });
    }
    if (isBlockedHostname(targetUrl.hostname)) {
      return new Response('Target host is not allowed', { status: 400, headers: corsHeaders() });
    }

    let upstream;
    try {
      upstream = await fetch(targetUrl.toString(), { method: request.method, redirect: 'follow' });
    } catch (err) {
      return new Response(`Upstream fetch failed: ${err}`, { status: 502, headers: corsHeaders() });
    }

    const contentLength = Number(upstream.headers.get('content-length'));
    if (contentLength && contentLength > MAX_RESPONSE_BYTES) {
      return new Response('Upstream response too large', { status: 413, headers: corsHeaders() });
    }

    const headers = new Headers(corsHeaders());
    for (const key of ['content-type', 'content-length', 'content-encoding']) {
      const value = upstream.headers.get(key);
      if (value) headers.set(key, value);
    }

    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
