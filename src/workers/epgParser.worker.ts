/// <reference lib="webworker" />
import { XmltvBoundaryScanner } from '../lib/xmltv/tokenizer';
import { extractHeaderFields } from '../lib/xmltv/fieldExtraction';
import { mergeSegments, collectIndexTransferables } from '../lib/xmltv/columnar';
import { guessCompressionFromName, type Compression } from '../lib/urlValidation';
import type { EpgHeader, EpgIndex, ParserMessage, ParserRequest, SegmentParseRequest, SegmentParseResult } from '../lib/xmltv/types';

declare const self: DedicatedWorkerGlobalScope;

const OPFS_FILE_NAME = 'current-source.bin';
const PROGRESS_INTERVAL_MS = 200;
// Segments this size (post-decompression) get dispatched to the parser
// pool, big enough to amortize per-message overhead, small enough that a
// handful of workers can all stay busy rather than waiting on one giant
// chunk at the end.
const SEGMENT_TARGET_BYTES = 16 * 1024 * 1024;

// This worker is the coordinator: it owns the one genuinely sequential part
// of the pipeline (fetch, gzip decompression, the single-writer OPFS
// handle, and cheap byte-boundary scanning), and fans out the expensive
// part, actually extracting fields from each element, to a small pool of
// parser workers (xmltvSegmentParser.worker.ts) running in parallel. See
// src/lib/xmltv/columnar.ts for the shared data model both sides speak.

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
let activePool: WorkerPool | null = null;

self.addEventListener('message', (event: MessageEvent<ParserRequest | { type: 'cancel' }>) => {
  const msg = event.data;
  if (msg.type === 'cancel') {
    cancelled = true;
    currentAbort?.abort();
    activePool?.terminate();
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
 * forward bytes and re-add CORS headers for our origin, see proxy/. */
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
        ? "Fetch failed even through the configured CORS proxy. The source may be down, or the proxy couldn't reach it."
        : 'Fetch failed. This usually means the source doesn\'t send permissive CORS headers ' +
          '(Access-Control-Allow-Origin) for cross-origin browser requests. Try a CORS-friendly mirror, ' +
          'configure a CORS proxy in Settings, or upload the file directly.',
    });
    return;
  }

  if (!response.ok || !response.body) {
    post({ type: 'error', kind: 'http', message: `Server responded ${response.status} ${response.statusText}` });
    return;
  }

  // When the response carries a transport Content-Encoding (gzip/br/deflate),
  // the browser decodes the body transparently before we ever see it, but
  // Content-Length still reports the pre-decode wire size — so bytesDownloaded
  // (decompressed) would overshoot totalBytes (compressed) as the stream
  // progresses. Treat the total as unknown in that case; the UI already has
  // an indeterminate-progress path for totalBytes === null.
  const contentEncoding = response.headers.get('content-encoding');
  const isTransportEncoded = !!contentEncoding && contentEncoding.toLowerCase() !== 'identity';
  const totalBytes = isTransportEncoded ? null : Number(response.headers.get('content-length')) || null;
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

/** Round-robin pool of parser workers. Segment results are collected
 * unordered (any worker can finish any segment first) and sorted by
 * sequence number only once, at the very end, there's no need to
 * reassemble in real time since the final columnar index isn't built until
 * every segment is in anyway. */
class WorkerPool {
  private workers: Worker[] = [];
  private next = 0;
  private results: SegmentParseResult[] = [];
  private dispatched = 0;
  private settled = 0;
  private onAllSettled: (() => void) | null = null;
  private failed = false;

  constructor(
    size: number,
    private onError: (err: string) => void,
    private onSettle?: () => void,
  ) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL('./xmltvSegmentParser.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<SegmentParseResult>) => {
        this.results.push(event.data);
        this.settled++;
        this.onSettle?.();
        this.checkDone();
      };
      worker.onerror = (event) => {
        this.failed = true;
        this.settled++;
        this.onError(event.message || 'Parser worker crashed.');
        this.onSettle?.();
        this.checkDone();
      };
      this.workers.push(worker);
    }
  }

  get dispatchedCount(): number {
    return this.dispatched;
  }

  get settledCount(): number {
    return this.settled;
  }

  dispatch(bytes: Uint8Array, baseOffset: number, sequence: number): void {
    if (this.failed) return;
    const worker = this.workers[this.next];
    this.next = (this.next + 1) % this.workers.length;
    this.dispatched++;
    // .slice() copies out of the coordinator's rolling segment buffer so
    // the transferred ArrayBuffer is exactly this segment's own memory.
    const owned = bytes.slice();
    const request: SegmentParseRequest = { type: 'parse-segment', bytes: owned.buffer, baseOffset, sequence };
    worker.postMessage(request, [owned.buffer]);
  }

  /** Like dispatch(), but for a buffer the caller already exclusively owns
   * (e.g. a segment copied out earlier for deferred dispatch) — skips the
   * redundant internal copy since there's no shared buffer left to protect. */
  dispatchOwned(bytes: Uint8Array, baseOffset: number, sequence: number): void {
    if (this.failed) return;
    const worker = this.workers[this.next];
    this.next = (this.next + 1) % this.workers.length;
    this.dispatched++;
    // Same TS lib generic-widening quirk as elsewhere in this file (see the
    // ReadableStream/DecompressionStream comment above): bytes.buffer is
    // typed ArrayBufferLike, but the runtime contract (an owned, non-shared
    // ArrayBuffer) is guaranteed by callers of dispatchOwned.
    const buffer = bytes.buffer as ArrayBuffer;
    const request: SegmentParseRequest = { type: 'parse-segment', bytes: buffer, baseOffset, sequence };
    worker.postMessage(request, [buffer]);
  }

  private checkDone(): void {
    if (this.settled >= this.dispatched) this.onAllSettled?.();
  }

  /** Resolves once every dispatched segment has a result (or the pool failed). */
  async waitForAll(): Promise<SegmentParseResult[]> {
    if (this.settled < this.dispatched) {
      await new Promise<void>((resolve) => {
        this.onAllSettled = resolve;
      });
    }
    this.results.sort((a, b) => a.sequence - b.sequence);
    return this.results;
  }

  terminate(): void {
    for (const w of this.workers) w.terminate();
  }
}

