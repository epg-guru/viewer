import { create } from 'zustand';
import type { EpgIndex, ParserMessage, ParserRequest } from '../lib/xmltv/types';
import { validateSourceUrl } from '../lib/urlValidation';
import { readMemoryFragment, readOpfsFragment } from '../lib/opfs';
import { useSettingsStore } from './settingsStore';

export type EpgStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface EpgProgress {
  bytesDownloaded: number;
  totalBytes: number | null;
  channelsSeen: number;
  programmesSeen: number;
  segmentsTotal: number;
  segmentsDone: number;
}

export interface EpgError {
  message: string;
  kind: 'cors' | 'http' | 'unsupported-format' | 'storage' | 'unknown';
}

interface EpgState {
  status: EpgStatus;
  sourceUrl: string | null;
  sourceKind: 'url' | 'file' | null;
  index: EpgIndex | null;
  progress: EpgProgress | null;
  error: EpgError | null;
  memoryBuffer: ArrayBuffer | null;
  worker: Worker | null;

  requestLoad: (url: string) => Promise<void>;
  requestLoadFile: (file: File) => void;
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
            segmentsTotal: msg.segmentsTotal,
            segmentsDone: msg.segmentsDone,
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
  worker: null,

  requestLoad: async (rawUrl: string) => {
    const parsed = validateSourceUrl(rawUrl);
    if (!parsed) {
      set({ status: 'error', error: { message: 'Only http:// and https:// URLs are allowed.', kind: 'unknown' } });
      return;
    }

    // Unload whatever's currently loaded before starting the next fetch, so
    // we never hold two sources' worth of index/buffer at once.
    get().cancelLoad();
    set({ status: 'loading', error: null, index: null, memoryBuffer: null, progress: null });

    const corsProxyUrl = useSettingsStore.getState().corsProxyUrl;
    const worker = startWorker({ type: 'load', url: parsed.toString(), corsProxyUrl }, set);
    set({ worker });
  },

  requestLoadFile: (file: File) => {
    get().cancelLoad();
    set({ status: 'loading', error: null, index: null, memoryBuffer: null, progress: null });

    const worker = startWorker({ type: 'load-file', file }, set);
    set({ worker });
  },

  // Tears down any in-flight worker. Doubles as both the internal "unload
  // before starting the next source" step and the user-facing "cancel this
  // load" action (e.g. clicking the progress indicator), safe to also
  // reset status/progress here since every internal caller immediately
  // sets its own status right after.
  cancelLoad: () => {
    const worker = get().worker;
    if (worker) {
      worker.postMessage({ type: 'cancel' });
      worker.terminate();
    }
    set({ worker: null, status: 'idle', progress: null });
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
