// Bookings read from forwarded emails. The email Worker (email-worker/) writes them to inbox.json in the
// trip's Gist; the app shows them for review (Add / Update existing / Dismiss). Nothing goes straight in.
import type { Money, TripDoc } from './types';

export type BookingType = 'flight' | 'stay' | 'transport' | 'restaurant' | 'activity';

/** One booking found in an email. All fields optional except type: emails vary. Dates YYYY-MM-DD, times HH:MM (local). */
export interface Booking {
  type: BookingType;
  conf?: string;
  price?: Money;
  // flight
  airline?: string; flightNo?: string; from?: string; to?: string;
  depDate?: string; depTime?: string; arrDate?: string; arrTime?: string;
  // stay / restaurant / activity
  name?: string; address?: string; city?: string;
  checkIn?: string; checkOut?: string; checkInTime?: string; checkOutTime?: string;
  date?: string; time?: string; partySize?: number;
  // transport
  mode?: 'train' | 'bus' | 'ferry' | 'car' | 'transfer' | 'other'; operator?: string; fromName?: string; toName?: string;
  notes?: string;
}

export interface InboxEntry {
  id: string;
  receivedAt: string;           // ISO
  subject: string;
  sender: string;               // the original sender (e.g. the airline), not your address
  source: 'markup' | 'ai' | 'none';
  bookings: Booking[];
  /** Plain text of the email (trimmed), so anything not read can be filled in by hand. */
  text: string;
  note?: string;                // e.g. why nothing was read
}

// ---------- reading schema.org booking markup (JSON-LD) ----------
type J = Record<string, unknown>;
const o = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const typeOf = (v: J): string[] => ([] as unknown[]).concat(v['@type'] ?? []).map(s);
/** "2027-01-28T16:05:00+09:00" → date and local time as written (no timezone conversion: times stay local). */
export function splitIso(v: unknown): { date?: string; time?: string } {
  const m = s(v).match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  return m ? { date: m[1], ...(m[2] ? { time: m[2] } : {}) } : {};
}
const money = (r: J): Money | undefined => {
  const amount = Number(s(r.totalPrice || r.price).replace(/[^\d.]/g, ''));
  const currency = s(r.priceCurrency).toUpperCase();
  return amount > 0 && /^[A-Z]{3}$/.test(currency) ? { amount, currency } : undefined;
};
const addr = (v: unknown): { address?: string; city?: string } => {
  if (typeof v === 'string') return { address: v };
  const a = o(v);
  const parts = [s(a.streetAddress), s(a.addressLocality), s(a.addressRegion), s(a.addressCountry && typeof a.addressCountry === 'object' ? o(a.addressCountry).name : a.addressCountry)].filter(Boolean);
  return { ...(parts.length ? { address: parts.join(', ') } : {}), ...(s(a.addressLocality) ? { city: s(a.addressLocality) } : {}) };
};
const clean = (b: Booking): Booking => Object.fromEntries(Object.entries(b).filter(([, v]) => v !== '' && v !== undefined)) as unknown as Booking;

