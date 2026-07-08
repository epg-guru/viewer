export interface EpgHeader {
  generatorInfoName?: string;
  generatorInfoUrl?: string;
}

export interface ChannelEntry {
  id: string;
  displayName: string;
  icon?: string;
  /** <gnid> — a network/guide ID some feeds (e.g. epg.guru) include, distinct
   * from the feed's own `id` attribute. */
  gnid?: string;
  /** Lowercased text content of every child element (all display-name
   * variants, gnid, lcn, or anything else a feed includes), tags stripped —
   * so search can match fields we don't otherwise surface, like a callsign
   * or network ID. */
  searchText: string;
  byteStart: number;
  byteEnd: number;
  malformed?: boolean;
}

export interface ProgrammeEntry {
  channel: string;
  /** Raw XMLTV timestamp, e.g. "20260708120000 +0000" — left unparsed here. */
  start: string;
  stop: string;
  title: string;
  /** <sub-title> — e.g. an episode title. First element only. */
  subTitle?: string;
  /** <category> — free text, feed-defined. First element only. */
  category?: string;
  /** <desc> — synopsis text. First element only. */
  desc?: string;
  /** Lowercased text content of every child element, tags stripped — lets
   * search match fields we don't otherwise surface (credits, episode-num,
   * rating, etc). */
  searchText: string;
  byteStart: number;
  byteEnd: number;
  malformed?: boolean;
}

export interface EpgIndex {
  header: EpgHeader;
  channels: ChannelEntry[];
  /** Keyed by channel id; both Map and Array are structured-clone safe over postMessage. */
  programmesByChannel: Map<string, ProgrammeEntry[]>;
  totalProgrammeCount: number;
  /** The source URL for 'url' loads, or the filename for 'file' loads. */
  sourceUrl: string;
  sourceKind: 'url' | 'file';
  byteLength: number;
  /** Earliest programme start / latest programme stop seen, as epoch ms — used to
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