/**
 * Neither the URL/filename extension nor the Content-Encoding header reliably
 * tells us whether the bytes we're about to read are gzip-compressed: we've
 * seen upstream sources serve a `.xml.gz` URL that's actually plain
 * uncompressed XML (wrong content, right extension), and CDNs (e.g.
 * Cloudflare) can transparently decompress — or in principle leave compressed
 * — a response independently of what the URL implies. Always peek the first
 * chunk for the real gzip magic (0x1f 0x8b) and decide from that alone,
 * regardless of filename or headers.
 */
async function resolveGzipStream(stream: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> {
  const reader = stream.getReader();
  let first: Uint8Array | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      reader.releaseLock();
      return stream;
    }
    if (value.byteLength > 0) {
      first = value;
      break;
    }
  }

  const isGzip = first.length >= 2 && first[0] === 0x1f && first[1] === 0x8b;

  const rebuilt = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(first!);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });

  if (!isGzip) return rebuilt;
  // TS's ReadableStream/DecompressionStream generic types don't line up
  // cleanly across lib versions (Uint8Array<ArrayBuffer> vs
  // <ArrayBufferLike>); the runtime contract (bytes in, bytes out) is fine.
  return (rebuilt as ReadableStream<any>).pipeThrough(new DecompressionStream('gzip') as any);
}

