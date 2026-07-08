import { useState } from 'react';
import { Group, Menu, Button, TextInput, ActionIcon, Stack } from '@mantine/core';
import { IconBookmarks, IconPlus, IconTrash } from '@tabler/icons-react';
import { addPreset, loadPresets, removePreset, type Preset } from '../lib/presets';

export interface PresetsPanelProps {
  currentUrl: string | null;
  onLoad: (url: string) => void;
}

export function PresetsPanel({ currentUrl, onLoad }: PresetsPanelProps) {
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets());
  const [saveName, setSaveName] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);

  function handleSaveCurrent(): void {
    if (!currentUrl || !saveName.trim()) return;
    setPresets(addPreset(saveName.trim(), currentUrl));
    setSaveName('');
    setSaveOpen(false);
  }

  function handleRemove(url: string): void {
    setPresets(removePreset(url));
  }

  return (
    <Menu shadow="md" width={320} closeOnItemClick={false}>
      <Menu.Target>
        <Button variant="default" leftSection={<IconBookmarks size={16} />}>
          Presets
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Stack gap={4} p={4}>
          {presets.length === 0 && (
            <Menu.Item disabled>No saved presets yet</Menu.Item>
          )}
          {presets.map((p) => (
            <Group key={p.url} gap={4} wrap="nowrap">
              <Button variant="subtle" size="xs" style={{ flex: 1 }} justify="flex-start" onClick={() => onLoad(p.url)}>
                {p.name}
              </Button>
              <ActionIcon variant="subtle" color="red" size="sm" onClick={() => handleRemove(p.url)} aria-label={`Remove ${p.name}`}>
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}
          <Menu.Divider />
          {saveOpen ? (
            <Group gap={4} wrap="nowrap">
              <TextInput
                size="xs"
                placeholder="Name this source"
                value={saveName}
                onChange={(e) => setSaveName(e.currentTarget.value)}
                disabled={!currentUrl}
                style={{ flex: 1 }}
                autoFocus
              />
              <ActionIcon size="sm" onClick={handleSaveCurrent} disabled={!currentUrl || !saveName.trim()} aria-label="Save preset">
                <IconPlus size={14} />
              </ActionIcon>
            </Group>
          ) : (
            <Button
              variant="light"
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => setSaveOpen(true)}
              disabled={!currentUrl}
            >
              Save current source
            </Button>
          )}
        </Stack>
      </Menu.Dropdown>
    </Menu>
  );
}
