import { Alert, Progress, Group, Text, Loader, UnstyledButton, Tooltip, Center, Button } from '@mantine/core';
import { IconAlertTriangle, IconX } from '@tabler/icons-react';
import { useEpgStore } from '../state/epgStore';

/** Loading progress and errors get their own reserved block, separate from
 * the controls row above — so a status message never causes the buttons to
 * reflow/wrap. Renders nothing (zero height) when there's nothing to show. */
export function StatusArea() {
  const status = useEpgStore((s) => s.status);
  const progress = useEpgStore((s) => s.progress);
  const error = useEpgStore((s) => s.error);
  const cancelLoad = useEpgStore((s) => s.cancelLoad);

  if (status === 'checking') {
    return (
      <Center>
        <Tooltip label="Click to cancel">
          <UnstyledButton onClick={cancelLoad}>
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm" c="dimmed">
                Checking source…
              </Text>
            </Group>
          </UnstyledButton>
        </Tooltip>
        <Button
          variant="subtle"
          color="gray"
          size="compact-xs"
          ml={6}
          leftSection={<IconX size={12} />}
          onClick={cancelLoad}
        >
          Cancel
        </Button>
      </Center>
    );
  }

  if (status === 'loading' && progress) {
    const percent = progress.totalBytes ? Math.min(100, (progress.bytesDownloaded / progress.totalBytes) * 100) : null;
    return (
      <Center>
        <Tooltip label="Click to cancel">
          <UnstyledButton onClick={cancelLoad}>
            <Group gap="sm" wrap="nowrap" align="center">
              {percent !== null ? (
                <Progress value={percent} size="sm" style={{ width: 200 }} />
              ) : (
                <Loader size="xs" />
              )}
              <Text size="sm" c="dimmed">
                {(progress.bytesDownloaded / (1024 * 1024)).toFixed(1)} MB
                {progress.totalBytes ? ` / ${(progress.totalBytes / (1024 * 1024)).toFixed(0)} MB` : ' downloaded'}
                {' · '}
                {progress.channelsSeen.toLocaleString()} channels, {progress.programmesSeen.toLocaleString()} programmes
                indexed
              </Text>
            </Group>
          </UnstyledButton>
        </Tooltip>
        <Button
          variant="subtle"
          color="gray"
          size="compact-xs"
          ml={6}
          leftSection={<IconX size={12} />}
          onClick={cancelLoad}
        >
          Cancel
        </Button>
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
