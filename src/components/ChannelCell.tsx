import { useState } from 'react';
import { Text, UnstyledButton, Image, Group, Tooltip } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { ChannelEntry } from '../lib/xmltv/types';
import { validateImageUrl } from '../lib/urlValidation';

export interface ChannelCellProps {
  channel: ChannelEntry;
  onInspect: (target: { label: string; byteStart: number; byteEnd: number; malformed?: boolean }) => void;
}

export function ChannelCell({ channel, onInspect }: ChannelCellProps) {
  const [imgError, setImgError] = useState(false);
  const safeIcon = validateImageUrl(channel.icon);

  return (
    <UnstyledButton
      onClick={() =>
        onInspect({
          label: channel.displayName || channel.id,
          byteStart: channel.byteStart,
          byteEnd: channel.byteEnd,
          malformed: channel.malformed,
        })
      }
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 8px' }}
    >
      <Group gap="xs" wrap="nowrap" style={{ overflow: 'hidden' }}>
        {safeIcon && !imgError ? (
          <Image src={safeIcon} onError={() => setImgError(true)} h={32} w={32} fit="contain" />
        ) : (
          <div style={{ width: 32, height: 32, flexShrink: 0 }} />
        )}
        <Text size="sm" truncate style={{ flex: 1 }}>
          {channel.displayName || channel.id}
        </Text>
        {channel.malformed && (
          <Tooltip label="Boundary detection was ambiguous for this entry — showing best effort">
            <IconAlertTriangle size={14} color="var(--mantine-color-yellow-6)" />
          </Tooltip>
        )}
      </Group>
    </UnstyledButton>
  );
}
