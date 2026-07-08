import { useState } from 'react';
import { UnstyledButton, Image, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { ChannelEntry } from '../lib/xmltv/types';
import { validateImageUrl } from '../lib/urlValidation';
import { HighlightText } from './HighlightText';

export interface ChannelCellProps {
  channel: ChannelEntry;
  searchQuery?: string;
  onInspect: (channel: ChannelEntry) => void;
}

export function ChannelCell({ channel, searchQuery = '', onInspect }: ChannelCellProps) {
  const [imgError, setImgError] = useState(false);
  const safeIcon = validateImageUrl(channel.icon);

  // Show id + gnid only when both are actually informative — skip gnid if
  // it's missing or identical to id (nothing extra to say).
  const idLine =
    channel.gnid && channel.gnid !== channel.id ? `${channel.id} · ${channel.gnid}` : channel.id || undefined;

  return (
    <UnstyledButton
      onClick={() => onInspect(channel)}
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 8px' }}
    >
      <Group gap="xs" wrap="nowrap" style={{ overflow: 'hidden', width: '100%' }}>
        {safeIcon && !imgError ? (
          <Image src={safeIcon} onError={() => setImgError(true)} h={32} w={32} fit="contain" style={{ flexShrink: 0 }} />
        ) : (
          <div style={{ width: 32, height: 32, flexShrink: 0 }} />
        )}
        <Stack gap={0} style={{ flex: 1, overflow: 'hidden' }}>
          <HighlightText text={channel.displayName || channel.id} query={searchQuery} size="sm" truncate />
          {idLine && (
            <Text size="10px" c="dimmed" truncate ff="monospace">
              {idLine}
            </Text>
          )}
        </Stack>
        {channel.malformed && (
          <Tooltip label="Boundary detection was ambiguous for this entry — showing best effort">
            <IconAlertTriangle size={14} color="var(--mantine-color-yellow-6)" style={{ flexShrink: 0 }} />
          </Tooltip>
        )}
      </Group>
    </UnstyledButton>
  );
}
