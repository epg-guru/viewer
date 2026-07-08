import { useState } from 'react';
import { Modal, Stack, TextInput, Text, Button, Group, Divider, SegmentedControl } from '@mantine/core';
import { validateSourceUrl } from '../lib/urlValidation';
import { useSettingsStore } from '../state/settingsStore';

export interface SettingsMenuProps {
  opened: boolean;
  onClose: () => void;
}

export function SettingsMenu({ opened, onClose }: SettingsMenuProps) {
  const sourceMode = useSettingsStore((s) => s.sourceMode);
  const setSourceMode = useSettingsStore((s) => s.setSourceMode);
  const searchScope = useSettingsStore((s) => s.searchScope);
  const setSearchScope = useSettingsStore((s) => s.setSearchScope);
  const corsProxyUrlSaved = useSettingsStore((s) => s.corsProxyUrl);
  const setCorsProxyUrl = useSettingsStore((s) => s.setCorsProxyUrl);

  const [corsProxyUrl, setCorsProxyUrlDraft] = useState(corsProxyUrlSaved ?? '');
  const [saved, setSaved] = useState(false);

  function handleSaveProxy(): void {
    const trimmed = corsProxyUrl.trim();
    if (trimmed && !validateSourceUrl(trimmed)) return;
    setCorsProxyUrl(trimmed || null);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const proxyInvalid = corsProxyUrl.trim() !== '' && !validateSourceUrl(corsProxyUrl.trim());

  return (
    <Modal opened={opened} onClose={onClose} title="Settings" size="md">
      <Stack gap={6}>
        <Text size="sm" fw={500}>
          Source mode
        </Text>
        <Text size="xs" c="dimmed">
          Which control shows up in the main toolbar for loading a guide.
        </Text>
        <SegmentedControl
          value={sourceMode}
          onChange={(value) => setSourceMode(value as 'upload' | 'url')}
          data={[
            { label: 'Upload file', value: 'upload' },
            { label: 'Direct URL lookup', value: 'url' },
          ]}
        />
      </Stack>

      <Divider my="md" />

      <Stack gap={6}>
        <Text size="sm" fw={500}>
          Search scope
        </Text>
        <Text size="xs" c="dimmed">
          What the search box matches against.
        </Text>
        <SegmentedControl
          value={searchScope}
          onChange={(value) => setSearchScope(value as 'channels' | 'programmes' | 'both')}
          data={[
            { label: 'Channels', value: 'channels' },
            { label: 'Programmes', value: 'programmes' },
            { label: 'Both', value: 'both' },
          ]}
        />
      </Stack>

      <Divider my="md" />

      <Stack gap={6}>
        <Text size="sm" fw={500}>
          CORS proxy (optional)
        </Text>
        <Text size="xs" c="dimmed">
          Used only as a fallback when a direct-lookup source blocks cross-origin fetches. See the repo's{' '}
          <code>proxy/</code> directory for a small Cloudflare Worker you can deploy yourself. Leave blank to
          disable.
        </Text>
        <TextInput
          size="sm"
          placeholder="https://your-proxy.example.workers.dev"
          value={corsProxyUrl}
          onChange={(e) => setCorsProxyUrlDraft(e.currentTarget.value)}
          error={proxyInvalid ? 'Must be an http:// or https:// URL' : undefined}
        />
        <Group justify="flex-end" mt="xs">
          <Button size="sm" onClick={handleSaveProxy} disabled={proxyInvalid}>
            {saved ? 'Saved' : 'Save'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
