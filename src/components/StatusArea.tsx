import { Alert, Progress, Group, Text, Loader, Center, Stack, Button } from '@mantine/core';
import { IconAlertTriangle, IconX } from '@tabler/icons-react';
import { useEpgStore } from '../state/epgStore';

/** Loading progress and errors get their own reserved block, separate from
 * the controls row above, so a status message never causes the buttons to
 * reflow/wrap. Renders nothing (zero height) when there's nothing to show. */
export function StatusArea() {
  const status = useEpgStore((s) => s.status);
  const progress = useEpgStore((s) => s.progress);
  const error = useEpgStore((s) => s.error);
  const cancelLoad = useEpgStore((s) => s.cancelLoad);

  if (status === 'checking') {
    return (
      <Center style={{ width: '100%', boxSizing: 'border-box' }} px="xs">
        <Group gap="xs" justify="center" wrap="wrap" style={{ maxWidth: '100%' }}>
          <Group gap="xs" wrap="nowrap">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
              Checking source…
            </Text>
          </Group>
          <Button
            variant="subtle"
            color="red"
            size="compact-xs"
            leftSection={<IconX size={12} />}
            onClick={cancelLoad}
          >
            Cancel
          </Button>
        </Group>
      </Center>
    );
  }

  if (status === 'loading' && progress) {
    const percent = progress.totalBytes ? Math.min(100, (progress.bytesDownloaded / progress.totalBytes) * 100) : null;
    const parsing = progress.segmentsTotal > 0;
    const parsePercent = parsing ? Math.min(100, (progress.segmentsDone / progress.segmentsTotal) * 100) : null;
    return (
      <Center style={{ width: '100%', boxSizing: 'border-box' }} px="xs">
        <Stack gap={4} align="center" style={{ maxWidth: '100%' }}>
          <Group gap={6} wrap="wrap" justify="center">
            {/* Each stat + its label is its own nowrap span, so a narrow
                viewport wraps BETWEEN stats, never splitting a number away
                from what it's counting. */}
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {(progress.bytesDownloaded / (1024 * 1024)).toFixed(1)} MB
              {progress.totalBytes ? ` / ${(progress.totalBytes / (1024 * 1024)).toFixed(0)} MB` : ' downloaded'}
            </Text>
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              · {progress.channelsSeen.toLocaleString()} channels,
            </Text>
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {progress.programmesSeen.toLocaleString()} programmes indexed
            </Text>
            <Button
              variant="subtle"
              color="red"
              size="compact-xs"
              leftSection={<IconX size={12} />}
              onClick={cancelLoad}
              style={{ flexShrink: 0 }}
            >
              Cancel
            </Button>
          </Group>
          {percent !== null ? (
            <Progress value={percent} size="sm" style={{ width: '100%', maxWidth: 260 }} />
          ) : (
            <Loader size="xs" />
          )}
          {parsing && (
            <>
              <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                Parsing… {progress.segmentsDone.toLocaleString()} / {progress.segmentsTotal.toLocaleString()} segments
              </Text>
              <Progress value={parsePercent ?? 0} size="sm" style={{ width: '100%', maxWidth: 260 }} />
            </>
          )}
        </Stack>
      </Center>
    );
  }

  if (status === 'error' && error) {
    return (
      <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Couldn't load source">
        {error.message}
      </Alert>
    );
  }

  return null;
}
