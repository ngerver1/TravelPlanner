// Bookings read from forwarded emails. The email Worker (email-worker/) writes them to inbox.json in the
// trip's Gist; the app shows them for review (Add / Update existing / Dismiss). Nothing goes straight in.
import type { Money, TripDoc } from './types';
import { looseDate, looseTime, type DateContext } from './looseDates';
import { parseCost } from './money';
import { cleanPhone, copiedFrom, findLocalAddress, findLocalName, findPhone, hasCjk } from './local';

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
  /** Web link to view or manage the booking. */
  link?: string;
  /** Google Maps link to the place (from the email). */
  mapsUrl?: string;
  /** Cancellation terms, e.g. "Free cancellation until 24 Jan 2027 18:00" or "Non-refundable". */
  cancelBy?: string;
  /** The place's name and address in the local language, exactly as written in the email (never translated). */
  localName?: string;
  localAddress?: string;
  phone?: string;
}

export interface EmailLink { text: string; url: string }

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
  /** Useful links found in the email (manage booking, itinerary, tickets...). */
  links?: EmailLink[];
}

// ---------- links in an email ----------
const SKIP = /unsubscribe|privacy|preferences|terms|cookie|facebook|twitter|x\.com|instagram|youtube|linkedin|tiktok|pinterest|app ?store|google ?play|apps\.apple|play\.google|mailto:|tel:|survey|feedback|newsletter|help ?cent|contact ?us|\.(png|jpe?g|gif)(\?|$)/i;
const GOOD = /manage|my ?booking|my ?trip|view (your )?(booking|reservation|itinerary|trip|order|ticket)|itinerary|reservation|booking|e-?ticket|ticket|voucher|check-?in|confirm|order|details|receipt|boarding/i;
const MANAGE = /manage|view (your )?(booking|reservation)|my ?booking|change|cancel (your )?(booking|reservation)/i;
export const MAPS = /(^https?:\/\/(www\.)?google\.[a-z.]+\/maps)|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl/i;
const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

