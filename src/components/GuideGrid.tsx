import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Text } from '@mantine/core';
import type { ChannelEntry, EpgIndex, ProgrammeEntry } from '../lib/xmltv/types';
import { parseXmltvTime } from '../lib/xmltv/time';
import { buildCategoryColorMap } from '../lib/categoryColors';
import { useSettingsStore } from '../state/settingsStore';
import { ChannelCell } from './ChannelCell';
import { ProgrammeCell } from './ProgrammeCell';

const CHANNEL_COL_WIDTH = 200;
const ROW_HEIGHT = 70;
const DATE_ROW_HEIGHT = 20;
const HOUR_ROW_HEIGHT = 24;
const RULER_HEIGHT = DATE_ROW_HEIGHT + HOUR_ROW_HEIGHT;
const PX_PER_MINUTE = 4;
// Render programmes a few hours outside the visible viewport so fast
// scrolling doesn't show blank cells while the next frame catches up.
const BUFFER_MINUTES = 180;
const FALLBACK_SPAN_HOURS = 24;
const NOW_TICK_MS = 30_000;
const AUTO_SCROLL_LEAD_MINUTES = 30;

export type InspectTarget =
  | { kind: 'channel'; channel: ChannelEntry }
  | { kind: 'programme'; programme: ProgrammeEntry; channelName: string; channelIcon?: string };

export interface GuideGridProps {
  index: EpgIndex;
  onInspect: (target: InspectTarget) => void;
  searchQuery?: string;
  /** Bump this (e.g. from a "Today" button) to re-run the jump-to-now scroll. */
  jumpToNowSignal?: number;
}

// searchText already covers title/subTitle/category/desc/etc — every text
// node in the programme, tags stripped, lowercased at parse time.
function programmeMatches(p: ProgrammeEntry, query: string): boolean {
  return p.searchText.includes(query);
}

function floorToHour(ms: number): number {
  const d = new Date(ms);
  d.setUTCMinutes(0, 0, 0);
  return d.getTime();
}

