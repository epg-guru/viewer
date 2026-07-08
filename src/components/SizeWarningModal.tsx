import { Modal, Text, Group, Button } from '@mantine/core';
import { useEpgStore } from '../state/epgStore';

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb > 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(0)} MB`;
}

export function SizeWarningModal() {
  const pending = useEpgStore((s) => s.pendingLargeLoad);
  const confirmLargeLoad = useEpgStore((s) => s.confirmLargeLoad);
  const cancelLargeLoad = useEpgStore((s) => s.cancelLargeLoad);

  return (
    <Modal opened={pending !== null} onClose={cancelLargeLoad} title="Large file" centered>
      <Text size="sm" mb="md">
        {pending?.kind === 'file' ? 'This file is' : 'This source reports a download size of'}{' '}
        {pending ? formatBytes(pending.totalBytes) : ''}, over the 500 MB warning threshold. Parsing it may take a
        while and use significant memory/disk on this device.
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={cancelLargeLoad}>
          Cancel
        </Button>
        <Button onClick={confirmLargeLoad}>Load anyway</Button>
      </Group>
    </Modal>
  );
}
