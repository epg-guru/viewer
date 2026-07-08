import { lazy, Suspense, useEffect, useState } from 'react';
import { AppShell, Center, Stack, Group, Text, Button } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSettings, IconCalendarTime } from '@tabler/icons-react';
import { AppHeader } from '@swvn-dispatch/dispatch-ui-kit';
import { useEpgStore } from './state/epgStore';
import { SourceBar } from './components/SourceBar';
import { EmptyState } from './components/EmptyState';
import { SizeWarningModal } from './components/SizeWarningModal';
import { EpgHeaderInfo } from './components/EpgHeaderInfo';
import { GuideGrid, type InspectTarget } from './components/GuideGrid';
import { Footer } from './components/Footer';
import { StatusArea } from './components/StatusArea';
import { SettingsMenu } from './components/SettingsMenu';
import { SearchBox } from './components/SearchBox';

// CodeMirror + the XML language/lint packages are only needed once a user
// clicks a cell, so keep them out of the initial bundle.
const XmlInspector = lazy(() => import('./components/XmlInspector').then((m) => ({ default: m.XmlInspector })));

export function App() {
  const status = useEpgStore((s) => s.status);
  const index = useEpgStore((s) => s.index);
  const sourceUrl = useEpgStore((s) => s.sourceUrl);
  const sourceKind = useEpgStore((s) => s.sourceKind);
  const [inspectTarget, setInspectTarget] = useState<InspectTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery] = useDebouncedValue(searchInput, 200);
  const [jumpToNowSignal, setJumpToNowSignal] = useState(0);

  // Keep ?url= in sync with whatever's actually loaded, regardless of which
  // source-mode control is currently shown.
  useEffect(() => {
    if (status !== 'ready') return;
    const params = new URLSearchParams(window.location.search);
    if (sourceKind === 'url' && sourceUrl) {
      if (params.get('url') !== sourceUrl) {
        params.set('url', sourceUrl);
        window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
      }
    } else if (sourceKind === 'file' && params.has('url')) {
      params.delete('url');
      const rest = params.toString();
      window.history.replaceState(null, '', rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
    }
  }, [status, sourceKind, sourceUrl]);

  return (
    <AppShell header={{ height: 56 }} footer={{ height: 28 }} padding="md">
      <AppHeader
        logoUrl={`${import.meta.env.BASE_URL}logo.png`}
        appName="EPG Viewer"
        version={__COMMIT_HASH__}
        githubUrl="https://github.com/epg-guru/viewer"
        kofiUrl={null}
        actions={[
          { key: 'settings', label: 'Settings', icon: IconSettings, onClick: () => setSettingsOpen(true) },
        ]}
      />
      <AppShell.Main style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Stack gap="sm" pt="xs" pb="sm" style={{ flexShrink: 0 }}>
          <SourceBar />
          <StatusArea />
          {index && <EpgHeaderInfo index={index} />}
        </Stack>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            border: '1px solid var(--mantine-color-dark-4)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {status === 'ready' && index && (
            <Group
              justify="space-between"
              align="center"
              wrap="wrap"
              gap="sm"
              px="sm"
              py={6}
              style={{
                flexShrink: 0,
                background: 'var(--mantine-color-dark-6)',
                borderBottom: '1px solid var(--mantine-color-dark-4)',
              }}
            >
              <Button
                variant="default"
                size="sm"
                leftSection={<IconCalendarTime size={16} />}
                onClick={() => setJumpToNowSignal((n) => n + 1)}
              >
                Today
              </Button>
              <SearchBox value={searchInput} onChange={setSearchInput} />
            </Group>
          )}
          <div style={{ flex: 1, minHeight: 0 }}>
            {status === 'ready' && index ? (
              <GuideGrid
                index={index}
                onInspect={setInspectTarget}
                searchQuery={searchQuery.trim()}
                jumpToNowSignal={jumpToNowSignal}
              />
            ) : status === 'loading' || status === 'checking' ? (
              <Center h="100%">
                <Text c="dimmed" size="sm">
                  Loading…
                </Text>
              </Center>
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </AppShell.Main>

      <AppShell.Footer>
        <Footer />
      </AppShell.Footer>

      <SizeWarningModal />
      <SettingsMenu opened={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {inspectTarget && (
        <Suspense fallback={null}>
          <XmlInspector target={inspectTarget} onClose={() => setInspectTarget(null)} />
        </Suspense>
      )}
    </AppShell>
  );
}
