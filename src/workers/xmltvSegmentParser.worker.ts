/// <reference lib="webworker" />
import { XmltvBoundaryScanner } from '../lib/xmltv/tokenizer';
import { extractChannelFields, extractProgrammeFields } from '../lib/xmltv/fieldExtraction';
import { ChannelColumnsBuilder, RawProgrammeColumnsBuilder, collectChannelTransferables, collectRawProgrammeTransferables } from '../lib/xmltv/columnar';
import type { SegmentParseRequest, SegmentParseResult } from '../lib/xmltv/types';

declare const self: DedicatedWorkerGlobalScope;

// One of a small pool spun up by the coordinator (epgParser.worker.ts) to
// parallelize the CPU-heavy part of parsing, field extraction (regex
// matching, entity decoding), across cores. Each worker only ever sees one
// segment at a time: a byte range the coordinator has already verified
// contains complete, back-to-back <channel>/<programme> elements (no
// partial elements at the edges), so this can independently re-scan for
// boundaries within just that segment and extract fields as it goes.

self.addEventListener('message', (event: MessageEvent<SegmentParseRequest>) => {
  const { bytes, baseOffset, sequence } = event.data;
  const channelsB = new ChannelColumnsBuilder();
  const programmesB = new RawProgrammeColumnsBuilder();

  const scanner = new XmltvBoundaryScanner({
    onHeader: () => {
      // Segments never contain the <tv> root open tag, the coordinator
      // parses the header itself, once, before any segment is dispatched.
    },
    onElement: (which, elBytes, localStart, localEnd, malformed) => {
      const byteStart = baseOffset + localStart;
      const byteEnd = baseOffset + localEnd;
      if (which === 'channel') {
        const fields = extractChannelFields(elBytes, '(unknown channel)');
        channelsB.add(fields, byteStart, byteEnd, malformed);
      } else {
        const fields = extractProgrammeFields(elBytes, malformed ? '(unterminated programme)' : '');
        programmesB.add(fields, byteStart, byteEnd, malformed);
      }
    },
  });

  scanner.push(new Uint8Array(bytes));
  scanner.finish();

  const channels = channelsB.build();
  const programmes = programmesB.build();

  const result: SegmentParseResult = { type: 'segment-result', sequence, channels, programmes };
  const transfer: ArrayBuffer[] = [];
  collectChannelTransferables(transfer, channels);
  collectRawProgrammeTransferables(transfer, programmes);
  self.postMessage(result, transfer);
});
