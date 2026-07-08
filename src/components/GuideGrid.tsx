import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { EpgIndex, ProgrammeEntry } from '../lib/xmltv/types';
import { parseXmltvTime } from '../lib/xmltv/time';
import { ChannelCell } from './ChannelCell';
import { ProgrammeCell } from './ProgrammeCell';

const CHANNEL_COL_WIDTH = 200;
const ROW_HEIGHT = 56;
const RULER_HEIGHT = 28;
const PX_PER_MINUTE = 4;
// Render programmes a few hours outside the visible viewport so fast
// scrolling doesn't show blank cells while the next frame catches up.
const BUFFER_MINUTES = 180;
const FALLBACK_SPAN_HOURS = 24;

export interface InspectTarget {
  label: string;
  byteStart: number;
  byteEnd: number;
  malformed?: boolean;
}

export interface GuideGridProps {
  index: EpgIndex;
  onInspect: (target: InspectTarget) => void;
}

function floorToHour(ms: number): number {
  const d = new Date(ms);
  d.setUTCMinutes(0, 0, 0);
  return d.getTime();
}

export function GuideGrid({ index, onInspect }: GuideGridProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  const timelineStart = useMemo(() => floorToHour(index.timeRange?.start ?? Date.now()), [index]);
  const timelineEnd = useMemo(
    () => index.timeRange?.end ?? timelineStart + FALLBACK_SPAN_HOURS * 3_600_000,
    [index, timelineStart],
  );
  const totalMinutes = Math.max(60, (timelineEnd - timelineStart) / 60_000);
  const totalWidth = totalMinutes * PX_PER_MINUTE;

  const rowVirtualizer = useVirtualizer({
    count: index.channels.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setScrollLeft(el.scrollLeft);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setViewportWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const viewStartMs = timelineStart + (scrollLeft / PX_PER_MINUTE) * 60_000 - BUFFER_MINUTES * 60_000;
  const viewEndMs = timelineStart + ((scrollLeft + viewportWidth) / PX_PER_MINUTE) * 60_000 + BUFFER_MINUTES * 60_000;

  const hourMarks = useMemo(() => {
    const marks: { left: number; label: string }[] = [];
    const firstHour = floorToHour(viewStartMs);
    for (let t = firstHour; t <= viewEndMs; t += 3_600_000) {
      const left = ((t - timelineStart) / 60_000) * PX_PER_MINUTE;
      marks.push({ left, label: new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
    }
    return marks;
  }, [viewStartMs, viewEndMs, timelineStart]);

  const visibleProgrammes = useCallback(
    (channelId: string): { entry: ProgrammeEntry; left: number; width: number }[] => {
      const list = index.programmesByChannel.get(channelId);
      if (!list) return [];
      const out: { entry: ProgrammeEntry; left: number; width: number }[] = [];
      for (const entry of list) {
        const start = parseXmltvTime(entry.start);
        const stop = parseXmltvTime(entry.stop);
        if (start === null || stop === null) continue;
        if (stop < viewStartMs || start > viewEndMs) continue;
        const left = ((start - timelineStart) / 60_000) * PX_PER_MINUTE;
        const width = ((stop - start) / 60_000) * PX_PER_MINUTE;
        out.push({ entry, left, width });
      }
      return out;
    },
    [index, timelineStart, viewStartMs, viewEndMs],
  );

  return (
    <div ref={scrollRef} onScroll={handleScroll} style={{ overflow: 'auto', height: '100%', position: 'relative' }}>
      <div
        style={{
          position: 'relative',
          width: CHANNEL_COL_WIDTH + totalWidth,
          height: RULER_HEIGHT + rowVirtualizer.getTotalSize(),
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 3,
            height: RULER_HEIGHT,
            display: 'flex',
            background: 'var(--mantine-color-body)',
            borderBottom: '1px solid var(--mantine-color-dark-4)',
          }}
        >
          <div
            style={{
              position: 'sticky',
              left: 0,
              width: CHANNEL_COL_WIDTH,
              flexShrink: 0,
              zIndex: 4,
              background: 'var(--mantine-color-body)',
            }}
          />
          <div style={{ position: 'relative', width: totalWidth }}>
            {hourMarks.map((m) => (
              <div
                key={m.left}
                style={{ position: 'absolute', left: m.left, top: 0, fontSize: 11, opacity: 0.7, paddingLeft: 4 }}
              >
                {m.label}
              </div>
            ))}
          </div>
        </div>

        {rowVirtualizer.getVirtualItems().map((vRow) => {
          const channel = index.channels[vRow.index];
          return (
            <div
              key={channel.id + vRow.index}
              style={{
                position: 'absolute',
                top: RULER_HEIGHT + vRow.start,
                height: vRow.size,
                left: 0,
                display: 'flex',
                width: CHANNEL_COL_WIDTH + totalWidth,
                borderBottom: '1px solid var(--mantine-color-dark-6)',
              }}
            >
              <div
                style={{
                  position: 'sticky',
                  left: 0,
                  width: CHANNEL_COL_WIDTH,
                  flexShrink: 0,
                  zIndex: 1,
                  background: 'var(--mantine-color-body)',
                }}
              >
                <ChannelCell channel={channel} onInspect={onInspect} />
              </div>
              <div style={{ position: 'relative', width: totalWidth }}>
                {visibleProgrammes(channel.id).map(({ entry, left, width }) => (
                  <ProgrammeCell key={entry.byteStart} programme={entry} left={left} width={width} onInspect={onInspect} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