function fromReservation(r: J): Booking | null {
  const t = typeOf(r);
  const f = o(r.reservationFor);
  const conf = s(r.reservationNumber) || s(r.confirmationNumber);
  const price = money(r);
  const base = { ...(conf ? { conf } : {}), ...(price ? { price } : {}) };
  if (t.includes('FlightReservation')) {
    const dep = splitIso(f.departureTime), arr = splitIso(f.arrivalTime);
    const airline = o(f.airline);
    return clean({ type: 'flight', ...base, airline: s(airline.name), flightNo: `${s(airline.iataCode)}${s(f.flightNumber).replace(/^\D+/, '')}` || s(f.flightNumber),
      from: s(o(f.departureAirport).iataCode).toUpperCase(), to: s(o(f.arrivalAirport).iataCode).toUpperCase(),
      depDate: dep.date, depTime: dep.time, arrDate: arr.date, arrTime: arr.time });
  }
  if (t.includes('LodgingReservation')) {
    const ci = splitIso(r.checkinTime || r.checkinDate), co = splitIso(r.checkoutTime || r.checkoutDate);
    return clean({ type: 'stay', ...base, name: s(f.name), ...addr(f.address), checkIn: ci.date, checkInTime: ci.time, checkOut: co.date, checkOutTime: co.time });
  }
  if (t.includes('TrainReservation') || t.includes('BusReservation') || t.includes('BoatReservation') || t.includes('RentalCarReservation') || t.includes('TaxiReservation')) {
    const mode: Booking['mode'] = t.includes('TrainReservation') ? 'train' : t.includes('BusReservation') ? 'bus' : t.includes('BoatReservation') ? 'ferry' : t.includes('RentalCarReservation') ? 'car' : 'transfer';
    const dep = splitIso(f.departureTime || r.pickupTime || r.startTime), arr = splitIso(f.arrivalTime || r.dropoffTime);
    const stop = (v: unknown) => s(o(v).name) || s(v);
    return clean({ type: 'transport', ...base, mode, operator: [s(o(f.provider).name), s(f.trainName || f.busName || f.trainNumber || f.busNumber)].filter(Boolean).join(' · ') || s(o(r.provider).name),
      fromName: stop(f.departureStation || f.departureBusStop || f.departureBoatTerminal || r.pickupLocation), toName: stop(f.arrivalStation || f.arrivalBusStop || f.arrivalBoatTerminal || r.dropoffLocation),
      date: dep.date, depTime: dep.time, arrDate: arr.date && arr.date !== dep.date ? arr.date : undefined, arrTime: arr.time });
  }
  if (t.includes('FoodEstablishmentReservation')) {
    const st = splitIso(r.startTime);
    return clean({ type: 'restaurant', ...base, name: s(f.name), ...addr(f.address), date: st.date, time: st.time, partySize: Number(s(r.partySize)) || undefined });
  }
  if (t.includes('EventReservation') || t.some((x) => /Reservation$/.test(x))) {
    const st = splitIso(f.startDate || r.startTime);
    const loc = o(f.location);
    return clean({ type: 'activity', ...base, name: s(f.name) || s(r.name), ...addr(loc.address), ...(s(loc.name) ? { notes: s(loc.name) } : {}), date: st.date, time: st.time });
  }
  return null;
}

/** Find schema.org reservations in an email's HTML (JSON-LD). Returns [] if there are none. */
export function parseMarkup(html: string): Booking[] {
  const out: Booking[] = [];
  const re = /<script[^>]+type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const walk = (v: unknown) => {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      const obj = o(v);
      if (Array.isArray(obj['@graph'])) walk(obj['@graph']);
      const b = fromReservation(obj);
      if (b) out.push(b);
    };
    walk(data);
  }
  return out;
}

// ---------- tidying what the AI returns ----------
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;
const TYPES: BookingType[] = ['flight', 'stay', 'transport', 'restaurant', 'activity'];
const MODES = ['train', 'bus', 'ferry', 'car', 'transfer', 'other'];

