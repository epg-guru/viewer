import { lazy, Suspense, useEffect, useState } from 'react';
import { AppShell, Center, Stack, Group, Text, Button } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCalendarTime } from '@tabler/icons-react';
import { AppHeader } from '@swvn-dispatch/dispatch-ui-kit';
import { useEpgStore } from './state/epgStore';
import { SourceBar } from './components/SourceBar';
import { EmptyState } from './components/EmptyState';
import { EpgHeaderInfo } from './components/EpgHeaderInfo';
import { GuideGrid, type InspectTarget } from './components/GuideGrid';
import { ProgressModal } from './components/ProgressModal';
import { SettingsMenu } from './components/SettingsMenu';
import { SearchBox } from './components/SearchBox';
import { DateJumpSelect } from './components/DateJumpSelect';

// CodeMirror + the XML language/lint packages (pulled in by both modals via
// the shared XmlSourceSection) are only needed once a user clicks a cell, so
// keep them out of the initial bundle.
const ChannelModal = lazy(() => import('./components/inspector/ChannelModal').then((m) => ({ default: m.ChannelModal })));
const ProgrammeModal = lazy(() =>
  import('./components/inspector/ProgrammeModal').then((m) => ({ default: m.ProgrammeModal })),
);

export function App() {
  const status = useEpgStore((s) => s.status);
  const index = useEpgStore((s) => s.index);
  const sourceUrl = useEpgStore((s) => s.sourceUrl);
  const sourceKind = useEpgStore((s) => s.sourceKind);
  const [inspectTarget, setInspectTarget] = useState<InspectTarget | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery] = useDebouncedValue(searchInput, 200);
  const [jumpSignal, setJumpSignal] = useState(0);
  const [jumpTargetMs, setJumpTargetMs] = useState<number | null>(null);

  function jumpToNow(): void {
    setJumpTargetMs(null);
    setJumpSignal((n) => n + 1);
  }

  function jumpToDate(ms: number): void {
    setJumpTargetMs(ms);
    setJumpSignal((n) => n + 1);
  }

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
    <AppShell header={{ height: 56 }} padding="md">
      <AppHeader
        logoUrl={`${import.meta.env.BASE_URL}logo.png`}
        appName="EPG Viewer"
        version={`${__COMMIT_HASH__} · ${__BUILD_DATE__}`}
        githubUrl="https://github.com/epg-guru/viewer"
        kofiUrl={null}
        extra={<SettingsMenu />}
      />
      <AppShell.Main style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - var(--app-shell-header-height))' }}>
        <Stack gap="sm" pb="sm" style={{ flexShrink: 0 }}>
          <SourceBar />
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
              <Group gap="xs" wrap="wrap">
                <Button variant="default" size="sm" leftSection={<IconCalendarTime size={16} />} onClick={jumpToNow}>
                  Now
                </Button>
                <DateJumpSelect index={index} onSelect={jumpToDate} />
              </Group>
              <SearchBox value={searchInput} onChange={setSearchInput} />
            </Group>
          )}
          <div style={{ flex: 1, minHeight: 0 }}>
            {status === 'ready' && index ? (
              <GuideGrid
                index={index}
                onInspect={setInspectTarget}
                searchQuery={searchQuery.trim()}
                jumpSignal={jumpSignal}
                jumpTargetMs={jumpTargetMs}
              />
            ) : status === 'loading' ? (
              <Center h="100%">
                <Text c="dimmed" size="sm">
                  Loading…
                </Text>
              </Center>
            ) : (
              <EmptyState />
            )}
          </div>
          {status === 'ready' && index && (
            <Group
              justify="flex-end"
              align="center"
              wrap="nowrap"
              gap="sm"
              px="sm"
              py={4}
              style={{
                flexShrink: 0,
                background: 'var(--mantine-color-dark-6)',
                borderTop: '1px solid var(--mantine-color-dark-4)',
                overflow: 'hidden',
              }}
            >
              <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
                <EpgHeaderInfo index={index} />
              </div>
            </Group>
          )}
        </div>
      </AppShell.Main>

      <ProgressModal />
      {inspectTarget && (
        <Suspense fallback={null}>
          {inspectTarget.kind === 'channel' ? (
            <ChannelModal channel={inspectTarget.channel} onClose={() => setInspectTarget(null)} />
          ) : (
            <ProgrammeModal
              programme={inspectTarget.programme}
              channelName={inspectTarget.channelName}
              channelIcon={inspectTarget.channelIcon}
              onClose={() => setInspectTarget(null)}
            />
          )}
        </Suspense>
      )}
    </AppShell>
  );
}
