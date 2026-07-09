import type {
  ChannelColumns,
  ChannelEntry,
  ColumnarStrings,
  EpgIndex,
  ProgrammeColumns,
  ProgrammeEntry,
  RawProgrammeColumns,
} from './types';
import type { ChannelFields, ProgrammeFields } from './fieldExtraction';

// Columnar ("struct of arrays") storage for the parsed index. Replaces what
// used to be a ChannelEntry[]/Map<string, ProgrammeEntry[]> object graph,
// millions of small boxed JS objects, each with several string properties,
// which is what made the old design's structured-clone step (moving the
// whole thing from worker to main thread) double peak memory and crash with
// DataCloneError on large feeds. Everything here backs onto typed arrays
// (transferable, zero-copy across postMessage) and one shared UTF-8 byte
// buffer per string field; individual entries are only ever materialized
// as plain objects on demand, for whatever's actually being rendered.

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

export function sliceString(cs: ColumnarStrings, i: number): string {
  const len = cs.lengths[i];
  if (len === 0) return '';
  const off = cs.offsets[i];
  return decoder.decode(cs.bytes.subarray(off, off + len));
}

export function sliceStringOrUndefined(cs: ColumnarStrings, i: number): string | undefined {
  return cs.lengths[i] === 0 ? undefined : sliceString(cs, i);
}

// --- Builders (used inside parser workers while extracting fields) ---

class StringFieldBuilder {
  private chunks: Uint8Array[] = [];
  private totalLen = 0;
  private offsets: number[] = [];
  private lengths: number[] = [];

  add(s: string | undefined): void {
    if (!s) {
      this.offsets.push(this.totalLen);
      this.lengths.push(0);
      return;
    }
    const enc = encoder.encode(s);
    this.offsets.push(this.totalLen);
    this.lengths.push(enc.length);
    this.chunks.push(enc);
    this.totalLen += enc.length;
  }

  build(): ColumnarStrings {
    const bytes = new Uint8Array(this.totalLen);
    let pos = 0;
    for (const c of this.chunks) {
      bytes.set(c, pos);
      pos += c.length;
    }
    return { bytes, offsets: Uint32Array.from(this.offsets), lengths: Uint32Array.from(this.lengths) };
  }
}

export class ChannelColumnsBuilder {
  private idB = new StringFieldBuilder();
  private displayNameB = new StringFieldBuilder();
  private iconB = new StringFieldBuilder();
  private gnidB = new StringFieldBuilder();
  private searchTextB = new StringFieldBuilder();
  private byteStart: number[] = [];
  private byteEnd: number[] = [];
  private malformed: number[] = [];
  count = 0;

  add(fields: ChannelFields, byteStart: number, byteEnd: number, malformed: boolean): void {
    this.idB.add(fields.id);
    this.displayNameB.add(fields.displayName);
    this.iconB.add(fields.icon);
    this.gnidB.add(fields.gnid);
    this.searchTextB.add(fields.searchText);
    this.byteStart.push(byteStart);
    this.byteEnd.push(byteEnd);
    this.malformed.push(malformed ? 1 : 0);
    this.count++;
  }

  build(): ChannelColumns {
    return {
      count: this.count,
      id: this.idB.build(),
      displayName: this.displayNameB.build(),
      icon: this.iconB.build(),
      gnid: this.gnidB.build(),
      searchText: this.searchTextB.build(),
      byteStart: Float64Array.from(this.byteStart),
      byteEnd: Float64Array.from(this.byteEnd),
      malformed: Uint8Array.from(this.malformed),
    };
  }
}

export class RawProgrammeColumnsBuilder {
  private channelIdB = new StringFieldBuilder();
  private titleB = new StringFieldBuilder();
  private subTitleB = new StringFieldBuilder();
  private categoryB = new StringFieldBuilder();
  private descB = new StringFieldBuilder();
  private iconB = new StringFieldBuilder();
  private searchTextB = new StringFieldBuilder();
  private start: number[] = [];
  private stop: number[] = [];
  private byteStart: number[] = [];
  private byteEnd: number[] = [];
  private malformed: number[] = [];
  count = 0;

  add(fields: ProgrammeFields, byteStart: number, byteEnd: number, malformed: boolean): void {
    this.channelIdB.add(fields.channelId);
    this.titleB.add(fields.title);
    this.subTitleB.add(fields.subTitle);
    this.categoryB.add(fields.category);
    this.descB.add(fields.desc);
    this.iconB.add(fields.icon);
    this.searchTextB.add(fields.searchText);
    this.start.push(fields.start);
    this.stop.push(fields.stop);
    this.byteStart.push(byteStart);
    this.byteEnd.push(byteEnd);
    this.malformed.push(malformed ? 1 : 0);
    this.count++;
  }