/** Links in an email's HTML (or text), most useful first: booking/itinerary links rank above everything else. */
export function extractLinks(html: string, text = ''): EmailLink[] {
  const found: (EmailLink & { score: number; i: number })[] = [];
  const seen = new Set<string>();
  const add = (url: string, label: string) => {
    url = decode(url.trim()).replace(/[).,;]+$/, '');
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
    label = decode(label.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (SKIP.test(url) || SKIP.test(label)) return;
    seen.add(url);
    found.push({ url, text: label.slice(0, 80), score: (MANAGE.test(label) ? 3 : 0) + (GOOD.test(label) ? 2 : 0) + (GOOD.test(url) ? 1 : 0) - (MAPS.test(url) ? 3 : 0), i: found.length });
  };
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) add(m[1], m[2]);
  // Plain text: "Manage booking: https://…" or "Manage booking <https://…>": use the words before the link as its label.
  for (const m2 of text.matchAll(/([^\n<>]{0,60}?)[\s:(<-]*<?(https?:\/\/[^\s<>"')\]]+)/g)) add(m2[2], m2[1].replace(/[:\-–(]+\s*$/, ''));
  return found.sort((a, b) => b.score - a.score || a.i - b.i).map(({ url, text }) => ({ url, text: text || new URL(url).hostname.replace(/^www\./, '') }));
}
/** The single best link for a booking: the top-ranked one if it looks like a booking link. */
export const bestLink = (links: EmailLink[]): string | undefined => {
  const l = links.find((x) => !MAPS.test(x.url));
  return l && (GOOD.test(l.text) || GOOD.test(l.url)) ? l.url : undefined;
};
export const mapsLinkIn = (links: EmailLink[]): string | undefined => links.find((l) => MAPS.test(l.url))?.url;

// ---------- details found by rules in the email text (a second pass after markup or the AI) ----------
const CONF_RE = /\b(?:confirmation|booking|reservation|order|itinerary|trip|record locator|pnr|reference|ref)(?:\s*(?:number|no\.?|num|code|id|ref(?:erence)?|locator|#))?[\s:#()\-–]*(?:is\s+)?([A-Z0-9][A-Z0-9.\-]{3,19}[A-Z0-9])\b/gi;
/** A booking reference next to a label like "Confirmation number:", "Booking reference", "PNR". */
export function findConf(text: string): string | undefined {
  for (const m of text.matchAll(CONF_RE)) {
    const v = m[1];
    const isCode = /\d/.test(v) || (v === v.toUpperCase() && /^[A-Z]{5,8}$/.test(v));
    if (isCode && !/^(number|reference|confirmed|details|summary)$/i.test(v)) return v.toUpperCase();
  }
  return undefined;
}
const HAS_CURRENCY = /\b(AUD|HKD|JPY|USD|EUR|GBP|NZD|SGD|CNY|KRW|TWD|THB|MYR|CAD|CHF)\b|HK\$|A\$|AU\$|US\$|NZ\$|S\$|NT\$|[¥￥€£₩฿]|円/i;
/** The total paid: from a line like "Total price: ¥42,000" (prefers "total"; needs an explicit currency). */
export function findPrice(text: string, home = 'AUD'): Money | undefined {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const score = (l: string) => (/grand total|total (price|amount|cost|paid|charged)|amount (paid|charged)|total/i.test(l) ? 2 : /price|paid|charged|amount|cost/i.test(l) ? 1 : 0);
  const cands = lines.flatMap((l, i) => {
    const sc = score(l);
    if (!sc) return [];
    const withNext = HAS_CURRENCY.test(l) ? l : HAS_CURRENCY.test(lines[i + 1] || '') ? `${l} ${lines[i + 1]}` : '';
    if (!withNext) return [];
    const m = parseCost(withNext.replace(/(\d)[\s ](?=\d{3}\b)/g, '$1'), home);
    return m && m.amount > 0 ? [{ m, sc, i }] : [];
  });
  cands.sort((a, b) => b.sc - a.sc || b.i - a.i); // highest-ranked; last "total" line wins ties
  if (!cands[0]) return undefined;
  const { perPerson: _pp, ...m } = cands[0].m;
  return m;
}
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short' });
};
/**
 * Only the key cancellation terms, kept short: "Free cancellation until 24 Jan 23:59 · 50% refund until 26 Jan",
 * or "Non-refundable". Terms without a date (and all other policy text) are left out.
 */
export function summariseCancel(text: string, ctx: DateContext = {}): string | undefined {
  const parts: string[] = [];
  let free = '', partial = '', nonRefundable = false;
  for (const raw of text.split(/\n|(?<=[.;])\s+/)) {
    const l = raw.replace(/\s+/g, ' ').trim();
    if (!l || l.length > 400) continue;
    // For a range ("between 25 January and 26 January"), the terms last until the later date.
    const tail = l.split(/\s(?:and|to|until|till|-|–)\s/i).pop() || l;
    const date = looseDate(tail, ctx) || looseDate(l, ctx);
    const time = date ? looseTime(l.replace(/\b\d{4}\b/g, '')) : undefined;
    const when = date ? `${shortDate(date)}${time ? ' ' + time : ''}` : '';
    if (!free && /free cancell?ation|cancel(?:lation)? (?:is )?free|cancel for free|full(?:y)? refund/i.test(l) && when) free = `Free cancellation until ${when}`;
    else if (!partial && when) {
      const pct = l.match(/(\d{1,3})\s*%\s*(?:refund|of (?:the )?(?:total|amount|price) (?:refunded|back))/i) || l.match(/refund(?:ed)? (?:of )?(\d{1,3})\s*%/i);
      if (pct) partial = `${pct[1]}% refund until ${when}`;
      else if (/partial(?:ly)? refund/i.test(l)) partial = `Partial refund until ${when}`;
    }
    if (/non-?refundable|no refunds?\b/i.test(l) && !/fully refundable/i.test(l)) nonRefundable = true;
  }
  if (free) parts.push(free);
  if (partial) parts.push(partial);
  if (!parts.length && nonRefundable) parts.push('Non-refundable');
  return parts.length ? parts.join(' · ') : undefined;
}
export const findCancel = summariseCancel;

/**
 * Fill gaps in what was read, from rules over the email text and its links. Shared details (reference,
 * cancellation, maps) go on every booking; the total price only on the first booking.
 */
/** `fromMarkup`: the bookings came from the email's own booking data, so their local text needs no check against the text. */
export function enrichBookings(bookings: Booking[], text: string, links: EmailLink[], home = 'AUD', ctx: DateContext = {}, fromMarkup = false): Booking[] {
  const conf = findConf(text), price = findPrice(text, home), cancel = summariseCancel(text, ctx);
  const link = bestLink(links), maps = mapsLinkIn(links);
  bookings = withLocalText(bookings, text, fromMarkup);
  return bookings.map((b, i) => ({
    ...b,
    ...(!b.conf && conf ? { conf } : {}),
    ...(!b.price && price && i === 0 ? { price } : {}),
    ...(!b.link && link ? { link } : {}),
    ...(!b.mapsUrl && maps && (b.type === 'stay' || b.type === 'restaurant' || b.type === 'activity') ? { mapsUrl: maps } : {}),
    ...(cancel ? { cancelBy: cancel } : {}), // the rules' short summary wins over the AI's wording
  }));
}

const isPlace = (b: Booking) => b.type === 'stay' || b.type === 'restaurant' || b.type === 'activity';
/**
 * Local-language name and address: keep only text that is written in the local script AND appears in the
 * email (so nothing translated or made up gets through), then fill gaps from labelled lines in the email
 * when it is about a single place. Phone numbers likewise.
 */
export function withLocalText(bookings: Booking[], text: string, trusted = false): Booking[] {
  const places = bookings.filter(isPlace).length;
  const name = places === 1 ? findLocalName(text) : undefined;
  const address = places === 1 ? findLocalAddress(text) : undefined;
  const phone = places === 1 ? findPhone(text) : undefined;
  return bookings.map((b0) => {
    const b = { ...b0 };
    for (const k of ['localName', 'localAddress'] as const) if (b[k] && !(isPlace(b) && hasCjk(b[k]) && (trusted || copiedFrom(b[k]!, text)))) delete b[k];
    if (b.phone && !(isPlace(b) && (trusted || copiedFrom(b.phone.replace(/[^\d]/g, '').slice(-6), text.replace(/[^\d]/g, ''))))) delete b.phone;
    if (!isPlace(b)) return b;
    if (!b.localName && name) b.localName = name;
    if (!b.localAddress && address) b.localAddress = address;
    if (!b.phone && phone) b.phone = phone;
    return b;
  });
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
/** Name, address and phone of a place in markup. Text in the local script also becomes the local name/address. */
const placeOf = (f: J, address: unknown): Partial<Booking> => {
  const name = s(f.name), alt = s(f.alternateName), a = addr(address), phone = cleanPhone(s(f.telephone));
  return {
    name: hasCjk(name) && alt && !hasCjk(alt) ? alt : name, ...a,
    ...(hasCjk(name) ? { localName: name } : hasCjk(alt) ? { localName: alt } : {}),
    ...(a.address && hasCjk(a.address) ? { localAddress: a.address } : {}),
    ...(phone ? { phone } : {}),
  };
};
const clean = (b: Booking): Booking => Object.fromEntries(Object.entries(b).filter(([, v]) => v !== '' && v !== undefined)) as unknown as Booking;

function fromReservation(r: J): Booking | null {
  const t = typeOf(r);
  const f = o(r.reservationFor);
  const conf = s(r.reservationNumber) || s(r.confirmationNumber);
  const price = money(r);
  const actions = ([] as unknown[]).concat(r.potentialAction ?? [], f.potentialAction ?? []).map(o);
  const link = [s(r.modifyReservationUrl), s(r.url), ...actions.map((a) => s(a.url) || s(o(a.target).urlTemplate) || s(a.target)), s(f.url)].find((u) => /^https?:\/\//.test(u));
  const base = { ...(conf ? { conf } : {}), ...(price ? { price } : {}), ...(link ? { link } : {}) };
  if (t.includes('FlightReservation')) {
    const dep = splitIso(f.departureTime), arr = splitIso(f.arrivalTime);
    const airline = o(f.airline);
    return clean({ type: 'flight', ...base, airline: s(airline.name), flightNo: `${s(airline.iataCode)}${s(f.flightNumber).replace(/^\D+/, '')}` || s(f.flightNumber),
      from: s(o(f.departureAirport).iataCode).toUpperCase(), to: s(o(f.arrivalAirport).iataCode).toUpperCase(),
      depDate: dep.date, depTime: dep.time, arrDate: arr.date, arrTime: arr.time });
  }
  if (t.includes('LodgingReservation')) {
    const ci = splitIso(r.checkinTime || r.checkinDate), co = splitIso(r.checkoutTime || r.checkoutDate);
    return clean({ type: 'stay', ...base, ...placeOf(f, f.address), checkIn: ci.date, checkInTime: ci.time, checkOut: co.date, checkOutTime: co.time });
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
    return clean({ type: 'restaurant', ...base, ...placeOf(f, f.address), date: st.date, time: st.time, partySize: Number(s(r.partySize)) || undefined });
  }
  if (t.includes('EventReservation') || t.some((x) => /Reservation$/.test(x))) {
    const st = splitIso(f.startDate || r.startTime);
    const loc = o(f.location);
    return clean({ type: 'activity', ...base, ...placeOf({ ...loc, name: s(f.name) || s(r.name) }, loc.address), ...(s(loc.name) ? { notes: s(loc.name) } : {}), date: st.date, time: st.time });
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
const TYPES: BookingType[] = ['flight', 'stay', 'transport', 'restaurant', 'activity'];
const MODES = ['train', 'bus', 'ferry', 'car', 'transfer', 'other'];

/**
 * Keep only well-formed fields from an AI answer (or a stored entry); drop bookings that are empty.
 * Dates and times are read leniently ("26 Jan", "4:05 PM"...), using the trip's dates for missing years.
 * `links` lets an answer point at a link by number (linkIndex, 1-based).
 */
export function normalizeBookings(raw: unknown, ctx: DateContext = {}, links: EmailLink[] = []): Booking[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(o(raw).bookings) ? (o(raw).bookings as unknown[]) : [];
  const out: Booking[] = [];
  for (const r0 of list) {
    const r = o(r0);
    const type = s(r.type).toLowerCase() as BookingType;
    if (!TYPES.includes(type)) continue;
    const b: Booking = { type };
    for (const k of ['conf', 'airline', 'flightNo', 'name', 'address', 'city', 'operator', 'fromName', 'toName', 'localName', 'localAddress'] as const) if (s(r[k])) (b as unknown as J)[k] = s(r[k]);
    const phone = cleanPhone(r.phone); if (phone) b.phone = phone;
    const cancel = s(r.cancelBy) && summariseCancel(s(r.cancelBy), ctx); // only short, dated terms
    if (cancel) b.cancelBy = cancel;
    if (/^https?:\/\//.test(s(r.mapsUrl))) b.mapsUrl = s(r.mapsUrl);
    for (const k of ['from', 'to'] as const) if (/^[A-Za-z]{3}$/.test(s(r[k]))) b[k] = s(r[k]).toUpperCase();
    for (const k of ['depDate', 'arrDate', 'checkIn', 'checkOut', 'date'] as const) { const d = looseDate(r[k], ctx); if (d) b[k] = d; }
    for (const k of ['depTime', 'arrTime', 'checkInTime', 'checkOutTime', 'time'] as const) { const t = looseTime(r[k]); if (t) b[k] = t; }
    // A date written with its time ("2027-01-28T16:05", "28 Jan 16:05") also gives the time.
    const pairs = [['depDate', 'depTime'], ['arrDate', 'arrTime'], ['checkIn', 'checkInTime'], ['checkOut', 'checkOutTime'], ['date', 'time']] as const;
    for (const [d, t] of pairs) if (!b[t] && /\d[:.h時]\d\d|\d\s*[ap]\.?m/i.test(s(r[d]))) { const tt = looseTime(s(r[d]).replace(/^.*?(\d{1,2}[:.h時]\d{2}.*|\d{1,2}\s*[ap]\.?m.*)$/i, '$1')); if (tt) b[t] = tt; }
    if (MODES.includes(s(r.mode))) b.mode = s(r.mode) as Booking['mode'];
    const amount = Number(String(r.priceAmount ?? o(r.price).amount ?? '').replace(/[^\d.]/g, '')), currency = s(r.priceCurrency || o(r.price).currency).toUpperCase();
    if (amount > 0 && /^[A-Z]{3}$/.test(currency)) b.price = { amount, currency };
    if (Number(r.partySize) > 0) b.partySize = Number(r.partySize);
    if (b.flightNo) b.flightNo = b.flightNo.replace(/\s+/g, '').toUpperCase();
    const li = Number(r.linkIndex);
    const link = /^https?:\/\//.test(s(r.link)) ? s(r.link) : li >= 1 && links[li - 1] ? links[li - 1].url : '';
    if (link) b.link = link;
    const meaningful = Object.keys(b).filter((k) => !['type', 'link', 'mapsUrl', 'cancelBy', 'localName', 'localAddress', 'phone'].includes(k)).length >= 2;
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
      ...(Array.isArray(e.links) ? { links: (e.links as unknown[]).map(o).filter((l) => /^https?:\/\//.test(s(l.url))).map((l) => ({ url: s(l.url), text: s(l.text) || s(l.url) })).slice(0, 12) } : {}),
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

/**
 * Parse an AI answer that may have been cut off mid-way: if the JSON is incomplete, keep every booking object
 * that came through whole. Returns null if nothing usable.
 */
export function parseAiAnswer(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  const text = typeof raw === 'string' ? raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '') : '';
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* cut off: repair below */ }
  // Cut off part-way (usually one value ran on until the answer limit): keep everything written
  // up to the last complete value, close the open brackets, and drop bookings left with only a type.
  const fixed = repairJson(text) as { bookings?: unknown } | null;
  const items = Array.isArray(fixed?.bookings)
    ? fixed.bookings.filter((b) => b && typeof b === 'object' && Object.keys(b).length >= 2)
    : [];
  return items.length ? { bookings: items } : null;
}

/** Parses JSON that stops part-way, by cutting back to the last complete value and closing brackets. */
export function repairJson(text: string): unknown {
  const cuts: { at: number; close: string }[] = [];
  const stack: string[] = [];
  let inStr = false, esc = false;
  const closers = () => stack.slice().reverse().map((c) => (c === '{' ? '}' : ']')).join('');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') { stack.pop(); cuts.push({ at: i + 1, close: closers() }); }
    else if (c === ',') cuts.push({ at: i, close: closers() });
  }
  for (let k = cuts.length - 1, tries = 0; k >= 0 && tries < 300; k--, tries++) {
    try { return JSON.parse(text.slice(0, cuts[k].at) + cuts[k].close); } catch { /* try an earlier cut */ }
  }
  return null;
}
