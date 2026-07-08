import { UnstyledButton, Group } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { ProgrammeEntry } from '../lib/xmltv/types';
import { hexToRgba } from '../lib/categoryColors';
import { HighlightText } from './HighlightText';

export interface ProgrammeCellProps {
  programme: ProgrammeEntry;
  left: number;
  width: number;
  /** Category color, a solid left-border accent, plus a low-opacity tint
   * across the cell. Text stays in normal ink regardless of hue. */
  color: string;
  searchQuery?: string;
  onInspect: (programme: ProgrammeEntry) => void;
}

export function ProgrammeCell({ programme, left, width, color, searchQuery = '', onInspect }: ProgrammeCellProps) {
  return (
    <UnstyledButton
      onClick={() => onInspect(programme)}
      style={{
        position: 'absolute',
        left,
        width: Math.max(width - 2, 4),
        top: 4,
        bottom: 4,
        borderRadius: 4,
        padding: '3px 6px',
        overflow: 'hidden',
        background: programme.malformed ? 'var(--mantine-color-yellow-9)' : hexToRgba(color, 0.18),
        // Longhand border properties throughout (never mixed with the `border`
        // shorthand), mixing the two on the same element trips a React DOM
        // warning when only one side changes across rerenders.
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 3,
        borderTopStyle: 'solid',
        borderRightStyle: 'solid',
        borderBottomStyle: 'solid',
        borderLeftStyle: 'solid',
        borderTopColor: 'var(--mantine-color-dark-4)',
        borderRightColor: 'var(--mantine-color-dark-4)',
        borderBottomColor: 'var(--mantine-color-dark-4)',
        borderLeftColor: color,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 1,
      }}
      title={programme.subTitle ? `${programme.title}: ${programme.subTitle}` : programme.title}
    >
      <Group gap={4} wrap="nowrap">
        {programme.malformed && <IconAlertTriangle size={12} color="var(--mantine-color-yellow-3)" />}
        <HighlightText text={programme.title || '(untitled)'} query={searchQuery} size="xs" fw={500} truncate />
      </Group>
      {programme.subTitle && (
        <HighlightText text={programme.subTitle} query={searchQuery} size="xs" c="dimmed" truncate />
      )}
    </UnstyledButton>
  );
}
