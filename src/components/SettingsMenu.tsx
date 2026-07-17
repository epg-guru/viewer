import { useState } from 'react';
import { ActionIcon, Menu, Stack, TextInput, Text, Button, Divider, SegmentedControl } from '@mantine/core';
import { IconRefresh, IconSettings } from '@tabler/icons-react';
import { validateSourceUrl } from '../lib/urlValidation';
import { useSettingsStore } from '../state/settingsStore';
import { useUpdateChecker } from '../hooks/useUpdateChecker';

export function SettingsMenu() {
  const { checking, checkForUpdates } = useUpdateChecker();
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
    <Menu shadow="md" width={320} position="bottom-end" closeOnItemClick={false}>
      <Menu.Target>
        <ActionIcon size="lg" variant="default" aria-label="Settings">
          <IconSettings size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown p="sm">
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
            rightSectionWidth={64}
            rightSectionPointerEvents="all"
            rightSection={
              <Button size="xs" variant="subtle" color="blue" onClick={handleSaveProxy} disabled={proxyInvalid}>
                {saved ? 'Saved' : 'Save'}
              </Button>
            }
          />
        </Stack>

        <Divider my="md" />

        <Button
          fullWidth
          variant="default"
          leftSection={<IconRefresh size={16} />}
          loading={checking}
          onClick={checkForUpdates}
        >
          Check for updates
        </Button>
      </Menu.Dropdown>
    </Menu>
  );
}
