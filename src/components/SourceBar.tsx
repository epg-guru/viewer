import { useEffect, useRef, useState } from 'react';
import { Group, Stack, TextInput, Button, ActionIcon, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconUpload, IconRefresh, IconPlayerPlay } from '@tabler/icons-react';
import { useEpgStore } from '../state/epgStore';
import { PresetsPanel } from './PresetsPanel';

const COMPACT_QUERY = '(max-width: 640px)';

/** Always-visible controls row: URL lookup and file upload sit side by side,
 * no mode to switch between. */
export function SourceBar() {
  const isCompact = useMediaQuery(COMPACT_QUERY) ?? false;
  const status = useEpgStore((s) => s.status);
  const sourceUrl = useEpgStore((s) => s.sourceUrl);
  const sourceKind = useEpgStore((s) => s.sourceKind);
  const requestLoad = useEpgStore((s) => s.requestLoad);
  const requestLoadFile = useEpgStore((s) => s.requestLoadFile);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);

  // Auto-load ?url= on first mount only, a shared/bookmarked link should
  // just work without the user re-pasting it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromParam = params.get('url');
    if (fromParam) {
      setUrlInput(fromParam);
      void requestLoad(fromParam);
    }
    // Intentionally empty deps, this is a one-time initial-load effect.
    // eslint-disable-next-line
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) {
      // Clear any typed URL so the field's placeholder (set to the
      // uploaded file's name below) is actually visible.
      setUrlInput('');
      requestLoadFile(file);
    }
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

  function handleUrlInputFocus(): void {
    setPresetsOpen(true);
  }

  const isRefresh = sourceKind === 'url' && Boolean(urlInput.trim()) && urlInput.trim() === sourceUrl;
  const busy = status === 'loading';
  // Nothing for Go to act on: no typed URL, and not a refresh of the
  // currently-loaded one (e.g. right after uploading a file, the field is
  // intentionally cleared to show the filename as a placeholder).
  const goDisabled = !isRefresh && !urlInput.trim();

  const uploadControlEl = isCompact ? (
    <Tooltip label="Upload a file">
      <ActionIcon
        variant="subtle"
        color="gray"
        size="md"
        onClick={() => fileInputRef.current?.click()}
        aria-label="Upload EPG file"
      >
        <IconUpload size={16} />
      </ActionIcon>
    </Tooltip>
  ) : (
    <Button
      size="xs"
      variant="subtle"
      color="gray"
      onClick={() => fileInputRef.current?.click()}
      leftSection={<IconUpload size={14} />}
    >
      Upload
    </Button>
  );

  const goControlEl = isCompact ? (
    <Tooltip label={isRefresh ? 'Refresh' : 'Go'}>
      <ActionIcon
        variant="subtle"
        color="blue"
        size="md"
        onClick={go}
        loading={busy}
        disabled={goDisabled}
        aria-label={isRefresh ? 'Refresh' : 'Go'}
      >
        {isRefresh ? <IconRefresh size={16} /> : <IconPlayerPlay size={16} />}
      </ActionIcon>
    </Tooltip>
  ) : (
    <Button
      size="xs"
      variant="subtle"
      color="blue"
      onClick={go}
      loading={busy}
      disabled={goDisabled}
      leftSection={isRefresh ? <IconRefresh size={14} /> : <IconPlayerPlay size={14} />}
    >
      {isRefresh ? 'Refresh' : 'Go'}
    </Button>
  );

  const inputControlsEl = (
    <Group gap={4} wrap="nowrap" justify="flex-end" style={{ width: '100%' }} pr={4}>
      {uploadControlEl}
      {goControlEl}
    </Group>
  );

  const rightSectionWidth = isCompact ? 76 : isRefresh ? 226 : 206;

  const urlInputEl = (
    <TextInput
      style={{ flex: 1, minWidth: 280 }}
      placeholder={sourceKind === 'file' && sourceUrl ? sourceUrl : 'https://example.com/guide.xml.gz'}
      value={urlInput}
      onChange={(e) => setUrlInput(e.currentTarget.value)}
      onKeyDown={(e) => e.key === 'Enter' && go()}
      onFocus={handleUrlInputFocus}
      rightSection={inputControlsEl}
      rightSectionWidth={rightSectionWidth}
      rightSectionPointerEvents="all"
    />
  );
  const fileInputEl = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".xml,.gz,.xml.gz,application/xml,text/xml,application/gzip"
      onChange={handleFileChange}
      style={{ display: 'none' }}
    />
  );

  // Presets now opens on URL-field focus instead of a dedicated button (see
  // PresetsPanel's `opened`/`onOpenedChange`/`children`-as-target props).
  const urlFieldWithPresetsEl = (
    <PresetsPanel
      currentUrl={sourceKind === 'url' ? sourceUrl : null}
      onLoad={loadPreset}
      opened={presetsOpen}
      onOpenedChange={setPresetsOpen}
    >
      {urlInputEl}
    </PresetsPanel>
  );

  if (isCompact) {
    return (
      <Stack gap="xs">
        {urlFieldWithPresetsEl}
        {fileInputEl}
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      <Group align="center" gap="xs" wrap="wrap">
        {urlFieldWithPresetsEl}
      </Group>
      {fileInputEl}
    </Stack>
  );
}
