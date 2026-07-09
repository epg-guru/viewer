import { Modal, Group, Text, Stack, Image, Divider } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { ChannelEntry } from '../../lib/xmltv/types';
import { validateImageUrl } from '../../lib/urlValidation';
import { XmlSourceSection } from './XmlSourceSection';

const COMPACT_QUERY = '(max-width: 640px)';

export interface ChannelModalProps {
  channel: ChannelEntry;
  onClose: () => void;
}

export function ChannelModal({ channel, onClose }: ChannelModalProps) {
  const isCompact = useMediaQuery(COMPACT_QUERY) ?? false;
  const icon = validateImageUrl(channel.icon);
  const showGnid = Boolean(channel.gnid && channel.gnid !== channel.id);

  return (
    <Modal opened onClose={onClose} title={channel.displayName || channel.id} size="lg" fullScreen={isCompact}>
      <Stack gap="lg">
        <Group align="center" gap="md" wrap="nowrap">
          {icon ? (
            <Image src={icon} w={72} h={72} fit="contain" radius="sm" style={{ flexShrink: 0 }} />
          ) : (
            <div style={{ width: 72, height: 72, flexShrink: 0 }} />
          )}
          <Text size="lg" fw={600} style={{ flex: 1 }}>
            {channel.displayName || channel.id}
          </Text>
        </Group>

        <Divider />

        <Stack gap={4}>
          <Text size="xs" c="dimmed" ff="monospace">
            {channel.id}
          </Text>
          {showGnid && (
            <Text size="xs" c="dimmed" ff="monospace">
              {channel.gnid}
            </Text>
          )}
        </Stack>

        <Divider />

        <XmlSourceSection
          target={channel}
          byteStart={channel.byteStart}
          byteEnd={channel.byteEnd}
          malformed={channel.malformed}
        />
      </Stack>
    </Modal>
  );
}
