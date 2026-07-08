import { indexOfBytes, pattern, decodeUtf8, extractAttr, extractFirstElementText, extractSearchText } from './bytes';
import type { EpgHeader, ChannelEntry, ProgrammeEntry } from './types';

// Fast, incremental, best-effort XMLTV scanner. It finds <channel>/<programme>
// element boundaries at the byte level (safe even with multi-byte UTF-8
// content — see bytes.ts) and extracts just the handful of fields the grid
// needs, without ever materializing the whole document as one string or DOM
// tree. It is deliberately NOT a full XML parser: genuine well-formedness
// checking happens per-fragment, on demand, via DOMParser when a user clicks
// a cell (see wellFormed.ts). Anything this scanner can't cleanly bound gets
// flagged `malformed` rather than dropped, so it still shows up in the grid.

const P_TV_OPEN = pattern('<tv');
const P_CHANNEL_OPEN = pattern('<channel');
const P_CHANNEL_CLOSE = pattern('</channel>');
const P_PROGRAMME_OPEN = pattern('<programme');
const P_PROGRAMME_CLOSE = pattern('</programme>');
const P_GT = pattern('>');

// Safety valve: if an element hasn't closed within this many pending bytes,
// stop waiting and flag it malformed rather than buffering indefinitely.
const MAX_PENDING_BYTES = 8 * 1024 * 1024;

export interface IndexerCallbacks {
  onChannel(entry: ChannelEntry): void;
  onProgramme(entry: ProgrammeEntry): void;
  onHeader(header: EpgHeader): void;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export class XmltvIndexer {
  private pending: Uint8Array = new Uint8Array(0);
  private pendingBase = 0; // absolute byte offset of pending[0] in the overall stream
  private sawHeader = false;
  private readonly cb: IndexerCallbacks;

  channelsSeen = 0;
  programmesSeen = 0;

  constructor(cb: IndexerCallbacks) {
    this.cb = cb;
  }

  /** Feed the next chunk of decompressed bytes, in stream order. */
  push(chunk: Uint8Array): void {
    this.pending = concat(this.pending, chunk);
    this.drain(false);
  }

  /** Call once after the stream ends to flush/finalize any leftover element. */
  finish(): void {
    this.drain(true);
  }

  private drain(isFinal: boolean): void {
    if (!this.sawHeader) this.tryParseHeader();

    for (;;) {
      const nextChannel = indexOfBytes(this.pending, P_CHANNEL_OPEN);
      const nextProgramme = indexOfBytes(this.pending, P_PROGRAMME_OPEN);
      if (nextChannel === -1 && nextProgramme === -1) break;

      const which: 'channel' | 'programme' =
        nextChannel !== -1 && (nextProgramme === -1 || nextChannel < nextProgramme) ? 'channel' : 'programme';
      const openAt = which === 'channel' ? nextChannel : nextProgramme;
      const closePattern = which === 'channel' ? P_CHANNEL_CLOSE : P_PROGRAMME_CLOSE;
      const closeAt = indexOfBytes(this.pending, closePattern, openAt);

      if (closeAt === -1) {
        if (isFinal) {
          this.emitMalformed(which, openAt, this.pending.length);
          this.pending = new Uint8Array(0);
        } else if (this.pending.length - openAt > MAX_PENDING_BYTES) {
          this.emitMalformed(which, openAt, this.pending.length);
          this.pending = this.pending.slice(openAt + 1);
          this.pendingBase += openAt + 1;
        }
        break;
      }

      const elEnd = closeAt + closePattern.length;
      this.emitComplete(which, openAt, elEnd);
      this.pending = this.pending.slice(elEnd);
      this.pendingBase += elEnd;
    }
  }

  private tryParseHeader(): void {
    const openAt = indexOfBytes(this.pending, P_TV_OPEN);
    if (openAt === -1) return;
    const gtAt = indexOfBytes(this.pending, P_GT, openAt);
    if (gtAt === -1) return; // wait for more bytes
    const tagSrc = decodeUtf8(this.pending.subarray(openAt, gtAt + 1));
    this.cb.onHeader({
      generatorInfoName: extractAttr(tagSrc, 'generator-info-name'),
      generatorInfoUrl: extractAttr(tagSrc, 'generator-info-url'),
    });
    this.sawHeader = true;
  }

  private emitComplete(which: 'channel' | 'programme', openAt: number, elEnd: number): void {
    const byteStart = this.pendingBase + openAt;
    const byteEnd = this.pendingBase + elEnd;
    const src = decodeUtf8(this.pending.subarray(openAt, elEnd));
    const openTag = src.slice(0, (src.indexOf('>') + 1 || src.length));

    if (which === 'channel') {
      const id = extractAttr(openTag, 'id') ?? '';
      const displayName = extractFirstElementText(src, 'display-name') ?? id;
      const iconTag = /<icon\b[^>]*>/.exec(src)?.[0] ?? '';
      const icon = extractAttr(iconTag, 'src');
      const gnid = extractFirstElementText(src, 'gnid');
      const searchText = extractSearchText(src);
      this.channelsSeen++;
      this.cb.onChannel({ id, displayName, icon, gnid, searchText, byteStart, byteEnd });
    } else {
      const channel = extractAttr(openTag, 'channel') ?? '';
      const start = extractAttr(openTag, 'start') ?? '';
      const stop = extractAttr(openTag, 'stop') ?? '';
      const title = extractFirstElementText(src, 'title') ?? '';
      const subTitle = extractFirstElementText(src, 'sub-title');
      const category = extractFirstElementText(src, 'category');
      const desc = extractFirstElementText(src, 'desc');
      const searchText = extractSearchText(src);
      this.programmesSeen++;
      this.cb.onProgramme({ channel, start, stop, title, subTitle, category, desc, searchText, byteStart, byteEnd });
    }
  }

  private emitMalformed(which: 'channel' | 'programme', openAt: number, endAt: number): void {
    const byteStart = this.pendingBase + openAt;
    const byteEnd = this.pendingBase + endAt;
    let src = '';
    try {
      src = decodeUtf8(this.pending.subarray(openAt, endAt));
    } catch {
      // Partial/invalid UTF-8 tail — leave src empty, still record the entry.
    }
    const openTag = src.slice(0, (src.indexOf('>') + 1 || src.length));

    if (which === 'channel') {
      const id = extractAttr(openTag, 'id') ?? '(unknown channel)';
      const displayName = extractFirstElementText(src, 'display-name') ?? id;
      const gnid = extractFirstElementText(src, 'gnid');
      const searchText = extractSearchText(src);
      this.channelsSeen++;
      this.cb.onChannel({ id, displayName, gnid, searchText, byteStart, byteEnd, malformed: true });
    } else {
      const channel = extractAttr(openTag, 'channel') ?? '(unknown)';
      const start = extractAttr(openTag, 'start') ?? '';
      const stop = extractAttr(openTag, 'stop') ?? '';
      const title = extractFirstElementText(src, 'title') ?? '(unterminated programme)';
      const subTitle = extractFirstElementText(src, 'sub-title');
      const category = extractFirstElementText(src, 'category');
      const desc = extractFirstElementText(src, 'desc');
      const searchText = extractSearchText(src);
      this.programmesSeen++;
      this.cb.onProgramme({ channel, start, stop, title, subTitle, category, desc, searchText, byteStart, byteEnd, malformed: true });
    }
  }
}
