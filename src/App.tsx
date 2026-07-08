import { lazy, Suspense, useState } from 'react';
import { AppShell, Center, Stack, Text } from '@mantine/core';
import { AppHeader } from '@swvn-dispatch/dispatch-ui-kit';
import { useEpgStore } from './state/epgStore';
import { UrlBar } from './components/UrlBar';
import { SizeWarningModal } from './components/SizeWarningModal';
import { EpgHeaderInfo } from './components/EpgHeaderInfo';
import { GuideGrid, type InspectTarget } from './components/GuideGrid';
import { Footer } from './components/Footer';

// CodeMirror + the XML language/lint packages are only needed once a user
// clicks a cell, so keep them out of the initial bundle.
const XmlInspector = lazy(() => import('./components/XmlInspector').then((m) => ({ default: m.XmlInspector })));

export function App() {
  const status = useEpgStore((s) => s.status);
  const index = useEpgStore((s) => s.index);
  const [inspectTarget, setInspectTarget] = useState<InspectTarget | null>(null);

  return (
    <AppShell header={{ height: 56 }} footer={{ height: 28 }} padding="md">
      <AppHeader
        logoUrl={`${import.meta.env.BASE_URL}logo.png`}
        appName="EPG Viewer"
        version={__COMMIT_HASH__}
        githubUrl="https://github.com/epg-guru/viewer"
      />
      <AppShell.Main style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Stack gap="sm" pt="xs" pb="sm" style={{ flexShrink: 0 }}>
          <UrlBar />
          {index && <EpgHeaderInfo index={index} />}
        </Stack>

        <div style={{ flex: 1, minHeight: 0, border: '1px solid var(--mantine-color-dark-4)', borderRadius: 8 }}>
          {status === 'ready' && index ? (
            <GuideGrid index={index} onInspect={setInspectTarget} />
          ) : (
            <Center h="100%">
              <Text c="dimmed" size="sm">
                {status === 'loading' || status === 'checking'
                  ? 'Loading…'
                  : 'Paste an XMLTV URL above to load a guide.'}
              </Text>
            </Center>
          )}
        </div>
      </AppShell.Main>

      <AppShell.Footer>
        <Footer />
      </AppShell.Footer>

      <SizeWarningModal />
      {inspectTarget && (
        <Suspense fallback={null}>
          <XmlInspector target={inspectTarget} onClose={() => setInspectTarget(null)} />
        </Suspense>
      )}
    </AppShell>
  );
}
