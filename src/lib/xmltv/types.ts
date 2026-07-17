export interface EpgHeader {
  generatorInfoName?: string;
  generatorInfoUrl?: string;
}

// "View" shapes, what UI components actually consume, built on demand from
// the columnar storage below via getChannel()/getProgramme() (columnar.ts).
// Never held in bulk (that's exactly what caused the OOM this replaces).

export interface ChannelEntry {
  id: string;
  displayName: string;
  icon?: string;
  /** <gnid>, a network/guide ID some feeds (e.g. epg.guru) include, distinct
   * from the feed's own `id` attribute. */
  gnid?: string;
  /** Lowercased text content of every child element (all display-name
   * variants, gnid, lcn, or anything else a feed includes), tags stripped,
   * so search can match fields we don't otherwise surface, like a callsign
   * or network ID. */
  searchText: string;
  byteStart: number;
  byteEnd: number;
  malformed?: boolean;
}

export interface ProgrammeEntry {
  channel: string;
  /** Epoch ms, pre-parsed once at index time (see fieldExtraction.ts)
   * instead of re-parsing the raw XMLTV timestamp string on every render. */
  start: number;
  stop: number;
  title: string;
  /** <sub-title>, e.g. an episode title. First element only. */
  subTitle?: string;
  /** <category>, free text, feed-defined. First element only. */
  category?: string;
  /** <desc>, synopsis text. First element only. */
  desc?: string;
  /** <icon> on the programme itself (episode/poster art), distinct from
   * (and preferred over, when present) the channel's own icon. */
  icon?: string;
  /** Lowercased text content of every child element, tags stripped, lets
   * search match fields we don't otherwise surface (credits, episode-num,
   * rating, etc). */
  searchText: string;
  byteStart: number;
  byteEnd: number;
  malformed?: boolean;
}

// Columnar ("struct of arrays") storage. One shared UTF-8 byte buffer per
// record type holds every string value for every field back-to-back;
// per-field offset/length Uint32Arrays slice individual strings out on
// demand. Numeric fields are typed arrays directly. This is what actually
// crosses postMessage (via the transfer list, zero-copy) and what stays
// resident in memory, no per-entry JS objects, which is where the old
// design's memory (and the OOM) actually went.

export interface ColumnarStrings {
  bytes: Uint8Array;
  offsets: Uint32Array;
  /** 0 means absent/empty, fields are optional, this is the sentinel. */
  lengths: Uint32Array;
}

export interface ChannelColumns {
  count: number;
  id: ColumnarStrings;
  displayName: ColumnarStrings;
  icon: ColumnarStrings;
  gnid: ColumnarStrings;
  searchText: ColumnarStrings;
  byteStart: Float64Array;
  byteEnd: Float64Array;
  /** 1 = malformed, stored as a byte per entry rather than a bitset for
   * simplicity, negligible size next to the string data. */
  malformed: Uint8Array;
}

export interface ProgrammeColumns {
  count: number;
  /** Resolved during the coordinator's merge pass (channel id string ->
   * index); -1 if the referenced channel id was never actually defined. */
  channelIndex: Int32Array;
  start: Float64Array;
  stop: Float64Array;
  title: ColumnarStrings;
  subTitle: ColumnarStrings;
  category: ColumnarStrings;
  desc: ColumnarStrings;
  icon: ColumnarStrings;
  searchText: ColumnarStrings;
  byteStart: Float64Array;
  byteEnd: Float64Array;
  malformed: Uint8Array;
}

export interface EpgIndex {
  header: EpgHeader;
  channels: ChannelColumns;
  programmes: ProgrammeColumns;
  /** CSR-style grouping: channel i's programmes are
   * programmeOrder[channelProgrammeStart[i] .. channelProgrammeStart[i+1]),
   * each chronologically ordered within the channel. Length = channels.count + 1. */
  channelProgrammeStart: Uint32Array;
  programmeOrder: Uint32Array;
  totalProgrammeCount: number;
  /** The source URL for 'url' loads, or the filename for 'file' loads. */
  sourceUrl: string;
  sourceKind: 'url' | 'file';
  byteLength: number;
  /** Earliest programme start / latest programme stop seen, as epoch ms, used to
   * size the grid's scrollable timeline. Null if no programmes had parseable times. */
  timeRange: { start: number; end: number } | null;
  /** OPFS file name holding the raw decompressed bytes, or null if the
   * OPFS fallback (in-memory buffer, main-thread only) was used instead. */
  opfsFileName: string | null;
}

export type ParserProgressMessage = {
  type: 'progress';
  bytesDownloaded: number;
  totalBytes: number | null;
  channelsSeen: number;
  programmesSeen: number;
  /** Segment-parser dispatch/completion counts for the CPU-bound field-parsing
   * phase, which continues (and can outlast) the byte download. Both are 0
   * until the first segment is dispatched. */
  segmentsTotal: number;
  segmentsDone: number;
};

export type ParserDoneMessage = {
  type: 'done';
  index: EpgIndex;
};

export type ParserErrorMessage = {
  type: 'error';
  message: string;
  kind: 'cors' | 'http' | 'unsupported-format' | 'storage' | 'unknown';
};

/** In-memory fallback payload, only sent when OPFS isn't available. */
export type ParserBufferMessage = {
  type: 'buffer';
  buffer: ArrayBuffer;
};

export type ParserMessage =
  | ParserProgressMessage
  | ParserDoneMessage
  | ParserErrorMessage
  | ParserBufferMessage;

export type ParserRequest =
  | { type: 'load'; url: string; corsProxyUrl?: string | null }
  | { type: 'load-file'; file: File };

// --- Coordinator <-> parser-pool worker protocol (internal, not exposed to the main thread) ---

export type SegmentParseRequest = {
  type: 'parse-segment';
  /** This segment's bytes, transferred (not cloned). */
  bytes: ArrayBuffer;
  /** Absolute byte offset of bytes[0] in the overall decompressed stream,
   * lets the parser worker compute correct absolute byteStart/byteEnd for
   * OPFS-based fragment lookups later. */
  baseOffset: number;
  /** Echoed back unchanged so the coordinator can reassemble results in
   * original dispatch order despite workers finishing out of order. */
  sequence: number;
};

/** Same shape as ProgrammeColumns but with the channel reference still as a
 * string column (channelIndex isn't resolvable until the coordinator has
 * seen every segment's channels), resolved away during the merge pass. */
export interface RawProgrammeColumns extends Omit<ProgrammeColumns, 'channelIndex'> {
  channelId: ColumnarStrings;
}

export type SegmentParseResult = {
  type: 'segment-result';
  sequence: number;
  channels: ChannelColumns;
  programmes: RawProgrammeColumns;
};
