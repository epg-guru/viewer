import { useCallback, useEffect, useState } from 'react';
import { Group, Text, UnstyledButton, Loader } from '@mantine/core';

type CheckStatus = 'idle' | 'checking' | 'up-to-date' | 'failed';

/** Commit-hash pill doubling as a manual "check for updates" button. Relies
 * on the service worker's skipWaiting()/clients.claim() (see public/sw.js)
 * so that once an update is found, it activates and reloads automatically. */
export function Footer() {
  const [status, setStatus] = useState<CheckStatus>('idle');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      window.location.reload();
      return;
    }
    setStatus('checking');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        window.location.reload();
        return;
      }
      await reg.update();
      setStatus('up-to-date');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('failed');
      setTimeout(() => setStatus('idle'), 2500);
    }
  }, []);

  const label =
    status === 'checking'
      ? 'checking…'
      : status === 'up-to-date'
        ? 'up to date'
        : status === 'failed'
          ? 'check failed'
          : __COMMIT_HASH__;

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      <Text size="xs" c="dimmed">
        EPG Viewer
      </Text>
      <UnstyledButton onClick={checkForUpdates}>
        <Group gap={4} wrap="nowrap">
          {status === 'checking' && <Loader size={10} />}
          <Text size="xs" c="dimmed">
            {label} · {__BUILD_DATE__}
          </Text>
        </Group>
      </UnstyledButton>
    </Group>
  );
}
