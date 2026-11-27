// Installable / offline app: registers the service worker, offers updates, and tracks being online.
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** "Update available": a new version has been downloaded and is waiting. update() switches to it and reloads. */
export function useAppUpdate() {
  const { needRefresh: [updateAvailable, setUpdateAvailable], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Look for a new version when the app comes back to the front, and hourly while open.
      const check = () => { if (navigator.onLine) reg.update().catch(() => undefined); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      setInterval(check, 60 * 60 * 1000);
    },
  });
  return { updateAvailable, update: () => updateServiceWorker(true), dismiss: () => setUpdateAvailable(false) };
}

/** Whether the device thinks it's online (maps and place search need it). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
