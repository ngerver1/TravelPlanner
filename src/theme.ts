// Light / dark / follow the phone. Stored on this device only.
export type Theme = 'system' | 'light' | 'dark';
const KEY = 'tripPlanner.theme';

export function loadTheme(): Theme {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
}
export function applyTheme(t: Theme) {
  try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* ignore */ }
  if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  syncBarColour(t);
}

// The phone's status and navigation bars take their colour from <meta name="theme-color">. Those tags
// follow the phone's light/dark setting, so when the app's own theme is forced, point both at it;
// otherwise a dark app on a light phone gets white system bars.
const BAR = { light: '#ffffff', dark: '#1b1f29' };
export function syncBarColour(t: Theme) {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const own = (m.media.includes('dark') ? 'dark' : 'light') as 'light' | 'dark';
    m.content = BAR[t === 'system' ? own : t];
  });
}
