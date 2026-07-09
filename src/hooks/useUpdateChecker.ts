import { useCallback, useEffect, useState } from 'react';

/** Manual "check for updates" trigger. Relies on the service worker's
 * skipWaiting()/clients.claim() (see public/sw.js) so that once an update
 * is found, it activates and reloads automatically. */
export function useUpdateChecker() {
  const [checking, setChecking] = useState(false);

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
    setChecking(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        window.location.reload();
        return;
      }
      await reg.update();
    } finally {
      setChecking(false);
    }
  }, []);

  return { checking, checkForUpdates };
}