  build(): RawProgrammeColumns {
    return {
      count: this.count,
      channelId: this.channelIdB.build(),
      start: Float64Array.from(this.start),
      stop: Float64Array.from(this.stop),
      title: this.titleB.build(),
      subTitle: this.subTitleB.build(),
      category: this.categoryB.build(),
      desc: this.descB.build(),
      icon: this.iconB.build(),
      searchText: this.searchTextB.build(),
      byteStart: Float64Array.from(this.byteStart),
      byteEnd: Float64Array.from(this.byteEnd),
      malformed: Uint8Array.from(this.malformed),
    };
  }
}

// --- Accessors (main thread + wherever entries need to become plain objects) ---

export function getChannel(cols: ChannelColumns, i: number): ChannelEntry {
  const id = sliceString(cols.id, i);
  return {
    id,
    displayName: sliceStringOrUndefined(cols.displayName, i) ?? id,
    icon: sliceStringOrUndefined(cols.icon, i),
    gnid: sliceStringOrUndefined(cols.gnid, i),
    searchText: sliceString(cols.searchText, i),
    byteStart: cols.byteStart[i],
    byteEnd: cols.byteEnd[i],
    malformed: cols.malformed[i] === 1 ? true : undefined,
  };
}

export function getProgramme(programmes: ProgrammeColumns, channels: ChannelColumns, i: number): ProgrammeEntry {
  const channelIdx = programmes.channelIndex[i];
  return {
    channel: channelIdx >= 0 ? sliceString(channels.id, channelIdx) : '',
    start: programmes.start[i],
    stop: programmes.stop[i],
    title: sliceString(programmes.title, i),
    subTitle: sliceStringOrUndefined(programmes.subTitle, i),
    category: sliceStringOrUndefined(programmes.category, i),
    desc: sliceStringOrUndefined(programmes.desc, i),
    icon: sliceStringOrUndefined(programmes.icon, i),
    searchText: sliceString(programmes.searchText, i),
    byteStart: programmes.byteStart[i],
    byteEnd: programmes.byteEnd[i],
    malformed: programmes.malformed[i] === 1 ? true : undefined,
  };
}

/** channel i's programmes, chronologically ordered, pass to getProgramme
 * one index at a time, e.g. for visible-row rendering in GuideGrid. */
export function getChannelProgrammeIndices(
  index: Pick<EpgIndex, 'channelProgrammeStart' | 'programmeOrder'>,
  channelIdx: number,
): Uint32Array {
  const start = index.channelProgrammeStart[channelIdx];
  const end = index.channelProgrammeStart[channelIdx + 1];
  return index.programmeOrder.subarray(start, end);
}

// --- Concatenation + merge (coordinator's job, once per load) ---

function concatColumnarStrings(parts: ColumnarStrings[]): ColumnarStrings {
  let totalBytes = 0;
  let totalCount = 0;
  for (const p of parts) {
    totalBytes += p.bytes.length;
    totalCount += p.offsets.length;
  }
  const bytes = new Uint8Array(totalBytes);
  const offsets = new Uint32Array(totalCount);
  const lengths = new Uint32Array(totalCount);
  let bytePos = 0;
  let idx = 0;
  for (const p of parts) {
    bytes.set(p.bytes, bytePos);
    for (let i = 0; i < p.offsets.length; i++) {
      offsets[idx] = p.offsets[i] + bytePos;
      lengths[idx] = p.lengths[i];
      idx++;
    }
    bytePos += p.bytes.length;
  }
  return { bytes, offsets, lengths };
}

function concatFloat64(parts: Float64Array[]): Float64Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Float64Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

