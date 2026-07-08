/// <reference lib="webworker" />
import { XmltvIndexer } from '../lib/xmltv/tokenizer';
import { parseXmltvTime } from '../lib/xmltv/time';
import { guessCompressionFromName, type Compression } from '../lib/urlValidation';
import type { ChannelEntry, EpgHeader, EpgIndex, ParserMessage, ParserRequest, ProgrammeEntry } from '../lib/xmltv/types';

declare const self: DedicatedWorkerGlobalScope;

const OPFS_FILE_NAME = 'current-source.bin';
const PROGRESS_INTERVAL_MS = 200;

// Minimal structural type for the OPFS sync-access-handle API, since it's
// new enough that not every TS lib version ships full ambient types for it.
// Feature-detected at runtime regardless (see openOpfsHandle below).
type SyncAccessHandle = {
  write(buffer: BufferSource, options?: { at?: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
};

let currentAbort: AbortController | null = null;
let cancelled = false;

self.addEventListener('message', (event: MessageEvent<ParserRequest | { type: 'cancel' }>) => {
  const msg = event.data;
  if (msg.type === 'cancel') {
    cancelled = true;
    currentAbort?.abort();
    return;
  }
  cancelled = false;
  if (msg.type === 'load') {
    void runFromUrl(msg.url, msg.corsProxyUrl ?? null);
  } else if (msg.type === 'load-file') {
    void runFromFile(msg.file);
  }
});

function post(msg: ParserMessage, transfer?: Transferable[]): void {
  if (transfer?.length) self.postMessage(msg, transfer);
  else self.postMessage(msg);
}

async function openOpfsHandle(): Promise<SyncAccessHandle | null> {
  try {
    const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<any> };
    if (typeof storage?.getDirectory !== 'function') return null;
    const dir = await storage.getDirectory();
    const fileHandle = await dir.getFileHandle(OPFS_FILE_NAME, { create: true });
    const createSync = (fileHandle as any).createSyncAccessHandle;
    if (typeof createSync !== 'function') return null;
    const handle: SyncAccessHandle = await createSync.call(fileHandle);
    handle.truncate(0);
    return handle;
  } catch {
    return null;
  }
}

function buildProxyUrl(proxyBase: string, target: string): string {
  const sep = proxyBase.includes('?') ? '&' : '?';
  return `${proxyBase}${sep}url=${encodeURIComponent(target)}`;
}

/** Direct fetch first; if that throws (typically a CORS rejection) and a
 * proxy is configured, retry through it once. The proxy just needs to
 * forward bytes and re-add CORS headers for our origin — see proxy/. */
async function fetchDirectOrViaProxy(
  url: string,
  corsProxyUrl: string | null,
  signal: AbortSignal,
): Promise<{ response: Response; viaProxy: boolean }> {
  try {
    return { response: await fetch(url, { signal }), viaProxy: false };
  } catch (directErr) {
    if (!corsProxyUrl) throw directErr;
    const response = await fetch(buildProxyUrl(corsProxyUrl, url), { signal });
    return { response, viaProxy: true };
  }
}

async function runFromUrl(rawUrl: string, corsProxyUrl: string | null): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    post({ type: 'error', message: 'Invalid URL.', kind: 'unknown' });
    return;
  }

  const compression = guessCompressionFromName(parsed.pathname);
  if (compression === 'xz') {
    post({
      type: 'error',
      kind: 'unsupported-format',
      message: '.xml.xz is not supported yet (no native browser decompressor). Try a .gz or plain .xml mirror.',
    });
    return;
  }

  const abort = new AbortController();
  currentAbort = abort;

  let response: Response;
  try {
    ({ response } = await fetchDirectOrViaProxy(parsed.toString(), corsProxyUrl, abort.signal));
  } catch {
    if (cancelled) return;
    post({
      type: 'error',
      kind: 'cors',
      message: corsProxyUrl
        ? "Fetch failed even through the configured CORS proxy — the source may be down, or the proxy couldn't reach it."
        : 'Fetch failed — this usually means the source doesn\'t send permissive CORS headers ' +
          '(Access-Control-Allow-Origin) for cross-origin browser requests. Try a CORS-friendly mirror, ' +
          'configure a CORS proxy in Settings, or upload the file directly.',
    });
    return;
  }

  if (!response.ok || !response.body) {
    post({ type: 'error', kind: 'http', message: `Server responded ${response.status} ${response.statusText}` });
    return;
  }

  const totalBytes = Number(response.headers.get('content-length')) || null;
  await runFromStream({
    compression,
    totalBytes,
    sourceUrl: parsed.toString(),
    sourceKind: 'url',
    body: response.body,
    signal: abort.signal,
  });
}

async function runFromFile(file: File): Promise<void> {
  const compression = guessCompressionFromName(file.name);
  if (compression === 'xz') {
    post({
      type: 'error',
      kind: 'unsupported-format',
      message: '.xml.xz is not supported yet (no native browser decompressor).',
    });
    return;
  }

  const abort = new AbortController();
  currentAbort = abort;

  await runFromStream({
    compression,
    totalBytes: file.size,
    sourceUrl: file.name,
    sourceKind: 'file',
    body: file.stream() as unknown as ReadableStream<Uint8Array>,
    signal: abort.signal,
  });
}

