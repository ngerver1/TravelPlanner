// The "Today" screen: one day as a list in time order, tonight's stay, and what still needs sorting out.
// Plain data from the trip; nothing is fetched, so it works offline.
import { addDays, diffDays } from './dates';
import type { Derived } from './derive';
import { dayStops } from './plan';
import type { Flight, Item, Placement, Stay, TransportLeg, TripDoc } from './types';

/** Rough times for plans without one, so they sit in a sensible place in the day. */
const GUESS: Record<string, string> = { breakfast: '08:00', morning: '09:30', lunch: '12:30', afternoon: '14:30', dinner: '19:00', evening: '20:30' };

export type AgendaRow =
  | { kind: 'flight'; at: 'dep' | 'arr'; time: string; approx: boolean; flight: Flight }
  | { kind: 'leg'; at: 'dep' | 'arr'; time: string; approx: boolean; leg: TransportLeg }
  | { kind: 'stay'; at: 'in' | 'out'; time: string; approx: boolean; stay: Stay }
  | { kind: 'item'; time: string; approx: boolean; item: Item; placement: Placement; pi: number };

const mins = (t: string) => { const m = t.match(/^(\d{2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : 24 * 60; };
/** The row's place in the day (minutes from midnight; "any time" plans go last). */
export const rowMinutes = (r: AgendaRow) => mins(r.time);

/** Everything happening on a day, earliest first. Plans without a time use their slot or meal's usual time. */
export function agenda(doc: TripDoc, dv: Derived, date: string): AgendaRow[] {
  const x = dv.info[date];
  if (!x) return [];
  const rows: AgendaRow[] = [];
  for (const f of x.arr) rows.push({ kind: 'flight', at: 'arr', time: f.arrTime, approx: !f.arrTime, flight: f });
  for (const f of x.dep) rows.push({ kind: 'flight', at: 'dep', time: f.depTime, approx: !f.depTime, flight: f });
  for (const l of x.legArr) rows.push({ kind: 'leg', at: 'arr', time: l.arrTime, approx: !l.arrTime, leg: l });
  for (const l of x.legDep) rows.push({ kind: 'leg', at: 'dep', time: l.depTime, approx: !l.depTime, leg: l });
  for (const s of x.checkOuts) rows.push({ kind: 'stay', at: 'out', time: s.checkOutTime || '10:00', approx: !s.checkOutTime, stay: s });
  for (const s of x.checkIns) rows.push({ kind: 'stay', at: 'in', time: s.checkInTime || '15:00', approx: !s.checkInTime, stay: s });
  for (const e of dayStops(doc, date)) {
    const key = e.placement.meal || e.placement.slot || '';
    rows.push({ kind: 'item', time: e.placement.time || GUESS[key] || '', approx: !e.placement.time, item: e.item, placement: e.placement, pi: e.pi });
  }
  // Same time keeps the order above (flights in, check-out, plans in day order...).
  return rows.map((r, i) => ({ r, i })).sort((a, b) => rowMinutes(a.r) - rowMinutes(b.r) || a.i - b.i).map(({ r }) => r);
}

export interface Problem { date: string; text: string; kind: 'nostay' | 'notransport' | 'unbooked'; ref?: Stay | Flight | TransportLeg }

/** What still needs sorting out on a day: no stay, no transport, bookings not booked yet. */
export function problems(dv: Derived, date: string): Problem[] {
  const x = dv.info[date];
  if (!x) return [];
  const out: Problem[] = [];
  if (x.night.kind === 'none') out.push({ date, kind: 'nostay', text: `No stay for the night${x.loc ? ` in ${(x.loc.b ?? x.loc.a).name}` : ''}` });
  if (x.noTransport) out.push({ date, kind: 'notransport', text: `No transport booked${x.loc ? ` to ${(x.loc.b ?? x.loc.a).name}` : ''}` });
  for (const s of x.checkIns) if (s.status !== 'booked') out.push({ date, kind: 'unbooked', text: `${s.name || 'Stay'} isn’t booked yet`, ref: s });
  for (const f of x.dep) if (f.status !== 'booked') out.push({ date, kind: 'unbooked', text: `Flight ${f.flightNo || `${f.from}→${f.to}`} isn’t booked yet`, ref: f });
  for (const l of x.legDep) if (l.status !== 'booked') out.push({ date, kind: 'unbooked', text: `${l.operator || 'Transport'} isn’t booked yet`, ref: l });
  return out;
}

export type Phase = { kind: 'none' } | { kind: 'before'; days: number } | { kind: 'during'; day: number } | { kind: 'after' };
/** Where today sits against the trip dates. */
export function phase(dv: Derived, today: string): Phase {
  const first = dv.dates[0], last = dv.dates[dv.dates.length - 1];
  if (!first) return { kind: 'none' };
  if (today < first) return { kind: 'before', days: diffDays(today, first) };
  if (today > last) return { kind: 'after' };
  return { kind: 'during', day: dv.dates.indexOf(today) + 1 };
}

/** Before the trip: every booking not booked yet, and every night or move with nothing arranged. */
export function stillToBook(doc: TripDoc, dv: Derived): Problem[] {
  const out: Problem[] = [];
  for (const d of dv.dates) {
    const x = dv.info[d];
    if (x.night.kind === 'none') out.push({ date: d, kind: 'nostay', text: 'No stay' });
    if (x.noTransport) out.push({ date: d, kind: 'notransport', text: `No transport${x.loc ? ` to ${(x.loc.b ?? x.loc.a).name}` : ''}` });
  }
  for (const s of doc.stays) if (s.status !== 'booked' && s.checkIn) out.push({ date: s.checkIn, kind: 'unbooked', text: s.name || 'Stay', ref: s });
  for (const f of doc.flights) if (f.status !== 'booked' && f.depDate) out.push({ date: f.depDate, kind: 'unbooked', text: `Flight ${f.flightNo || `${f.from}→${f.to}`}`, ref: f });
  for (const l of doc.legs) if (l.status !== 'booked' && l.date) out.push({ date: l.date, kind: 'unbooked', text: l.operator || 'Transport', ref: l });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** After the trip: a few totals. */
export function summary(doc: TripDoc, dv: Derived) {
  const places = new Set(dv.dates.map((d) => dv.info[d].endLoc?.name).filter(Boolean));
  return { days: dv.dates.length, places: [...places] as string[], stays: doc.stays.length, flights: doc.flights.length, plans: doc.items.filter((i) => i.placements.length).length };
}

/** The day after (for "Tomorrow"), if it's still in the trip. */
export const nextDay = (dv: Derived, d: string) => (dv.info[addDays(d, 1)] ? addDays(d, 1) : undefined);