function concatUint8(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

function concatChannelColumns(parts: ChannelColumns[]): ChannelColumns {
  return {
    count: parts.reduce((s, p) => s + p.count, 0),
    id: concatColumnarStrings(parts.map((p) => p.id)),
    displayName: concatColumnarStrings(parts.map((p) => p.displayName)),
    icon: concatColumnarStrings(parts.map((p) => p.icon)),
    gnid: concatColumnarStrings(parts.map((p) => p.gnid)),
    searchText: concatColumnarStrings(parts.map((p) => p.searchText)),
    byteStart: concatFloat64(parts.map((p) => p.byteStart)),
    byteEnd: concatFloat64(parts.map((p) => p.byteEnd)),
    malformed: concatUint8(parts.map((p) => p.malformed)),
  };
}

function resolveProgrammeColumns(
  parts: RawProgrammeColumns[],
  idToIndex: Map<string, number>,
): ProgrammeColumns {
  const count = parts.reduce((s, p) => s + p.count, 0);
  const channelIndex = new Int32Array(count);
  let idx = 0;
  for (const p of parts) {
    for (let i = 0; i < p.count; i++) {
      const id = sliceString(p.channelId, i);
      channelIndex[idx++] = idToIndex.get(id) ?? -1;
    }
  }
  return {
    count,
    channelIndex,
    start: concatFloat64(parts.map((p) => p.start)),
    stop: concatFloat64(parts.map((p) => p.stop)),
    title: concatColumnarStrings(parts.map((p) => p.title)),
    subTitle: concatColumnarStrings(parts.map((p) => p.subTitle)),
    category: concatColumnarStrings(parts.map((p) => p.category)),
    desc: concatColumnarStrings(parts.map((p) => p.desc)),
    icon: concatColumnarStrings(parts.map((p) => p.icon)),
    searchText: concatColumnarStrings(parts.map((p) => p.searchText)),
    byteStart: concatFloat64(parts.map((p) => p.byteStart)),
    byteEnd: concatFloat64(parts.map((p) => p.byteEnd)),
    malformed: concatUint8(parts.map((p) => p.malformed)),
  };
}

export interface MergedIndex {
  channels: ChannelColumns;
  programmes: ProgrammeColumns;
  channelProgrammeStart: Uint32Array;
  programmeOrder: Uint32Array;
}

/** Combines every segment's results (already in original stream order, the
 * coordinator is responsible for that) into the final columnar structure:
 * concatenates all fields, resolves each programme's channel id string to a
 * global channel index, then groups programmes per channel (CSR-style) via
 * a stable counting sort, which preserves each channel's original
 * chronological order despite programmes having been extracted out of
 * order across parallel workers. */
export function mergeSegments(segments: { channels: ChannelColumns; programmes: RawProgrammeColumns }[]): MergedIndex {
  const channels = concatChannelColumns(segments.map((s) => s.channels));

  const idToIndex = new Map<string, number>();
  for (let i = 0; i < channels.count; i++) {
    const id = sliceString(channels.id, i);
    if (!idToIndex.has(id)) idToIndex.set(id, i);
  }

  const programmes = resolveProgrammeColumns(
    segments.map((s) => s.programmes),
    idToIndex,
  );

  const channelProgrammeStart = new Uint32Array(channels.count + 1);
  for (let i = 0; i < programmes.count; i++) {
    const ci = programmes.channelIndex[i];
    if (ci >= 0) channelProgrammeStart[ci + 1]++;
  }
  for (let i = 0; i < channels.count; i++) channelProgrammeStart[i + 1] += channelProgrammeStart[i];

  const cursor = channelProgrammeStart.slice(0, channels.count);
  const programmeOrder = new Uint32Array(channelProgrammeStart[channels.count]);
  for (let i = 0; i < programmes.count; i++) {
    const ci = programmes.channelIndex[i];
    if (ci < 0) continue;
    programmeOrder[cursor[ci]++] = i;
  }

  return { channels, programmes, channelProgrammeStart, programmeOrder };
}

// --- Transfer-list helpers ---

function pushStringBuffers(list: ArrayBuffer[], cs: ColumnarStrings): void {
  list.push(cs.bytes.buffer as ArrayBuffer, cs.offsets.buffer as ArrayBuffer, cs.lengths.buffer as ArrayBuffer);
}

export function collectChannelTransferables(list: ArrayBuffer[], ch: ChannelColumns): void {
  pushStringBuffers(list, ch.id);
  pushStringBuffers(list, ch.displayName);
  pushStringBuffers(list, ch.icon);
  pushStringBuffers(list, ch.gnid);
  pushStringBuffers(list, ch.searchText);
  list.push(ch.byteStart.buffer as ArrayBuffer, ch.byteEnd.buffer as ArrayBuffer, ch.malformed.buffer as ArrayBuffer);
}

export function collectRawProgrammeTransferables(list: ArrayBuffer[], pr: RawProgrammeColumns): void {
  pushStringBuffers(list, pr.channelId);
  pushStringBuffers(list, pr.title);
  pushStringBuffers(list, pr.subTitle);
  pushStringBuffers(list, pr.category);
  pushStringBuffers(list, pr.desc);
  pushStringBuffers(list, pr.icon);
  pushStringBuffers(list, pr.searchText);
  list.push(pr.start.buffer as ArrayBuffer, pr.stop.buffer as ArrayBuffer, pr.byteStart.buffer as ArrayBuffer, pr.byteEnd.buffer as ArrayBuffer, pr.malformed.buffer as ArrayBuffer);
}

export function collectProgrammeTransferables(list: ArrayBuffer[], pr: ProgrammeColumns): void {
  pushStringBuffers(list, pr.title);
  pushStringBuffers(list, pr.subTitle);
  pushStringBuffers(list, pr.category);
  pushStringBuffers(list, pr.desc);
  pushStringBuffers(list, pr.icon);
  pushStringBuffers(list, pr.searchText);
  list.push(
    pr.channelIndex.buffer as ArrayBuffer,
    pr.start.buffer as ArrayBuffer,
    pr.stop.buffer as ArrayBuffer,
    pr.byteStart.buffer as ArrayBuffer,
    pr.byteEnd.buffer as ArrayBuffer,
    pr.malformed.buffer as ArrayBuffer,
  );
}

export function collectIndexTransferables(index: MergedIndex): ArrayBuffer[] {
  const list: ArrayBuffer[] = [];
  collectChannelTransferables(list, index.channels);
  collectProgrammeTransferables(list, index.programmes);
  list.push(index.channelProgrammeStart.buffer as ArrayBuffer, index.programmeOrder.buffer as ArrayBuffer);
  return list;
}
