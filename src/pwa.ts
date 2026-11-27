// Installable / offline app: registers the service worker, offers updates, and tracks being online.
import { useEffect, useRef, useState } from 'react';

declare const __APP_VERSION__: string;
/** When this version was built (and its commit). */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** "Update available": a new version has been downloaded and is waiting. update() switches to it and reloads. */
export function useAppUpdate() {
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const { needRefresh: [updateAvailable, setUpdateAvailable], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      regRef.current = reg;
      // Look for a new version when the app comes back to the front, and hourly while open.
      const check = () => { if (navigator.onLine) reg.update().catch(() => undefined); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      setInterval(check, 60 * 60 * 1000);
    },
  });
  /** Settings → Check for updates: asks the site for a newer version now. */
  const check = async (): Promise<'found' | 'latest' | 'offline' | 'unsupported'> => {
    const reg = regRef.current;
    if (!navigator.onLine) return 'offline';
    if (!reg) return 'unsupported';
    try { await reg.update(); } catch { return 'offline'; }
    if (reg.waiting || reg.installing) { setUpdateAvailable(true); return 'found'; }
    return 'latest';
  };
  return { updateAvailable, update: () => updateServiceWorker(true), dismiss: () => setUpdateAvailable(false), check };
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
