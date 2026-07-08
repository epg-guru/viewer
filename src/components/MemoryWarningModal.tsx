import { useEffect, useState } from 'react';
import { Modal, Text, Group, Button } from '@mantine/core';
import { useEpgStore } from '../state/epgStore';

/** Advisory-only heads-up, fired once by the coordinator when decompressed
 * size crosses a soft threshold mid-parse, parsing is already continuing
 * regardless (unlike SizeWarningModal's pre-flight confirm/cancel), so this
 * just needs a dismiss, tracked locally rather than in the store. */
export function MemoryWarningModal() {
  const memoryWarningBytes = useEpgStore((s) => s.memoryWarningBytes);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (memoryWarningBytes === null) setDismissed(false);
  }, [memoryWarningBytes]);

  const opened = memoryWarningBytes !== null && !dismissed;

  return (
    <Modal opened={opened} onClose={() => setDismissed(true)} title="Large decompressed size" centered>
      <Text size="sm" mb="md">
        This source has decompressed to over{' '}
        {memoryWarningBytes !== null ? (memoryWarningBytes / (1024 * 1024 * 1024)).toFixed(1) : ''} GB so far. Parsing
        is continuing, but this may use significant memory on this device.
      </Text>
      <Group justify="flex-end">
        <Button onClick={() => setDismissed(true)}>OK</Button>
      </Group>
    </Modal>
  );
}
