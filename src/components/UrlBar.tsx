import { useEffect, useRef, useState } from 'react';
import { TextInput, Button, Group, Text } from '@mantine/core';
import { IconPlayerPlay, IconRefresh, IconUpload } from '@tabler/icons-react';
import { useEpgStore } from '../state/epgStore';
import { PresetsPanel } from './PresetsPanel';
import { SettingsMenu } from './SettingsMenu';

export function UrlBar() {
  const status = useEpgStore((s) => s.status);
  const sourceUrl = useEpgStore((s) => s.sourceUrl);
  const sourceKind = useEpgStore((s) => s.sourceKind);
  const error = useEpgStore((s) => s.error);
  const progress = useEpgStore((s) => s.progress);
  const requestLoad = useEpgStore((s) => s.requestLoad);
  const requestLoadFile = useEpgStore((s) => s.requestLoadFile);
  const [input, setInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-load ?url= on first mount only — a shared/bookmarked link should
  // just work without the user re-pasting it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromParam = params.get('url');
    if (fromParam) {
      setInput(fromParam);
      void requestLoad(fromParam);
    }
    // Intentionally empty deps — this is a one-time initial-load effect.
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    const params = new URLSearchParams(window.location.search);
    if (sourceKind === 'url' && sourceUrl) {
      if (params.get('url') !== sourceUrl) {
        params.set('url', sourceUrl);
        window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
      }
    } else if (sourceKind === 'file' && params.has('url')) {
      // A file was loaded on top of a previous ?url= source — the address
      // bar shouldn't keep pointing at a URL that's no longer what's shown.
      params.delete('url');
      const rest = params.toString();
      window.history.replaceState(null, '', rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
    }
  }, [status, sourceKind, sourceUrl]);

  function go(): void {
    if (!input.trim()) return;
    void requestLoad(input.trim());
  }

  function refresh(): void {
    const target = sourceUrl ?? input.trim();
    if (target) void requestLoad(target);
  }

  function loadPreset(url: string): void {
    setInput(url);
    void requestLoad(url);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) requestLoadFile(file);
    e.target.value = '';
  }

  const isRefresh = sourceKind === 'url' && Boolean(input.trim()) && input.trim() === sourceUrl;
  const busy = status === 'checking' || status === 'loading';

  return (
    <Group align="flex-end" gap="xs" wrap="wrap">
      <TextInput
        style={{ flex: 1, minWidth: 280 }}
        label="XMLTV guide URL"
        placeholder="https://example.com/guide.xml.gz"
        value={input}
        onChange={(e) => setInput(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()}
      />
      <Button
        onClick={isRefresh ? refresh : go}
        loading={busy}
        leftSection={isRefresh ? <IconRefresh size={16} /> : <IconPlayerPlay size={16} />}
      >
        {isRefresh ? 'Refresh' : 'Go'}
      </Button>
      <Button variant="default" leftSection={<IconUpload size={16} />} onClick={() => fileInputRef.current?.click()}>
        Upload
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml,.gz,.xml.gz,application/xml,text/xml,application/gzip"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <PresetsPanel currentUrl={sourceKind === 'url' ? sourceUrl : null} onLoad={loadPreset} />
      <SettingsMenu />
      {sourceKind === 'file' && sourceUrl && status === 'ready' && (
        <Text size="sm" c="dimmed">
          Loaded from file: {sourceUrl}
        </Text>
      )}
      {status === 'checking' && (
        <Text size="sm" c="dimmed">
          Checking source…
        </Text>
      )}
      {status === 'loading' && progress && (
        <Text size="sm" c="dimmed">
          {(progress.bytesDownloaded / (1024 * 1024)).toFixed(1)} MB downloaded
          {progress.totalBytes ? ` / ${(progress.totalBytes / (1024 * 1024)).toFixed(0)} MB` : ''}
          {' · '}
          {progress.channelsSeen.toLocaleString()} channels, {progress.programmesSeen.toLocaleString()} programmes indexed
        </Text>
      )}
      {status === 'error' && error && (
        <Text size="sm" c="red">
          {error.message}
        </Text>
      )}
    </Group>
  );
}
