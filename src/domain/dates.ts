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
