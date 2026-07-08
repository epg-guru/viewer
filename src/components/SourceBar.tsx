import { useEffect, useRef, useState } from 'react';
import { Group, Text, ActionIcon, Tooltip, TextInput, Button } from '@mantine/core';
import { IconUpload, IconRefresh, IconPlayerPlay } from '@tabler/icons-react';
import { useEpgStore } from '../state/epgStore';
import { useSettingsStore } from '../state/settingsStore';
import { PresetsPanel } from './PresetsPanel';

/** Always-visible controls row. Shows either the Upload control or the
 * direct-URL-lookup control, per the mode chosen in Settings. */
export function SourceBar() {
  const sourceMode = useSettingsStore((s) => s.sourceMode);
  const setSourceMode = useSettingsStore((s) => s.setSourceMode);
  const status = useEpgStore((s) => s.status);
  const sourceUrl = useEpgStore((s) => s.sourceUrl);
  const sourceKind = useEpgStore((s) => s.sourceKind);
  const requestLoad = useEpgStore((s) => s.requestLoad);
  const requestLoadFile = useEpgStore((s) => s.requestLoadFile);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlInput, setUrlInput] = useState('');

  // Auto-load ?url= on first mount only — a shared/bookmarked link should
  // just work without the user re-pasting it, switching to URL mode so the
  // right control is actually visible.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromParam = params.get('url');
    if (fromParam) {
      setUrlInput(fromParam);
      setSourceMode('url');
      void requestLoad(fromParam);
    }
    // Intentionally empty deps — this is a one-time initial-load effect.
    // eslint-disable-next-line
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) requestLoadFile(file);
    e.target.value = '';
  }

  function go(): void {
    const target = isRefresh ? sourceUrl : urlInput.trim();
    if (target) void requestLoad(target);
  }

  function loadPreset(url: string): void {
    setUrlInput(url);
    void requestLoad(url);
  }

  const isRefresh = sourceKind === 'url' && Boolean(urlInput.trim()) && urlInput.trim() === sourceUrl;
  const busy = status === 'checking' || status === 'loading';

  if (sourceMode === 'url') {
    return (
      <Group align="flex-end" gap="xs" wrap="wrap">
        <TextInput
          style={{ flex: 1, minWidth: 280 }}
          label="XMLTV guide URL"
          placeholder="https://example.com/guide.xml.gz"
          value={urlInput}
          onChange={(e) => setUrlInput(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
        />
        <Button
          onClick={go}
          loading={busy}
          leftSection={isRefresh ? <IconRefresh size={16} /> : <IconPlayerPlay size={16} />}
        >
          {isRefresh ? 'Refresh' : 'Go'}
        </Button>
        <PresetsPanel currentUrl={sourceKind === 'url' ? sourceUrl : null} onLoad={loadPreset} />
      </Group>
    );
  }

  // Nothing loaded yet — EmptyState already has a big Upload CTA in the main
  // content area, so a second small button up here would just look lonely
  // and redundant. Only show this row once there's something to swap out.
  if (status !== 'ready') return null;

  return (
    <Group gap="xs" align="center">
      <Tooltip label="Upload a different EPG file">
        <ActionIcon
          variant="default"
          size="lg"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Upload EPG file"
        >
          <IconUpload size={18} />
        </ActionIcon>
      </Tooltip>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml,.gz,.xml.gz,application/xml,text/xml,application/gzip"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      {sourceKind === 'file' && sourceUrl && (
        <Text size="sm" c="dimmed" truncate style={{ maxWidth: 480 }}>
          File: {sourceUrl}
        </Text>
      )}
    </Group>
  );
}