/** Keep only well-formed fields from an AI answer; drop bookings that are empty. */
export function normalizeBookings(raw: unknown): Booking[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(o(raw).bookings) ? (o(raw).bookings as unknown[]) : [];
  const out: Booking[] = [];
  for (const r0 of list) {
    const r = o(r0);
    const type = s(r.type).toLowerCase() as BookingType;
    if (!TYPES.includes(type)) continue;
    const b: Booking = { type };
    for (const k of ['conf', 'airline', 'flightNo', 'name', 'address', 'city', 'operator', 'fromName', 'toName', 'notes'] as const) if (s(r[k])) (b as unknown as J)[k] = s(r[k]);
    for (const k of ['from', 'to'] as const) if (/^[A-Za-z]{3}$/.test(s(r[k]))) b[k] = s(r[k]).toUpperCase();
    for (const k of ['depDate', 'arrDate', 'checkIn', 'checkOut', 'date'] as const) if (DATE.test(s(r[k]))) b[k] = s(r[k]);
    for (const k of ['depTime', 'arrTime', 'checkInTime', 'checkOutTime', 'time'] as const) { const t = s(r[k]).padStart(5, '0'); if (TIME.test(t)) b[k] = t; }
    if (MODES.includes(s(r.mode))) b.mode = s(r.mode) as Booking['mode'];
    const amount = Number(r.priceAmount ?? o(r.price).amount), currency = s(r.priceCurrency || o(r.price).currency).toUpperCase();
    if (amount > 0 && /^[A-Z]{3}$/.test(currency)) b.price = { amount, currency };
    if (Number(r.partySize) > 0) b.partySize = Number(r.partySize);
    if (b.flightNo) b.flightNo = b.flightNo.replace(/\s+/g, '').toUpperCase();
    const meaningful = Object.keys(b).filter((k) => k !== 'type').length >= 2;
    if (meaningful) out.push(b);
  }
  return out;
}

export function normalizeInbox(raw: unknown): InboxEntry[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(o(raw).entries) ? (o(raw).entries as unknown[]) : [];
  return list.map((e0) => {
    const e = o(e0);
    const src = s(e.source);
    return {
      id: s(e.id) || Math.random().toString(36).slice(2),
      receivedAt: s(e.receivedAt), subject: s(e.subject), sender: s(e.sender),
      source: (src === 'markup' || src === 'ai' ? src : 'none') as InboxEntry['source'],
      bookings: normalizeBookings(e.bookings),
      text: s(e.text), ...(s(e.note) ? { note: s(e.note) } : {}),
    };
  }).filter((e) => e.receivedAt || e.subject || e.text);
}

// ---------- matching to what's already in the trip ----------
export type Match = { type: 'flight'; id: string; label: string } | { type: 'stay'; id: string; label: string } | { type: 'leg'; id: string; label: string } | { type: 'item'; id: string; label: string };
const norm = (v?: string) => (v || '').replace(/\s+/g, '').toUpperCase();

/** An existing booking with the same confirmation number (or, for flights, same flight number and date). */
export function findExisting(doc: TripDoc, b: Booking): Match | null {
  const c = norm(b.conf);
  if (b.type === 'flight') {
    const f = doc.flights.find((x) => (c && norm(x.conf) === c && (!b.flightNo || norm(x.flightNo) === norm(b.flightNo))) || (b.flightNo && norm(x.flightNo) === norm(b.flightNo) && x.depDate === b.depDate));
    return f ? { type: 'flight', id: f.id, label: `${f.flightNo || 'Flight'} ${f.from}→${f.to}` } : null;
  }
  if (!c) return null;
  if (b.type === 'stay') { const x = doc.stays.find((y) => norm(y.conf) === c); return x ? { type: 'stay', id: x.id, label: x.name || 'Stay' } : null; }
  if (b.type === 'transport') { const x = doc.legs.find((y) => norm(y.conf) === c); return x ? { type: 'leg', id: x.id, label: x.operator || x.mode } : null; }
  const it = doc.items.find((y) => norm(y.booking).includes(c) || norm(y.notes).includes(c));
  return it ? { type: 'item', id: it.id, label: it.title } : null;
}

export const bookingTitle = (b: Booking): string => {
  switch (b.type) {
    case 'flight': return `Flight ${b.flightNo || b.airline || ''} ${b.from || '?'}→${b.to || '?'}`.replace(/\s+/g, ' ');
    case 'stay': return `Stay: ${b.name || 'hotel'}`;
    case 'transport': return `${b.mode ? b.mode[0].toUpperCase() + b.mode.slice(1) : 'Transport'}: ${b.operator || ''} ${b.fromName || ''}${b.toName ? ' → ' + b.toName : ''}`.replace(/\s+/g, ' ');
    case 'restaurant': return `Restaurant: ${b.name || ''}`;
    case 'activity': return `Activity: ${b.name || ''}`;
  }
};
