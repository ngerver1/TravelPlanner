// All dates are YYYY-MM-DD strings with UTC arithmetic (no timezone library).

export const MAX_SPAN = 400;

export function toD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export const isDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toD(s).getTime()) && fromD(toD(s)) === s;
export const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const fromD = (dt: Date) => dt.toISOString().slice(0, 10);
export function addDays(s: string, n: number): string {
  const d = toD(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fromD(d);
}
export const diffDays = (a: string, b: string) => Math.round((toD(b).getTime() - toD(a).getTime()) / 864e5);
export function range(a: string, b: string): string[] {
  const out: string[] = [];
  if (!isDate(a) || !isDate(b) || a > b) return out;
  for (let d = a, i = 0; d <= b && i <= MAX_SPAN; d = addDays(d, 1), i++) out.push(d);
  return out;
}
export const fmt = (s: string, opts: Intl.DateTimeFormatOptions) =>
  isDate(s) ? toD(s).toLocaleDateString('en-AU', { timeZone: 'UTC', ...opts }) : '—';
export const fmtShort = (s: string) => fmt(s, { day: 'numeric', month: 'short' });
export const fmtLong = (s: string) => fmt(s, { weekday: 'short', day: 'numeric', month: 'short' });
export const dow = (s: string) => toD(s).getUTCDay(); // 0 = Sun
export const todayStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

/** YYYY-MM-DD → DD/MM/YYYY ('' if not a date). */
export const fmtDMY = (s: string) => (isDate(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');

/** Mask typed digits as DD/MM/YYYY (slashes added automatically). */
export function maskDMY(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d + (text.endsWith('/') && d.length === 2 ? '/' : '');
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}` + (text.endsWith('/') && d.length === 4 ? '/' : '');
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** DD/MM/YYYY (or D/M/YYYY) → YYYY-MM-DD, or null if not a real date. */
export function parseDMY(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isDate(iso) ? iso : null;
}

/** Mask typed digits as 24-hour HH:MM. */
export function maskTime(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}
/** "930", "9:30", "0930", "09:30" → "09:30"; null if not a valid 24-hour time. */
export function parseTime(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  let h: string, m: string;
  const c = t.match(/^(\d{1,2}):(\d{2})$/);
  if (c) { h = c[1]; m = c[2]; }
  else if (/^\d{3,4}$/.test(t)) { h = t.slice(0, t.length - 2); m = t.slice(-2); }
  else return null;
  const out = `${h.padStart(2, '0')}:${m}`;
  return isTime(out) ? out : null;
}
