import { useState } from 'react';
import { Menu, ActionIcon, Stack, TextInput, Text, Button } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { loadSettings, saveSettings } from '../lib/settings';
import { validateSourceUrl } from '../lib/urlValidation';

export function SettingsMenu() {
  const [corsProxyUrl, setCorsProxyUrl] = useState(() => loadSettings().corsProxyUrl ?? '');
  const [saved, setSaved] = useState(false);

  function handleSave(): void {
    const trimmed = corsProxyUrl.trim();
    if (trimmed && !validateSourceUrl(trimmed)) return;
    saveSettings({ corsProxyUrl: trimmed || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const invalid = corsProxyUrl.trim() !== '' && !validateSourceUrl(corsProxyUrl.trim());

  return (
    <Menu shadow="md" width={340} closeOnItemClick={false}>
      <Menu.Target>
        <ActionIcon variant="default" size="lg" aria-label="Settings">
          <IconSettings size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Stack gap={6} p={8}>
          <Text size="sm" fw={500}>
            CORS proxy (optional)
          </Text>
          <Text size="xs" c="dimmed">
            Used only as a fallback when a source blocks direct cross-origin fetches. See the repo's{' '}
            <code>proxy/</code> directory for a small Cloudflare Worker you can deploy yourself. Leave blank to
            disable.
          </Text>
          <TextInput
            size="xs"
            placeholder="https://your-proxy.example.workers.dev"
            value={corsProxyUrl}
            onChange={(e) => setCorsProxyUrl(e.currentTarget.value)}
            error={invalid ? 'Must be an http:// or https:// URL' : undefined}
          />
          <Button size="xs" onClick={handleSave} disabled={invalid}>
            {saved ? 'Saved' : 'Save'}
          </Button>
        </Stack>
      </Menu.Dropdown>
    </Menu>
  );
}
