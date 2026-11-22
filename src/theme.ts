// Light / dark / follow the phone. Stored on this device only.
export type Theme = 'system' | 'light' | 'dark';
const KEY = 'tripPlanner.theme';

export function loadTheme(): Theme {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
}
export function applyTheme(t: Theme) {
  try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* ignore */ }
  if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}
