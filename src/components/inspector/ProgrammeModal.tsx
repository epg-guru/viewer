import { Modal, Group, Text, Badge, Stack, Image, Divider } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { ProgrammeEntry } from '../../lib/xmltv/types';
import { validateImageUrl } from '../../lib/urlValidation';
import { XmlSourceSection } from './XmlSourceSection';

const COMPACT_QUERY = '(max-width: 640px)';

export interface ProgrammeModalProps {
  programme: ProgrammeEntry;
  channelName: string;
  channelIcon?: string;
  onClose: () => void;
}

function formatTimeRange(start: number, stop: number): string {
  if (!Number.isFinite(start) || !Number.isFinite(stop)) return '';
  const dateFmt: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const startDate = new Date(start);
  const stopDate = new Date(stop);
  const sameDay = startDate.toDateString() === stopDate.toDateString();
  const startStr = `${startDate.toLocaleDateString([], dateFmt)} · ${startDate.toLocaleTimeString([], timeFmt)}`;
  const stopStr = sameDay
    ? stopDate.toLocaleTimeString([], timeFmt)
    : `${stopDate.toLocaleDateString([], dateFmt)} · ${stopDate.toLocaleTimeString([], timeFmt)}`;
  return `${startStr} – ${stopStr}`;
}

export function ProgrammeModal({ programme, channelName, channelIcon, onClose }: ProgrammeModalProps) {
  const isCompact = useMediaQuery(COMPACT_QUERY) ?? false;
  // The programme's own <icon> (episode/poster art) wins when the feed
  // provides one; otherwise fall back to the channel's icon so the modal
  // isn't left with a blank space.
  const icon = validateImageUrl(programme.icon) ?? validateImageUrl(channelIcon);
  const title = programme.title || '(untitled)';

  return (
    <Modal opened onClose={onClose} title={title} size="lg" fullScreen={isCompact}>
      <Stack gap="lg">
        <Group align="flex-start" gap="md" wrap="nowrap">
          {icon ? (
            <Image src={icon} w={72} h={72} fit="contain" radius="sm" style={{ flexShrink: 0 }} />
          ) : (
            <div style={{ width: 72, height: 72, flexShrink: 0 }} />
          )}
          <Stack gap={6} style={{ flex: 1 }}>
            <Group gap={6}>
              {programme.category && (
                <Badge variant="light" size="sm">
                  {programme.category}
                </Badge>
              )}
              <Text size="sm" fw={500}>
                {formatTimeRange(programme.start, programme.stop)}
              </Text>
            </Group>
            {programme.subTitle && <Text c="dimmed">{programme.subTitle}</Text>}
            <Text size="sm" c="dimmed">
              {channelName}
            </Text>
          </Stack>
        </Group>

        {programme.desc && (
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
            {programme.desc}
          </Text>
        )}

        <Divider />

        <XmlSourceSection
          target={programme}
          byteStart={programme.byteStart}
          byteEnd={programme.byteEnd}
          malformed={programme.malformed}
        />
      </Stack>
    </Modal>
  );
}
