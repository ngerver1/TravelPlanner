// Money: amounts with a currency, conversion to the trip's home currency, and the cost report.
import type { Item, Money, Rates, Stay, TripDoc, Flight, Status } from './types';
import { MEALS } from './constants';

export const CURRENCIES = ['AUD', 'HKD', 'JPY', 'USD', 'EUR', 'GBP', 'NZD', 'SGD', 'CNY', 'KRW', 'TWD', 'THB', 'MYR', 'IDR', 'PHP', 'INR', 'CAD', 'CHF'];
const SYMBOL: Record<string, string> = {
  AUD: 'A$', HKD: 'HK$', JPY: '¥', USD: 'US$', EUR: '€', GBP: '£', NZD: 'NZ$', SGD: 'S$', CNY: 'CN¥', KRW: '₩', TWD: 'NT$', THB: '฿', CAD: 'C$',
};
const ZERO_DECIMALS = new Set(['JPY', 'KRW', 'IDR', 'TWD']);

export const isCurrency = (c: unknown): c is string => typeof c === 'string' && /^[A-Z]{3}$/.test(c);

export function fmtMoney(amount: number, currency: string, opts: { round?: boolean } = {}): string {
  const whole = opts.round || ZERO_DECIMALS.has(currency) || Number.isInteger(amount);
  const n = new Intl.NumberFormat('en-AU', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(whole ? Math.round(amount) : amount);
  const sym = SYMBOL[currency];
  return sym ? `${sym}${n}` : `${currency} ${n}`;
}
export const fmtPrice = (m: Money) => fmtMoney(m.amount, m.currency) + (m.perPerson ? ' pp' : '');

/** Read an old free-text cost ("HK$4,200", "¥3,000 pp", "120 AUD", "$80") into Money. `$` alone = home currency. */
export function parseCost(text: string, home: string): Money | null {
  const t = text.trim();
  const num = t.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/(\d+(?:\.\d+)?)\s*(k)?\b/i);
  if (!num) return null;
  const amount = Number(num[1]) * (num[2] ? 1000 : 1);
  if (!isFinite(amount)) return null;
  const code = t.toUpperCase().match(/\b(AUD|HKD|JPY|USD|EUR|GBP|NZD|SGD|CNY|RMB|KRW|TWD|THB|MYR|IDR|PHP|INR|CAD|CHF)\b/);
  let currency: string | undefined = code ? (code[1] === 'RMB' ? 'CNY' : code[1]) : undefined;
  if (!currency) {
    if (/HK\$/i.test(t)) currency = 'HKD';
    else if (/A\$|AU\$/i.test(t)) currency = 'AUD';
    else if (/US\$/i.test(t)) currency = 'USD';
    else if (/NZ\$/i.test(t)) currency = 'NZD';
    else if (/S\$/.test(t)) currency = 'SGD';
    else if (/NT\$/i.test(t)) currency = 'TWD';
    else if (/CN¥|元/.test(t)) currency = 'CNY';
    else if (/¥|円|\byen\b/i.test(t)) currency = 'JPY';
    else if (/€/.test(t)) currency = 'EUR';
    else if (/£/.test(t)) currency = 'GBP';
    else if (/₩/.test(t)) currency = 'KRW';
    else if (/฿/.test(t)) currency = 'THB';
    else currency = home;
  }
  const out: Money = { amount, currency };
  if (/\b(pp|p\/p|per person|each|pax)\b/i.test(t)) out.perPerson = true;
  return out;
}

/** Amount in the home currency, or null if there's no rate for that currency yet. */
export function toHome(m: Money, home: string, rates: Rates | undefined, people = 1): number | null {
  const total = m.amount * (m.perPerson ? Math.max(1, people) : 1);
  if (m.currency === home) return total;
  if (!rates || rates.base !== home) return null;
  const r = rates.rates[m.currency];
  return r && r > 0 ? total / r : null;
}

// ---------- report ----------
export type CostKind = 'stay' | 'flight' | 'activity' | 'food';
export const KIND_LABEL: Record<CostKind, string> = { stay: 'Stays', flight: 'Flights', activity: 'Things to do', food: 'Food' };

export interface CostLine {
  kind: CostKind; id: string; title: string; date: string; locationId?: string; status: Status;
  price: Money; times: number; home: number | null; // times: e.g. a restaurant picked on 2 days
  ref: { type: 'stay'; stay: Stay } | { type: 'flight'; flight: Flight } | { type: 'item'; item: Item; pi: number };
}
export interface CostReport {
  home: string; people: number;
  lines: CostLine[];                 // counted in the total
  ideas: CostLine[];                 // ideas not on a day (not counted)
  total: number; unconverted: string[];
  byStatus: Record<Status, number>;
  byKind: Record<CostKind, number>;
  byLocation: Map<string, number>;   // '' = no location (e.g. flights)
  missing: { kind: CostKind; title: string; ref: CostLine['ref'] }[];
}

