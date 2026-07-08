/**
 * Validates a user- or feed-supplied EPG source URL. Only http/https are
 * accepted — this is the primary XSS/SSRF-ish guard for the whole app, since
 * this URL comes straight from the address bar (`?url=`) or a pasted string,
 * both untrusted. Returns the parsed URL on success, or null.
 */
export function validateSourceUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url;
}

/**
 * Validates a channel icon URL pulled out of the parsed XML (also untrusted
 * — it comes from whatever feed the user pointed us at). Slightly more
 * permissive than validateSourceUrl since `data:` icons are legitimate and
 * already allowed by the CSP's `img-src`.
 */
export function validateImageUrl(input: string | undefined): string | null {
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'data:') {
    return url.toString();
  }
  return null;
}

export type Compression = 'gzip' | 'xz' | 'none';

/** Works for both a URL pathname and a plain local filename. */
export function guessCompressionFromName(name: string): Compression {
  const lower = name.toLowerCase();
  if (lower.endsWith('.gz')) return 'gzip';
  if (lower.endsWith('.xz')) return 'xz';
  return 'none';
}

export function guessCompression(url: URL): Compression {
  return guessCompressionFromName(url.pathname);
}