async function runFromStream(job: StreamJob): Promise<void> {
  const { sourceUrl, sourceKind } = job;
  // Mutable: a declared Content-Length can be wrong (e.g. a CDN that
  // transparently decompresses a .gz response without correcting the header
  // — see the comment on isTransportEncoded in runFromUrl). Once actually
  // measured bytes exceed it, stop trusting it and fall back to the UI's
  // indeterminate-progress path rather than showing a nonsensical overshoot.
  let totalBytes = job.totalBytes;

  let bytesRead = 0;
  let lastProgressPost = 0;
  let header: EpgHeader = {};

  function postProgress(force = false): void {
    const now = Date.now();
    if (!force && now - lastProgressPost <= PROGRESS_INTERVAL_MS) return;
    lastProgressPost = now;
    post({
      type: 'progress',
      bytesDownloaded: bytesRead,
      totalBytes,
      channelsSeen: scanner.channelsSeen,
      programmesSeen: scanner.programmesSeen,
      segmentsTotal: pool.dispatchedCount,
      segmentsDone: pool.settledCount,
    });
  }

  // Capped well above the old limit of 4 so 6/8/12-core machines (common
  // today) actually get used for the CPU-bound parse phase, while still
  // bounding worker count on unusually high-core-count machines.
  const poolSize = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 8));
  let poolError: string | null = null;
  const pool = new WorkerPool(
    poolSize,
    (msg) => {
      poolError = msg;
    },
    () => postProgress(),
  );
  activePool = pool;

  // Mirrors the raw decompressed stream (same bytes fed to the scanner and
  // written to OPFS), so a segment can be cut as one CONTIGUOUS slice
  // spanning its first element's start to its last element's end. This
  // matters because inter-element whitespace in real XMLTV files isn't
  // captured by any single element's own bytes; concatenating only the
  // per-element byte spans (an earlier version of this code) silently
  // dropped that whitespace, which desynced the segment-parser worker's
  // local-offset-plus-baseOffset math from the true absolute stream
  // position by a few bytes per element, compounding across a segment.
  // The result: byteStart/byteEnd recorded for elements later in a segment
  // pointed a little too early, so the click-to-inspect XML fragment
  // fetched from OPFS came out truncated mid-tag.
  // Pre-allocated, grown by doubling (like memBuf below) and compacted via
  // in-place copyWithin at each segment flush, not by repeated concat, so
  // appending stays O(total bytes) rather than O(segment size squared).
  let rawBuf: Uint8Array = new Uint8Array(1024 * 1024);
  let rawBufLen = 0;
  let rawBufBase = 0;
  let segmentBytes = 0;
  let segmentBase = 0;
  let segmentEnd = 0;
  let sequence = 0;

  function ensureRawCapacity(extra: number): void {
    const needed = rawBufLen + extra;
    if (needed <= rawBuf.length) return;
    let newLen = rawBuf.length * 2;
    while (newLen < needed) newLen *= 2;
    const grown = new Uint8Array(newLen);
    grown.set(rawBuf.subarray(0, rawBufLen));
    rawBuf = grown;
  }

  // Segments are queued here rather than dispatched to the parser pool
  // immediately, so parsing only begins once the whole source has downloaded
  // (see the dispatch loop at the end of the try block below) instead of
  // running concurrently with the download.
  const pendingSegments: { bytes: Uint8Array; baseOffset: number; sequence: number }[] = [];

  function flushSegment(): void {
    if (segmentBytes === 0) return;
    const localStart = segmentBase - rawBufBase;
    const localEnd = segmentEnd - rawBufBase;
    const slice = rawBuf.subarray(localStart, localEnd);
    // Copy now (not a view): rawBuf keeps mutating via copyWithin/growth
    // after this point, but this segment won't be dispatched until later.
    pendingSegments.push({ bytes: slice.slice(), baseOffset: segmentBase, sequence: sequence++ });
    rawBuf.copyWithin(0, localEnd, rawBufLen);
    rawBufLen -= localEnd;
    rawBufBase = segmentEnd;
    segmentBytes = 0;
  }

  const scanner = new XmltvBoundaryScanner({
    onHeader: (tagSrc) => {
      header = extractHeaderFields(tagSrc);
    },
    onElement: (_which, elBytes, byteStart, byteEnd) => {
      if (segmentBytes === 0) segmentBase = byteStart;
      segmentEnd = byteEnd;
      segmentBytes += elBytes.length;
      if (segmentEnd - segmentBase >= SEGMENT_TARGET_BYTES) flushSegment();
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
        if (totalBytes !== null && bytesRead > totalBytes) totalBytes = null;
        postProgress();
        controller.enqueue(chunk);
      },
    });
  }

  try {
    // Always sniff for gzip magic bytes, independent of the `compression`
    // guess (URL/filename extension) — see resolveGzipStream's doc comment.
    let stream: ReadableStream<Uint8Array> = await resolveGzipStream(job.body.pipeThrough(progressTap()));

    const reader = stream.getReader();
    let offset = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (cancelled) return;
      if (poolError) throw new Error(poolError);

      const bytes = value as Uint8Array;
      ensureRawCapacity(bytes.byteLength);
      rawBuf.set(bytes, rawBufLen);
      rawBufLen += bytes.byteLength;
      scanner.push(bytes);
      if (opfsHandle) {
        opfsHandle.write(bytes as BufferSource, { at: offset });
      } else {
        ensureMemCapacity(bytes.byteLength);
        memBuf!.set(bytes, memUsed);
        memUsed += bytes.byteLength;
      }
      offset += bytes.byteLength;
    }
    scanner.finish();
    flushSegment();
    for (const seg of pendingSegments) pool.dispatchOwned(seg.bytes, seg.baseOffset, seg.sequence);
    postProgress(true); // first post with segmentsTotal > 0 — flips the UI to the parse phase

    const segmentResults = await pool.waitForAll();
    if (poolError) throw new Error(poolError);
    pool.terminate();
    activePool = null;
    if (cancelled) return;

    const merged = mergeSegments(segmentResults);

    const index: EpgIndex = {
      header,
      channels: merged.channels,
      programmes: merged.programmes,
      channelProgrammeStart: merged.channelProgrammeStart,
      programmeOrder: merged.programmeOrder,
      totalProgrammeCount: scanner.programmesSeen,
      sourceUrl,
      sourceKind,
      byteLength: offset,
      opfsFileName: opfsHandle ? OPFS_FILE_NAME : null,
      timeRange: computeTimeRange(merged.programmes),
    };

    if (opfsHandle) {
      opfsHandle.flush();
      opfsHandle.close();
      post({ type: 'done', index }, collectIndexTransferables(merged));
    } else {
      const finalBuffer = memBuf!.slice(0, memUsed).buffer;
      post({ type: 'buffer', buffer: finalBuffer }, [finalBuffer]);
      post({ type: 'done', index }, collectIndexTransferables(merged));
    }
  } catch (err) {
    opfsHandle?.close();
    pool.terminate();
    activePool = null;
    if (cancelled) return;
    post({ type: 'error', message: String(err), kind: 'unknown' });
  } finally {
    currentAbort = null;
  }
}

function computeTimeRange(programmes: { count: number; start: Float64Array; stop: Float64Array }): { start: number; end: number } | null {
  let start: number | null = null;
  let end: number | null = null;
  for (let i = 0; i < programmes.count; i++) {
    const s = programmes.start[i];
    const e = programmes.stop[i];
    if (Number.isFinite(s)) start = start === null ? s : Math.min(start, s);
    if (Number.isFinite(e)) end = end === null ? e : Math.max(end, e);
  }
  return start !== null && end !== null ? { start, end } : null;
}