/** Does a restaurant placement count? When it's the pick for that meal, or the only option. */
function mealCounts(doc: TripDoc, it: Item, pi: number): boolean {
  const p = it.placements[pi];
  if (!p?.meal) return false;
  if (p.chosen) return true;
  const others = doc.items.filter((o) => o.kind === 'restaurant' && o.placements.some((q) => q.date === p.date && q.meal === p.meal)).length;
  return others === 1;
}

export function costReport(doc: TripDoc): CostReport {
  const home = doc.trip.currency || 'AUD';
  const people = doc.trip.people || 1;
  const rates = doc.rates;
  const lines: CostLine[] = [], ideas: CostLine[] = [], missing: CostReport['missing'] = [];
  const add = (list: CostLine[], l: Omit<CostLine, 'home'>) => {
    const one = toHome(l.price, home, rates, people);
    list.push({ ...l, home: one == null ? null : one * l.times });
  };
  for (const s of doc.stays) {
    if (s.price) add(lines, { kind: 'stay', id: s.id, title: s.name || 'Stay', date: s.checkIn, locationId: s.locationId, status: s.status, price: s.price, times: 1, ref: { type: 'stay', stay: s } });
    else missing.push({ kind: 'stay', title: s.name || 'Stay', ref: { type: 'stay', stay: s } });
  }
  for (const f of doc.flights) {
    const title = `${f.flightNo || f.airline || 'Flight'} ${f.from}→${f.to}`;
    if (f.price) add(lines, { kind: 'flight', id: f.id, title, date: f.depDate, status: f.status, price: f.price, times: 1, ref: { type: 'flight', flight: f } });
    else missing.push({ kind: 'flight', title, ref: { type: 'flight', flight: f } });
  }
  for (const it of doc.items) {
    const kind: CostKind = it.kind === 'restaurant' ? 'food' : 'activity';
    const counted = it.kind === 'activity' ? (it.placements.length ? [0] : []) : it.placements.map((_, i) => i).filter((i) => mealCounts(doc, it, i));
    const first = counted[0] ?? -1;
    const date = first >= 0 ? it.placements[first].date : '';
    if (!it.price) { if (counted.length) missing.push({ kind, title: it.title, ref: { type: 'item', item: it, pi: first } }); continue; }
    const base = { kind, id: it.id, title: it.title, date, locationId: it.locationId, status: it.status, price: it.price, ref: { type: 'item' as const, item: it, pi: first } };
    if (counted.length) add(lines, { ...base, times: counted.length });
    else if (it.kind === 'activity' || !it.placements.length) add(ideas, { ...base, times: 1 });
  }
  lines.sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.title.localeCompare(b.title));
  const byStatus: Record<Status, number> = { booked: 0, planned: 0, idea: 0 };
  const byKind: Record<CostKind, number> = { stay: 0, flight: 0, activity: 0, food: 0 };
  const byLocation = new Map<string, number>();
  const unconverted = new Set<string>();
  let total = 0;
  for (const l of lines) {
    if (l.home == null) { unconverted.add(l.price.currency); continue; }
    total += l.home; byStatus[l.status] += l.home; byKind[l.kind] += l.home;
    byLocation.set(l.locationId || '', (byLocation.get(l.locationId || '') || 0) + l.home);
  }
  return { home, people, lines, ideas, total, unconverted: [...unconverted], byStatus, byKind, byLocation, missing };
}

/** Currencies used anywhere in the trip (besides home). */
export function usedCurrencies(doc: TripDoc): string[] {
  const s = new Set<string>();
  for (const x of [...doc.stays, ...doc.flights, ...doc.items]) if (x.price) s.add(x.price.currency);
  s.delete(doc.trip.currency || 'AUD');
  return [...s].sort();
}

export function costsCsv(r: CostReport, locName: (id?: string) => string): string {
  const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [['Date', 'Type', 'Title', 'Location', 'Status', 'Amount', 'Currency', 'Per person', 'Times', `Total (${r.home})`]];
  for (const l of r.lines) rows.push([l.date, KIND_LABEL[l.kind], l.title, locName(l.locationId), l.status, String(l.price.amount), l.price.currency, l.price.perPerson ? 'yes' : '', String(l.times), l.home == null ? '' : l.home.toFixed(2)]);
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}
export const MEAL_KEYS = MEALS;