// Calendar-day boundaries are meaningful in the viewer's local time, not
// UTC — unlike floorToHour above, which only needs DST-safe hour alignment.
function floorToLocalMidnight(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function GuideGrid({ index, onInspect, searchQuery = '', jumpToNowSignal = 0 }: GuideGridProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const query = searchQuery.trim().toLowerCase();
  const searchScope = useSettingsStore((s) => s.searchScope);

  const timelineStart = useMemo(() => floorToHour(index.timeRange?.start ?? Date.now()), [index]);
  const timelineEnd = useMemo(
    () => index.timeRange?.end ?? timelineStart + FALLBACK_SPAN_HOURS * 3_600_000,
    [index, timelineStart],
  );
  const totalMinutes = Math.max(60, (timelineEnd - timelineStart) / 60_000);
  const totalWidth = totalMinutes * PX_PER_MINUTE;

  const categoryColors = useMemo(() => buildCategoryColorMap(index), [index]);

  // Which channels match (name or any programme) — computed once per query
  // over the whole dataset. Search actually filters the grid: non-matching
  // channels are dropped from the row list entirely, and within a matching
  // channel only its matching programmes render.
  const { matchingChannelIds, matchCount } = useMemo(() => {
    if (!query) return { matchingChannelIds: null as Set<string> | null, matchCount: 0 };
    const ids = new Set<string>();
    let count = 0;
    for (const channel of index.channels) {
      const channelNameMatch = searchScope !== 'programmes' && channel.searchText.includes(query);
      let channelHasMatch = channelNameMatch;
      if (searchScope !== 'channels') {
        const programmes = index.programmesByChannel.get(channel.id) ?? [];
        for (const p of programmes) {
          if (programmeMatches(p, query)) {
            channelHasMatch = true;
            count++;
          }
        }
      }
      if (channelHasMatch) ids.add(channel.id);
    }
    return { matchingChannelIds: ids, matchCount: count };
  }, [index, query, searchScope]);

  const visibleChannels = useMemo(
    () => (matchingChannelIds ? index.channels.filter((c) => matchingChannelIds.has(c.id)) : index.channels),
    [index, matchingChannelIds],
  );

  const rowVirtualizer = useVirtualizer({
    count: visibleChannels.length,
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

  // Live "now" indicator — re-render on a light interval rather than
  // reacting to every scroll/resize, since minute-level precision is plenty.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Open the guide already centered near the present, rather than at the
  // very start of the (possibly multi-day) loaded range. Runs once per
  // newly loaded source, and again whenever jumpToNowSignal is bumped (the
  // "Today" button).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = Date.now() - AUTO_SCROLL_LEAD_MINUTES * 60_000;
    const clamped = Math.min(Math.max(target, timelineStart), timelineEnd);
    el.scrollLeft = Math.max(0, ((clamped - timelineStart) / 60_000) * PX_PER_MINUTE);
    setScrollLeft(el.scrollLeft);
  }, [index, timelineStart, timelineEnd, jumpToNowSignal]);

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

  // Each entry spans a FULL calendar day (not clipped to the visible
  // window) — the label inside sticks to the left edge of the viewport
  // while its day segment is in view, then hands off to the next one, via
  // nested position:sticky within each day's own absolutely-positioned box.
  const dateSegments = useMemo(() => {
    const segments: { left: number; width: number; label: string }[] = [];
    let dayStart = floorToLocalMidnight(viewStartMs);
    while (dayStart <= viewEndMs) {
      const dayEndDate = new Date(dayStart);
      dayEndDate.setDate(dayEndDate.getDate() + 1);
      const dayEnd = dayEndDate.getTime();
      const left = ((dayStart - timelineStart) / 60_000) * PX_PER_MINUTE;
      const width = ((dayEnd - dayStart) / 60_000) * PX_PER_MINUTE;
      segments.push({
        left,
        width,
        label: new Date(dayStart).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
      });
      dayStart = dayEnd;
    }
    return segments;
  }, [viewStartMs, viewEndMs, timelineStart]);

  const nowLeft = useMemo(() => {
    if (nowTick < timelineStart || nowTick > timelineEnd) return null;
    return ((nowTick - timelineStart) / 60_000) * PX_PER_MINUTE;
  }, [nowTick, timelineStart, timelineEnd]);

  const visibleProgrammes = useCallback(
    (channelId: string): { entry: ProgrammeEntry; left: number; width: number }[] => {
      const list = index.programmesByChannel.get(channelId);
      if (!list) return [];
      // Search only decides which CHANNEL rows appear (via matchingChannelIds
      // below); once a channel is shown, all of its programmes render —
      // otherwise a channel that matched by name alone (its own programme
      // titles containing none of the query text) would show as empty.
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}
      >
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
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  height: DATE_ROW_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderBottom: '1px solid var(--mantine-color-dark-6)',
                }}
              >
                {query && (
                  <Text size="10px" c="dimmed">
                    {matchingChannelIds!.size.toLocaleString()} matching channel{matchingChannelIds!.size === 1 ? '' : 's'}
                  </Text>
                )}
              </div>
              <div style={{ height: HOUR_ROW_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {query && searchScope !== 'channels' && (
                  <Text size="10px" c="dimmed">
                    {matchCount.toLocaleString()} matching programme{matchCount === 1 ? '' : 's'}
                  </Text>
                )}
              </div>
            </div>
            <div style={{ position: 'relative', width: totalWidth }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: DATE_ROW_HEIGHT,
                  borderBottom: '1px solid var(--mantine-color-dark-6)',
                }}
              >
                {dateSegments.map((seg) => (
                  // No overflow:hidden here — per the CSS Overflow spec, an
                  // overflow:hidden ancestor becomes the sticky element's own
                  // scroll-reference container, which would make it "stick"
                  // relative to this (already-scrolling-with-the-page) div
                  // instead of the real scrollport, defeating stickiness
                  // entirely. A same-day label overrunning into the next
                  // day's space right at the handoff is an acceptable minor
                  // overlap, masked by the ruler's opaque background.
                  <div key={seg.left} style={{ position: 'absolute', left: seg.left, width: seg.width, top: 0, height: DATE_ROW_HEIGHT }}>
                    <div
                      style={{
                        position: 'sticky',
                        // position:sticky's `left` is relative to the true
                        // scroll viewport edge, not this element's parent —
                        // left:0 would sit behind (and get covered by) the
                        // sticky channel column, which also claims x:0.
                        // Offsetting by CHANNEL_COL_WIDTH sticks it flush
                        // against the column's right edge instead.
                        left: CHANNEL_COL_WIDTH,
                        fontSize: 11,
                        fontWeight: 600,
                        opacity: 0.85,
                        paddingLeft: 4,
                        whiteSpace: 'nowrap',
                        width: 'fit-content',
                        background: 'var(--mantine-color-body)',
                      }}
                    >
                      {seg.label}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ position: 'absolute', top: DATE_ROW_HEIGHT, left: 0, right: 0, height: HOUR_ROW_HEIGHT }}>
                {hourMarks.map((m) => (
                  <div
                    key={m.left}
                    style={{ position: 'absolute', left: m.left, top: 2, fontSize: 11, opacity: 0.7, paddingLeft: 4 }}
                  >
                    {m.label}
                  </div>
                ))}
                {nowLeft !== null && (
                  <div
                    style={{
                      position: 'absolute',
                      left: nowLeft - 4,
                      top: 2,
                      width: 0,
                      height: 0,
                      borderLeft: '4px solid transparent',
                      borderRight: '4px solid transparent',
                      borderTop: '6px solid var(--mantine-color-yellow-4)',
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {nowLeft !== null && (
            <div
              style={{
                position: 'absolute',
                left: CHANNEL_COL_WIDTH + nowLeft,
                top: RULER_HEIGHT,
                width: 2,
                height: rowVirtualizer.getTotalSize(),
                background: 'var(--mantine-color-yellow-4)',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            />
          )}

          {dateSegments.map(
            (seg) =>
              seg.left > 0 && (
                <div
                  key={`div-${seg.left}`}
                  style={{
                    position: 'absolute',
                    left: CHANNEL_COL_WIDTH + seg.left,
                    top: RULER_HEIGHT,
                    width: 1,
                    height: rowVirtualizer.getTotalSize(),
                    background: 'var(--mantine-color-dark-5)',
                    pointerEvents: 'none',
                  }}
                />
              ),
          )}

          {rowVirtualizer.getVirtualItems().map((vRow) => {
            const channel = visibleChannels[vRow.index];
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
                  <ChannelCell
                    channel={channel}
                    searchQuery={query}
                    onInspect={(ch) => onInspect({ kind: 'channel', channel: ch })}
                  />
                </div>
                <div style={{ position: 'relative', width: totalWidth }}>
                  {visibleProgrammes(channel.id).map(({ entry, left, width }) => (
                    <ProgrammeCell
                      key={entry.byteStart}
                      programme={entry}
                      left={left}
                      width={width}
                      color={categoryColors.colorFor(entry.category)}
                      searchQuery={query}
                      onInspect={(p) =>
                        onInspect({ kind: 'programme', programme: p, channelName: channel.displayName, channelIcon: channel.icon })
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