interface StreamJob {
  compression: Compression;
  totalBytes: number | null;
  sourceUrl: string;
  sourceKind: 'url' | 'file';
  body: ReadableStream<Uint8Array>;
  signal: AbortSignal;
}

async function runFromStream(job: StreamJob): Promise<void> {
  const { compression, totalBytes, sourceUrl, sourceKind } = job;

  let bytesRead = 0;
  let lastProgressPost = 0;
  const channelsByOrder: ChannelEntry[] = [];
  const programmesByChannel = new Map<string, ProgrammeEntry[]>();
  let header: EpgHeader = {};
  let timeRangeStart: number | null = null;
  let timeRangeEnd: number | null = null;

  const indexer = new XmltvIndexer({
    onHeader: (h) => {
      header = h;
    },
    onChannel: (entry) => {
      channelsByOrder.push(entry);
    },
    onProgramme: (entry) => {
      const list = programmesByChannel.get(entry.channel);
      if (list) list.push(entry);
      else programmesByChannel.set(entry.channel, [entry]);

      const start = parseXmltvTime(entry.start);
      const stop = parseXmltvTime(entry.stop);
      if (start !== null) timeRangeStart = timeRangeStart === null ? start : Math.min(timeRangeStart, start);
      if (stop !== null) timeRangeEnd = timeRangeEnd === null ? stop : Math.max(timeRangeEnd, stop);
    },
  });

  const opfsHandle = await openOpfsHandle();

  // In-memory fallback buffer, used only when OPFS isn't available. Grown by
  // doubling since we usually don't know the decompressed size up front.
  let memBuf: Uint8Array | null = opfsHandle ? null : new Uint8Array(1024 * 1024);
  let memUsed = 0;

  function ensureMemCapacity(extra: number): void {
    if (!memBuf) return;
    const needed = memUsed + extra;
    if (needed <= memBuf.length) return;
    let newLen = memBuf.length * 2;
    while (newLen < needed) newLen *= 2;
    const grown = new Uint8Array(newLen);
    grown.set(memBuf.subarray(0, memUsed));
    memBuf = grown;
  }

  function progressTap(): TransformStream<Uint8Array, Uint8Array> {
    return new TransformStream({
      transform(chunk, controller) {
        bytesRead += chunk.byteLength;
        const now = Date.now();
        if (now - lastProgressPost > PROGRESS_INTERVAL_MS) {
          lastProgressPost = now;
          post({
            type: 'progress',
            bytesDownloaded: bytesRead,
            totalBytes,
            channelsSeen: indexer.channelsSeen,
            programmesSeen: indexer.programmesSeen,
          });
        }
        controller.enqueue(chunk);
      },
    });
  }

  try {
    let stream: ReadableStream<Uint8Array> = job.body.pipeThrough(progressTap());
    if (compression === 'gzip') {
      // TS's ReadableStream/DecompressionStream generic types don't line up
      // cleanly across lib versions (Uint8Array<ArrayBuffer> vs
      // <ArrayBufferLike>); the runtime contract (bytes in, bytes out) is fine.
      stream = (stream as ReadableStream<any>).pipeThrough(new DecompressionStream('gzip') as any);
    }

    const reader = stream.getReader();
    let offset = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (cancelled) return;

      const bytes = value as Uint8Array;
      indexer.push(bytes);
      if (opfsHandle) {
        opfsHandle.write(bytes as BufferSource, { at: offset });
      } else {
        ensureMemCapacity(bytes.byteLength);
        memBuf!.set(bytes, memUsed);
        memUsed += bytes.byteLength;
      }
      offset += bytes.byteLength;
    }
    indexer.finish();

    post({
      type: 'progress',
      bytesDownloaded: bytesRead,
      totalBytes,
      channelsSeen: indexer.channelsSeen,
      programmesSeen: indexer.programmesSeen,
    });

    const index: EpgIndex = {
      header,
      channels: channelsByOrder,
      programmesByChannel,
      totalProgrammeCount: indexer.programmesSeen,
      sourceUrl,
      sourceKind,
      byteLength: offset,
      opfsFileName: opfsHandle ? OPFS_FILE_NAME : null,
      timeRange: timeRangeStart !== null && timeRangeEnd !== null ? { start: timeRangeStart, end: timeRangeEnd } : null,
    };

    if (opfsHandle) {
      opfsHandle.flush();
      opfsHandle.close();
      post({ type: 'done', index });
    } else {
      const finalBuffer = memBuf!.slice(0, memUsed).buffer;
      post({ type: 'buffer', buffer: finalBuffer }, [finalBuffer]);
      post({ type: 'done', index });
    }
  } catch (err) {
    opfsHandle?.close();
    if (cancelled) return;
    post({ type: 'error', message: String(err), kind: 'unknown' });
  } finally {
    currentAbort = null;
  }
}
