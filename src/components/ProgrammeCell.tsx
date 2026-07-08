import { UnstyledButton, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { ProgrammeEntry } from '../lib/xmltv/types';

export interface ProgrammeCellProps {
  programme: ProgrammeEntry;
  left: number;
  width: number;
  onInspect: (target: { label: string; byteStart: number; byteEnd: number; malformed?: boolean }) => void;
}

export function ProgrammeCell({ programme, left, width, onInspect }: ProgrammeCellProps) {
  return (
    <UnstyledButton
      onClick={() =>
        onInspect({
          label: programme.title || '(untitled)',
          byteStart: programme.byteStart,
          byteEnd: programme.byteEnd,
          malformed: programme.malformed,
        })
      }
      style={{
        position: 'absolute',
        left,
        width: Math.max(width - 2, 4),
        top: 4,
        bottom: 4,
        borderRadius: 4,
        padding: '2px 6px',
        overflow: 'hidden',
        background: programme.malformed ? 'var(--mantine-color-yellow-9)' : 'var(--mantine-color-dark-5)',
        border: '1px solid var(--mantine-color-dark-4)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
      title={programme.title}
    >
      {programme.malformed && <IconAlertTriangle size={12} color="var(--mantine-color-yellow-3)" />}
      <Text size="xs" truncate>
        {programme.title || '(untitled)'}
      </Text>
    </UnstyledButton>
  );
}
