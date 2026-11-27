// Reading dates and times written the many ways booking emails write them.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const pad = (n: number) => String(n).padStart(2, '0');
const valid = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** Context for dates without a year: the trip's dates, and when the email arrived. */
export interface DateContext { tripStart?: string; tripEnd?: string; received?: string }

/** Pick a year for a day and month: inside the trip if it fits, else the next one on/after the email's date. */
function withYear(m: number, d: number, ctx: DateContext): string | null {
  const years = new Set<number>();
  for (const s of [ctx.tripStart, ctx.tripEnd, ctx.received]) if (s) years.add(Number(s.slice(0, 4)));
  if (!years.size) years.add(new Date().getUTCFullYear());
  for (const y of [...years].sort()) {
    const iso = valid(y, m, d);
    if (iso && ctx.tripStart && ctx.tripEnd && iso >= ctx.tripStart && iso <= ctx.tripEnd) return iso;
  }
  const after = (ctx.received || ctx.tripStart || '').slice(0, 10);
  const base = Number((after || String(new Date().getUTCFullYear())).slice(0, 4));
  for (const y of [base, base + 1]) {
    const iso = valid(y, m, d);
    if (iso && (!after || iso >= after)) return iso;
  }
  return valid(base, m, d);
}

const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/**
 * "2027-01-26", "2027/1/26", "26/01/2027" (day first), "26.01.27", "26 Jan 2027", "Tue, 26 January 2027",
 * "Jan 26, 2027", "January 26", "26 Jan", "2027年1月26日", "1月26日". Returns YYYY-MM-DD or undefined.
 */
export function looseDate(input: unknown, ctx: DateContext = {}): string | undefined {
  if (typeof input !== 'string' && typeof input !== 'number') return undefined;
  const s = String(input).trim().toLowerCase();
  if (!s) return undefined;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/))) return valid(+m[1], +m[2], +m[3]) ?? undefined;
  if ((m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/))) return withYear(+m[1], +m[2], ctx) ?? undefined;
  if ((m = s.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/))) return valid(+m[1], +m[2], +m[3]) ?? undefined;
  if ((m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) {
    const a = +m[1], b = +m[2], y = fullYear(+m[3]);
    return (a > 12 ? valid(y, b, a) : b > 12 ? valid(y, a, b) : valid(y, b, a)) ?? undefined; // day first unless impossible
  }
  const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?';
  if ((m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${mon}(?:,?\\s+(\\d{2,4}))?`)))) {
    const d = +m[1], mo = MONTHS[m[2]];
    return (m[3] ? valid(fullYear(+m[3]), mo, d) : withYear(mo, d, ctx)) ?? undefined;
  }
  if ((m = s.match(new RegExp(`\\b${mon}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{2,4}))?`)))) {
    const mo = MONTHS[m[1]], d = +m[2];
    return (m[3] ? valid(fullYear(+m[3]), mo, d) : withYear(mo, d, ctx)) ?? undefined;
  }
  return undefined;
}

/** "16:05", "4:05 PM", "4.05pm", "4pm", "1605", "16h05", "16時05分", "noon". Returns HH:MM or undefined. */
export function looseTime(input: unknown): string | undefined {
  if (typeof input !== 'string' && typeof input !== 'number') return undefined;
  const s = String(input).trim().toLowerCase();
  if (!s) return undefined;
  if (/\bnoon\b|12\s*noon/.test(s)) return '12:00';
  if (/\bmidnight\b/.test(s)) return '00:00';
  let m = s.match(/\b(\d{1,2})\s*(?:[:.h時]\s*(\d{2})\s*分?)?\s*(a\.?m\.?|p\.?m\.?)?(?![\d])/);
  const t = s.match(/^(\d{2})(\d{2})$/);
  if (t) m = [s, t[1], t[2], undefined] as unknown as RegExpMatchArray;
  if (!m || (m[2] == null && !m[3])) return undefined; // a bare number isn't a time
  let h = +m[1];
  const min = m[2] != null ? +m[2] : 0;
  const ap = m[3]?.replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return undefined;
  return `${pad(h)}:${pad(min)}`;
}
