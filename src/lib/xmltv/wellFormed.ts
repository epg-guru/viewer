export interface WellFormedResult {
  ok: boolean;
  message?: string;
  /** 1-based line/column within the fragment, when the browser's parser reports one. */
  line?: number;
  column?: number;
}

// Chrome/Firefox/Safari all report parsererror text roughly as
// "... error on line 2 at column 15: ...", but the exact phrasing isn't
// standardized. Best-effort extraction; falls back to just showing the text.
const LINE_COL_RE = /line\s+(\d+)(?:[^\d]+column\s+(\d+))?/i;

/**
 * Checks a single extracted XML fragment (one <channel>...</channel> or
 * <programme>...</programme> element) for well-formedness. Fragments are
 * parsed standalone, so undeclared entities from the original document
 * (rare in XMLTV, but possible) will read as errors here even though the
 * full document might define them — that's an acceptable tradeoff for
 * being able to validate a fragment in isolation without the whole file.
 */
export function checkWellFormed(fragment: string): WellFormedResult {
  const doc = new DOMParser().parseFromString(fragment, 'application/xml');
  const errorNode = doc.querySelector('parsererror');
  if (!errorNode) return { ok: true };

  const text = errorNode.textContent?.trim() ?? 'XML parse error';
  const match = LINE_COL_RE.exec(text);
  return {
    ok: false,
    message: text,
    line: match?.[1] ? Number(match[1]) : undefined,
    column: match?.[2] ? Number(match[2]) : undefined,
  };
}
