import { useState } from 'react';
import { UnstyledButton, Image, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { ChannelEntry } from '../lib/xmltv/types';
import { validateImageUrl } from '../lib/urlValidation';
import { HighlightText } from './HighlightText';

export interface ChannelCellProps {
  channel: ChannelEntry;
  searchQuery?: string;
  isCompact?: boolean;
  onInspect: (channel: ChannelEntry) => void;
}

export function ChannelCell({ channel, searchQuery = '', isCompact = false, onInspect }: ChannelCellProps) {
  const [imgError, setImgError] = useState(false);
  const safeIcon = validateImageUrl(channel.icon);
  const iconSize = 32;

  // Show gnid only when it's actually informative: skip it if missing or
  // identical to id (nothing extra to say).
  const showGnid = Boolean(channel.gnid && channel.gnid !== channel.id);

  return (
    <UnstyledButton
      onClick={() => onInspect(channel)}
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: isCompact ? '0 6px' : '0 8px' }}
    >
      <Group gap="xs" wrap="nowrap" style={{ overflow: 'hidden', width: '100%' }}>
        {/* Collapsed entirely on compact rows, not just shrunk — the
            column is narrow enough there that the logo crowds out the
            name/id, which matter more for navigating. */}
        {!isCompact &&
          (safeIcon && !imgError ? (
            <Image
              src={safeIcon}
              onError={() => setImgError(true)}
              h={iconSize}
              w={iconSize}
              fit="contain"
              style={{ flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: iconSize, height: iconSize, flexShrink: 0 }} />
          ))}
        <Stack gap={0} style={{ flex: 1, overflow: 'hidden' }}>
          <HighlightText text={channel.displayName || channel.id} query={searchQuery} size="sm" truncate />
          {channel.id && (
            <Text size="10px" c="dimmed" truncate ff="monospace">
              {channel.id}
            </Text>
          )}
          {showGnid && (
            <Text size="10px" c="dimmed" truncate ff="monospace">
              {channel.gnid}
            </Text>
          )}
        </Stack>
        {channel.malformed && (
          <Tooltip label="Boundary detection was ambiguous for this entry, showing best effort">
            <IconAlertTriangle size={14} color="var(--mantine-color-yellow-6)" style={{ flexShrink: 0 }} />
          </Tooltip>
        )}
      </Group>
    </UnstyledButton>
  );
}
