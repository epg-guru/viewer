import { decodeUtf8, extractAttr, extractFirstElementText, extractSearchText } from './bytes';
import { parseXmltvTime } from './time';

// Field extraction is split out from the boundary scanner (tokenizer.ts) so
// it can run in a pool of parser workers in parallel, the scanner just
// needs to find where an element starts/ends (cheap); pulling the actual
// fields out (regex matching, entity decoding) is the CPU-heavy part and
// the thing worth parallelizing across cores.

export interface ChannelFields {
  id: string;
  displayName: string;
  icon?: string;
  gnid?: string;
  searchText: string;
}

export interface ProgrammeFields {
  channelId: string;
  /** Epoch ms, or NaN if unparseable. */
  start: number;
  stop: number;
  title: string;
  subTitle?: string;
  category?: string;
  desc?: string;
  searchText: string;
}

function openTagOf(src: string): string {
  return src.slice(0, src.indexOf('>') + 1 || src.length);
}

export function extractChannelFields(bytes: Uint8Array, fallbackId: string): ChannelFields {
  let src = '';
  try {
    src = decodeUtf8(bytes);
  } catch {
    // Partial/invalid UTF-8 tail (malformed/truncated element), best effort.
  }
  const openTag = openTagOf(src);
  const id = extractAttr(openTag, 'id') ?? fallbackId;
  const displayName = extractFirstElementText(src, 'display-name') ?? id;
  const iconTag = /<icon\b[^>]*>/.exec(src)?.[0] ?? '';
  const icon = extractAttr(iconTag, 'src');
  const gnid = extractFirstElementText(src, 'gnid');
  const searchText = extractSearchText(src);
  return { id, displayName, icon, gnid, searchText };
}

export function extractProgrammeFields(bytes: Uint8Array, fallbackTitle: string): ProgrammeFields {
  let src = '';
  try {
    src = decodeUtf8(bytes);
  } catch {
    // Partial/invalid UTF-8 tail, best effort.
  }
  const openTag = openTagOf(src);
  const channelId = extractAttr(openTag, 'channel') ?? '';
  const startRaw = extractAttr(openTag, 'start') ?? '';
  const stopRaw = extractAttr(openTag, 'stop') ?? '';
  const title = extractFirstElementText(src, 'title') ?? fallbackTitle;
  const subTitle = extractFirstElementText(src, 'sub-title');
  const category = extractFirstElementText(src, 'category');
  const desc = extractFirstElementText(src, 'desc');
  const searchText = extractSearchText(src);
  const start = parseXmltvTime(startRaw) ?? NaN;
  const stop = parseXmltvTime(stopRaw) ?? NaN;
  return { channelId, start, stop, title, subTitle, category, desc, searchText };
}

export function extractHeaderFields(tagSrc: string): { generatorInfoName?: string; generatorInfoUrl?: string } {
  return {
    generatorInfoName: extractAttr(tagSrc, 'generator-info-name'),
    generatorInfoUrl: extractAttr(tagSrc, 'generator-info-url'),
  };
}
