import { useState, type ReactNode } from 'react';
import { Group, Popover, Divider, Button, Text, TextInput, ActionIcon, Stack, Tabs } from '@mantine/core';
import { IconBookmarks, IconPlus, IconTrash, IconWorld, IconX } from '@tabler/icons-react';
import { addPreset, loadPresets, removePreset, type Preset } from '../lib/presets';
import { EpgGuruCatalogTab } from './EpgGuruCatalogTab';

export interface PresetsPanelProps {
  currentUrl: string | null;
  onLoad: (url: string) => void;
  /** Opens/closes on URL-field focus rather than a dedicated trigger button;
   * caller owns the open state (SourceBar toggles it via the field's
   * onFocus). */
  opened: boolean;
  onOpenedChange: (opened: boolean) => void;
  /** The URL input, rendered as the Popover's positioning target. Uses
   * Popover rather than Menu here specifically because Menu.Target composes
   * its own click/focus handling for toggle behavior, which fights a real
   * text input's native focus/typing; Popover.Target just anchors position
   * and leaves the child alone. */
  children: ReactNode;
}

export function PresetsPanel({ currentUrl, onLoad, opened, onOpenedChange, children }: PresetsPanelProps) {
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets());
  const [saveName, setSaveName] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);

  // Closing here (rather than relying on click-outside alone) ensures it's
  // gone the instant the loading modal takes over, regardless of which
  // tab/source triggered the load.
  function handleLoad(url: string): void {
    onOpenedChange(false);
    onLoad(url);
  }

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
    <Popover
      opened={opened}
      onChange={onOpenedChange}
      position="bottom-start"
      width={380}
      shadow="md"
      trapFocus={false}
      returnFocus={false}
    >
      <Popover.Target>{children}</Popover.Target>
      <Popover.Dropdown p="sm">
        <Group justify="space-between" align="center" mb={4}>
          <Text size="sm" fw={500}>
            Presets
          </Text>
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => onOpenedChange(false)} aria-label="Close presets">
            <IconX size={14} />
          </ActionIcon>
        </Group>
        <Tabs defaultValue="mine" keepMounted={false}>
          <Tabs.List grow>
            <Tabs.Tab value="mine" leftSection={<IconBookmarks size={14} />}>
              My Presets
            </Tabs.Tab>
            <Tabs.Tab value="epg-guru" leftSection={<IconWorld size={14} />}>
              epg.guru
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="mine">
            <Stack gap={4} p={4}>
              {presets.length === 0 && (
                <Text size="xs" c="dimmed" ta="center" py={4}>
                  No saved presets yet
                </Text>
              )}
              {presets.map((p) => (
                <Group key={p.url} gap={4} wrap="nowrap">
                  <Button variant="subtle" size="xs" style={{ flex: 1 }} justify="flex-start" onClick={() => handleLoad(p.url)}>
                    {p.name}
                  </Button>
                  <ActionIcon variant="subtle" color="red" size="sm" onClick={() => handleRemove(p.url)} aria-label={`Remove ${p.name}`}>
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              ))}
              <Divider />
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
          </Tabs.Panel>

          <Tabs.Panel value="epg-guru">
            <EpgGuruCatalogTab onLoad={handleLoad} />
          </Tabs.Panel>
        </Tabs>
      </Popover.Dropdown>
    </Popover>
  );
}
