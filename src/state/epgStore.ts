import { create } from 'zustand';
import type { EpgIndex, ParserMessage, ParserRequest } from '../lib/xmltv/types';
import { validateSourceUrl } from '../lib/urlValidation';
import { readMemoryFragment, readOpfsFragment } from '../lib/opfs';
import { useSettingsStore } from './settingsStore';

export const SIZE_WARNING_BYTES = 500 * 1024 * 1024;

export type EpgStatus = 'idle' | 'checking' | 'loading' | 'ready' | 'error';

export interface EpgProgress {
  bytesDownloaded: number;
  totalBytes: number | null;
  channelsSeen: number;
  programmesSeen: number;
}

export interface EpgError {
  message: string;
  kind: 'cors' | 'http' | 'unsupported-format' | 'storage' | 'unknown';
}

type PendingLargeLoad = { kind: 'url'; url: string; totalBytes: number } | { kind: 'file'; file: File; totalBytes: number };

interface EpgState {
  status: EpgStatus;
  sourceUrl: string | null;
  sourceKind: 'url' | 'file' | null;
  index: EpgIndex | null;
  progress: EpgProgress | null;
  error: EpgError | null;
  memoryBuffer: ArrayBuffer | null;
  pendingLargeLoad: PendingLargeLoad | null;
  worker: Worker | null;
  /** Bumped by cancelLoad(); lets an in-flight requestLoad (paused on the
   * HEAD await) detect it's been superseded/cancelled before it goes on to
   * start a worker anyway. */
  loadGeneration: number;

  requestLoad: (url: string) => Promise<void>;
  requestLoadFile: (file: File) => void;
  confirmLargeLoad: () => void;
  cancelLargeLoad: () => void;
  cancelLoad: () => void;
  readFragment: (byteStart: number, byteEnd: number) => Promise<string>;
}

function attachWorker(worker: Worker, set: (partial: Partial<EpgState>) => void): void {
  worker.onmessage = (event: MessageEvent<ParserMessage>) => {
    const msg = event.data;
    switch (msg.type) {
      case 'progress':
        set({
          progress: {
            bytesDownloaded: msg.bytesDownloaded,
            totalBytes: msg.totalBytes,
            channelsSeen: msg.channelsSeen,
            programmesSeen: msg.programmesSeen,
          },
        });
        break;
      case 'buffer':
        set({ memoryBuffer: msg.buffer });
        break;
      case 'done':
        set({ status: 'ready', index: msg.index, sourceUrl: msg.index.sourceUrl, sourceKind: msg.index.sourceKind });
        break;
      case 'error':
        set({ status: 'error', error: { message: msg.message, kind: msg.kind } });
        break;
    }
  };
  worker.onerror = (event) => {
    set({ status: 'error', error: { message: event.message || 'Worker crashed.', kind: 'unknown' } });
  };
}

function startWorker(request: ParserRequest, set: (partial: Partial<EpgState>) => void): Worker {
  const worker = new Worker(new URL('../workers/epgParser.worker.ts', import.meta.url), { type: 'module' });
  attachWorker(worker, set);
  worker.postMessage(request);
  return worker;
}

export const useEpgStore = create<EpgState>((set, get) => ({
  status: 'idle',
  sourceUrl: null,
  sourceKind: null,
  index: null,
  progress: null,
  error: null,
  memoryBuffer: null,
  pendingLargeLoad: null,
  worker: null,
  loadGeneration: 0,

  requestLoad: async (rawUrl: string) => {
    const parsed = validateSourceUrl(rawUrl);
    if (!parsed) {
      set({ status: 'error', error: { message: 'Only http:// and https:// URLs are allowed.', kind: 'unknown' } });
      return;
    }

    // Unload whatever's currently loaded before starting the next fetch, so
    // we never hold two sources' worth of index/buffer at once.
    get().cancelLoad();
    const myGeneration = get().loadGeneration;
    set({ status: 'checking', error: null, index: null, memoryBuffer: null, progress: null });

    let totalBytes: number | null = null;
    try {
      const head = await fetch(parsed.toString(), { method: 'HEAD' });
      const len = head.headers.get('content-length');
      totalBytes = len ? Number(len) : null;
    } catch {
      // HEAD can fail (CORS, method not allowed, etc.) — that's fine, we
      // fall back to the worker's mid-download progress-based warning.
      totalBytes = null;
    }

    // The user may have cancelled (or started a different load) while the
    // HEAD request was in flight — don't resurrect this one if so.
    if (get().loadGeneration !== myGeneration) return;

    if (totalBytes && totalBytes > SIZE_WARNING_BYTES) {
      set({ status: 'idle', pendingLargeLoad: { kind: 'url', url: parsed.toString(), totalBytes } });
      return;
    }

    set({ status: 'loading' });
    const corsProxyUrl = useSettingsStore.getState().corsProxyUrl;
    const worker = startWorker({ type: 'load', url: parsed.toString(), corsProxyUrl }, set);
    set({ worker });
  },

  requestLoadFile: (file: File) => {
    get().cancelLoad();
    set({ status: 'idle', error: null, index: null, memoryBuffer: null, progress: null });

    if (file.size > SIZE_WARNING_BYTES) {
      set({ pendingLargeLoad: { kind: 'file', file, totalBytes: file.size } });
      return;
    }

    set({ status: 'loading' });
    const worker = startWorker({ type: 'load-file', file }, set);
    set({ worker });
  },

  confirmLargeLoad: () => {
    const pending = get().pendingLargeLoad;
    if (!pending) return;
    set({ pendingLargeLoad: null, status: 'loading' });
    const request: ParserRequest =
      pending.kind === 'url'
        ? { type: 'load', url: pending.url, corsProxyUrl: useSettingsStore.getState().corsProxyUrl }
        : { type: 'load-file', file: pending.file };
    const worker = startWorker(request, set);
    set({ worker });
  },

  cancelLargeLoad: () => {
    set({ pendingLargeLoad: null, status: 'idle' });
  },

  // Tears down any in-flight worker. Doubles as both the internal "unload
  // before starting the next source" step and the user-facing "cancel this
  // load" action (e.g. clicking the progress indicator) — safe to also
  // reset status/progress here since every internal caller immediately
  // sets its own status right after.
  cancelLoad: () => {
    const worker = get().worker;
    if (worker) {
      worker.postMessage({ type: 'cancel' });
      worker.terminate();
    }
    set((s) => ({ worker: null, status: 'idle', progress: null, loadGeneration: s.loadGeneration + 1 }));
  },

  readFragment: async (byteStart: number, byteEnd: number) => {
    const { index, memoryBuffer } = get();
    if (index?.opfsFileName) {
      return readOpfsFragment(index.opfsFileName, byteStart, byteEnd);
    }
    if (memoryBuffer) {
      return readMemoryFragment(memoryBuffer, byteStart, byteEnd);
    }
    throw new Error('No source loaded.');
  },
}));
