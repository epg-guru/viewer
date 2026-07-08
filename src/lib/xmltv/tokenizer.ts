import { indexOfBytes, pattern, decodeUtf8 } from './bytes';

// Fast, incremental, best-effort XMLTV boundary scanner. It finds
// <channel>/<programme> element boundaries at the byte level (safe even
// with multi-byte UTF-8 content, see bytes.ts) WITHOUT decoding or
// extracting any fields, that's deliberately left to the caller (see
// fieldExtraction.ts), so this same scanner can be reused two ways: the
// coordinator worker uses it to find safe cut points for segmenting the
// stream (cheap), and each parser-pool worker uses it again, independently,
// to walk the elements within its own segment and extract fields (the
// expensive part, done in parallel). It is deliberately NOT a full XML
// parser: genuine well-formedness checking happens per-fragment, on demand,
// via DOMParser when a user clicks a cell (see wellFormed.ts). Anything this
// scanner can't cleanly bound gets flagged `malformed` rather than dropped.
//
// Consumed bytes are tracked via a cursor, NOT by re-slicing `pending` after
// every element, slicing (copying) the shrinking-but-still-huge remainder
// after each of potentially tens of thousands of elements in one buffer is
// classic accidental O(n²) (this bit a first version badly: a 16MB segment
// with ~30,000 elements pushed in one call effectively copied hundreds of
// GB before finishing). The buffer is only compacted, consumed prefix
// actually dropped, once per push(), which is cheap and amortizes fine
// whether fed many small streaming chunks (the coordinator) or one large
// blob at once (a segment-parser worker).

const P_TV_OPEN = pattern('<tv');
const P_CHANNEL_OPEN = pattern('<channel');
const P_CHANNEL_CLOSE = pattern('</channel>');
const P_PROGRAMME_OPEN = pattern('<programme');
const P_PROGRAMME_CLOSE = pattern('</programme>');
const P_GT = pattern('>');

// Safety valve: if an element hasn't closed within this many pending bytes,
// stop waiting and flag it malformed rather than buffering indefinitely.
const MAX_PENDING_BYTES = 8 * 1024 * 1024;

export type ElementKind = 'channel' | 'programme';

export interface BoundaryCallbacks {
  /** `bytes` is a view into this scanner's internal buffer, valid only
   * synchronously during the callback, copy it if you need to keep it
   * (the coordinator does, to build segments; see epgParser.worker.ts). */
  onElement(which: ElementKind, bytes: Uint8Array, byteStart: number, byteEnd: number, malformed: boolean): void;
  /** Raw `<tv ...>` open-tag source, for the caller to pull attributes from. */
  onHeader(tagSrc: string): void;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export class XmltvBoundaryScanner {
  private pending: Uint8Array = new Uint8Array(0);
  private cursor = 0; // read position within `pending`, bytes before this are fully consumed
  private pendingBase = 0; // absolute byte offset of pending[0] in the overall stream
  private sawHeader = false;
  private readonly cb: BoundaryCallbacks;
  // Real feeds list every <channel> before any <programme> (or vice versa in
  // segments split mid-file), so once a search for one pattern comes up
  // empty in the current pending buffer, it stays empty until more data
  // arrives, caching that avoids re-scanning the (potentially many-MB)
  // remainder on every single element for the pattern that isn't there.
  // Without this, a 16MB segment that's ~15,000 back-to-back <programme>
  // elements would re-scan toward the end hunting for a nonexistent
  // <channel> on every one of those 15,000 iterations, O(n²) in disguise.
  private channelExhausted = false;
  private programmeExhausted = false;

  channelsSeen = 0;
  programmesSeen = 0;

  constructor(cb: BoundaryCallbacks) {
    this.cb = cb;
  }

  /** Feed the next chunk of bytes, in stream order. Any chunk size works,
   * many small streaming chunks or one large blob are both O(total bytes). */
  push(chunk: Uint8Array): void {
    if (this.cursor > 0) {
      this.pending = this.pending.slice(this.cursor);
      this.pendingBase += this.cursor;
      this.cursor = 0;
    }
    this.pending = concat(this.pending, chunk);
    this.channelExhausted = false;
    this.programmeExhausted = false;
    this.drain(false);
  }

  /** Call once after the stream ends to flush/finalize any leftover element. */
  finish(): void {
    this.drain(true);
  }

  private drain(isFinal: boolean): void {
    if (!this.sawHeader) this.tryParseHeader();

    for (;;) {
      const nextChannel = this.channelExhausted ? -1 : indexOfBytes(this.pending, P_CHANNEL_OPEN, this.cursor);
      if (nextChannel === -1) this.channelExhausted = true;
      const nextProgramme = this.programmeExhausted ? -1 : indexOfBytes(this.pending, P_PROGRAMME_OPEN, this.cursor);
      if (nextProgramme === -1) this.programmeExhausted = true;
      if (nextChannel === -1 && nextProgramme === -1) break;

      const which: ElementKind =
        nextChannel !== -1 && (nextProgramme === -1 || nextChannel < nextProgramme) ? 'channel' : 'programme';
      const openAt = which === 'channel' ? nextChannel : nextProgramme;
      const closePattern = which === 'channel' ? P_CHANNEL_CLOSE : P_PROGRAMME_CLOSE;
      const closeAt = indexOfBytes(this.pending, closePattern, openAt);

      if (closeAt === -1) {
        if (isFinal) {
          this.emit(which, openAt, this.pending.length, true);
          this.cursor = this.pending.length;
        } else if (this.pending.length - openAt > MAX_PENDING_BYTES) {
          this.emit(which, openAt, this.pending.length, true);
          this.cursor = openAt + 1;
        }
        break;
      }

      const elEnd = closeAt + closePattern.length;
      this.emit(which, openAt, elEnd, false);
      this.cursor = elEnd;
    }
  }

  private emit(which: ElementKind, openAt: number, endAt: number, malformed: boolean): void {
    if (which === 'channel') this.channelsSeen++;
    else this.programmesSeen++;
    this.cb.onElement(which, this.pending.subarray(openAt, endAt), this.pendingBase + openAt, this.pendingBase + endAt, malformed);
  }

  private tryParseHeader(): void {
    const openAt = indexOfBytes(this.pending, P_TV_OPEN);
    if (openAt === -1) return;
    const gtAt = indexOfBytes(this.pending, P_GT, openAt);
    if (gtAt === -1) return; // wait for more bytes
    this.cb.onHeader(decodeUtf8(this.pending.subarray(openAt, gtAt + 1)));
    this.sawHeader = true;
  }
}
