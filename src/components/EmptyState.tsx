import { useRef } from 'react';
import { Center, Stack, Button, Text } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import { useEpgStore } from '../state/epgStore';
import { useSettingsStore } from '../state/settingsStore';

export function EmptyState() {
  const sourceMode = useSettingsStore((s) => s.sourceMode);
  const requestLoadFile = useEpgStore((s) => s.requestLoadFile);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) requestLoadFile(file);
    e.target.value = '';
  }

  if (sourceMode === 'url') {
    return (
      <Center h="100%">
        <Text c="dimmed" size="sm">
          Enter a URL above and click Go to load a guide.
        </Text>
      </Center>
    );
  }

  return (
    <Center h="100%">
      <Stack align="center" gap="xs">
        <Button size="lg" leftSection={<IconUpload size={20} />} onClick={() => fileInputRef.current?.click()}>
          Upload EPG file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.gz,.xml.gz,application/xml,text/xml,application/gzip"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <Text c="dimmed" size="sm">
          .xml or .xml.gz — or switch to Direct URL lookup in Settings
        </Text>
      </Stack>
    </Center>
  );
}
