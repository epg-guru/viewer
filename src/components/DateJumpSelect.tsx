import { useMemo } from 'react';
import { Select } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import type { EpgIndex } from '../lib/xmltv/types';
import { enumerateLocalDays } from '../lib/xmltv/time';

export interface DateJumpSelectProps {
  index: EpgIndex;
  onSelect: (ms: number) => void;
}

/** Dropdown populated only with the calendar dates the loaded feed actually
 * spans (from index.timeRange), not an arbitrary range. Uncontrolled —
 * picking a date is a one-shot jump action, not a persistent selection kept
 * in sync with scroll position. */
export function DateJumpSelect({ index, onSelect }: DateJumpSelectProps) {
  const data = useMemo(() => {
    if (!index.timeRange) return [];
    return enumerateLocalDays(index.timeRange.start, index.timeRange.end).map((ms) => ({
      value: String(ms),
      label: new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
    }));
  }, [index]);

  if (data.length === 0) return null;

  return (
    <Select
      placeholder="Jump to date"
      data={data}
      value={null}
      onChange={(value) => value && onSelect(Number(value))}
      leftSection={<IconCalendar size={16} />}
      size="sm"
      w={170}
      searchable={false}
      allowDeselect={false}
      comboboxProps={{ withinPortal: true }}
    />
  );
}
