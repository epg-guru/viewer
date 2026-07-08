// XML tag delimiters ('<', '>', '/', ASCII letters) are all single-byte
// values below 0x80, and UTF-8 continuation bytes are always >= 0x80, so
// scanning raw bytes for these markers is safe even when attribute/text
// content elsewhere in the buffer is multi-byte UTF-8.

const encoder = new TextEncoder();

/** Naive byte-pattern search — fine here since patterns are short (tag names)
 * and buffers are small (a handful of pending elements at most). */
export function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  const end = haystack.length - needle.length;
  outer: for (let i = Math.max(from, 0); i <= end; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

export function pattern(s: string): Uint8Array {
  return encoder.encode(s);
}

const decoder = new TextDecoder('utf-8', { fatal: false });

export function decodeUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

const ENTITY_RE = /&(amp|lt|gt|quot|apos|#x?[0-9a-fA-F]+);/g;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Minimal XML entity decoder for the small attribute/text fragments we
 * extract during indexing (display-name, title, icon href). Not a full XML
 * parser — just enough for what shows up in real-world XMLTV feeds. */
export function decodeXmlEntities(s: string): string {
  return s.replace(ENTITY_RE, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[body] ?? m;
  });
}

export function extractAttr(tagSource: string, name: string): string | undefined {
  const re = new RegExp(`[\\s"']${name}\\s*=\\s*"([^"]*)"|^${name}\\s*=\\s*"([^"]*)"`);
  const m = re.exec(tagSource);
  const value = m?.[1] ?? m?.[2];
  return value !== undefined ? decodeXmlEntities(value) : undefined;
}

export function extractFirstElementText(source: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
  const m = re.exec(source);
  return m ? decodeXmlEntities(m[1].trim()) : undefined;
}

/** Strips all tags from an element's source, leaving the concatenated text
 * content of every child (display-name variants, gnid, lcn, credits,
 * whatever a feed includes) — a broad net for search, not a specific field
 * extraction. Lowercased since it's only ever used for case-insensitive
 * matching. */
export function extractSearchText(source: string): string {
  return decodeXmlEntities(source.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
