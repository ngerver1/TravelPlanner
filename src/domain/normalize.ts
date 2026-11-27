// Coerce anything (stored or imported) into a valid v2 TripDoc. Never throws.
import { isDate, isTime } from './dates';
import { uid } from './ids';
import { isCurrency, parseCost } from './money';
import { CATEGORIES, MEALS, SIZES, SLOTS, STATUSES } from './constants';
import type {
  ActivityCategory, DayOverride, Flight, Item, Location, Meal, Money, Place, Placement, Rates, Slot, Status, Stay, TransportLeg, TripDoc,
} from './types';

export function emptyDoc(): TripDoc {
  return {
    schema: 2, rev: 0, updatedAt: 0,
    trip: { name: 'My trip', start: '', end: '', currency: 'AUD', people: 1 },
    locations: [], days: {}, items: [], flights: [], stays: [], legs: [],
  };
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const str = (v: unknown) => (v == null ? '' : String(v));
const optStr = (v: unknown) => (str(v).trim() ? str(v) : undefined);
export const status = (v: unknown): Status => (STATUSES.includes(v as Status) ? (v as Status) : 'idea');
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : undefined);

export function normMoney(v: unknown): Money | undefined {
  if (!obj(v)) return undefined;
  const amount = num(v.amount);
  if (amount == null || amount < 0 || !isCurrency(v.currency)) return undefined;
  const m: Money = { amount, currency: v.currency };
  if (v.perPerson === true) m.perPerson = true;
  return m;
}

export function normPlace(v: unknown): Place | undefined {
  if (!obj(v)) return undefined;
  const name = str(v.name).trim();
  const p: Place = { name };
  if (optStr(v.address)) p.address = str(v.address);
  if (num(v.lat) != null && num(v.lng) != null) { p.lat = num(v.lat); p.lng = num(v.lng); }
  if (optStr(v.googlePlaceId)) p.googlePlaceId = str(v.googlePlaceId);
  if (optStr(v.mapsUrl)) p.mapsUrl = str(v.mapsUrl);
  if (!name && !p.address && !p.mapsUrl && p.lat == null) return undefined;
  return p;
}

export function normFlight(f: Raw): Flight {
  return {
    id: str(f.id) || uid(),
    airline: str(f.airline),
    flightNo: str(f.flightNo).toUpperCase(),
    from: str(f.from).toUpperCase(),
    to: str(f.to).toUpperCase(),
    depDate: isDate(f.depDate) ? f.depDate : '',
    depTime: isTime(f.depTime) ? f.depTime : '',
    arrDate: isDate(f.arrDate) ? f.arrDate : '',
    arrTime: isTime(f.arrTime) ? f.arrTime : '',
    status: status(f.status),
    conf: str(f.conf),
    notes: str(f.notes),
    ...(/^https?:\/\//.test(str(f.link)) ? { link: str(f.link) } : {}),
  };
}

function normPlacement(p: Raw, kind: Item['kind']): Placement | null {
  if (!isDate(p.date)) return null;
  const out: Placement = { date: p.date, order: num(p.order) ?? 0 };
  if (kind === 'activity' && SLOTS.includes(p.slot as Slot)) out.slot = p.slot as Slot;
  if (kind === 'restaurant') out.meal = MEALS.includes(p.meal as Meal) ? (p.meal as Meal) : 'lunch';
  if (isTime(p.time)) out.time = p.time;
  if (kind === 'restaurant' && p.chosen === true) out.chosen = true;
  return out;
}

export function normalizeDoc(raw: unknown): TripDoc {
  const base = emptyDoc();
  if (!obj(raw)) return base;
  const t = obj(raw.trip) ? raw.trip : {};
  const doc: TripDoc = {
    schema: 2,
    rev: Math.max(0, Math.floor(num(raw.rev) ?? 0)),
    updatedAt: num(raw.updatedAt) ?? 0,
    trip: {
      name: str(t.name) || base.trip.name,
      start: isDate(t.start) ? t.start : '',
      end: isDate(t.end) ? t.end : '',
      currency: isCurrency(t.currency) ? t.currency : 'AUD',
      people: Math.min(50, Math.max(1, Math.floor(num(t.people) ?? 1))),
    },
    locations: [], days: {}, items: [], flights: [], stays: [], legs: [],
  };
  if (doc.trip.start && doc.trip.end && doc.trip.end < doc.trip.start) doc.trip.end = doc.trip.start;
  const home = doc.trip.currency!;
  if (obj(raw.rates) && isCurrency(raw.rates.base) && obj(raw.rates.rates)) {
    const r: Rates = { base: raw.rates.base, date: str(raw.rates.date), rates: {} };
    for (const [k, v] of Object.entries(raw.rates.rates)) if (isCurrency(k) && typeof v === 'number' && v > 0 && isFinite(v)) r.rates[k] = v;
    const manual = arr(raw.rates.manual).filter(isCurrency);
    if (manual.length) r.manual = manual;
    doc.rates = r;
  }

  const seen = new Set<string>();
  for (const l of arr(raw.locations)) {
    if (!obj(l)) continue;
    const loc: Location = { id: str(l.id) || uid(), name: str(l.name).trim() || 'Untitled' };
    if (seen.has(loc.id)) continue;
    seen.add(loc.id);
    if (num(l.colorIndex) != null) loc.colorIndex = Math.max(0, Math.floor(num(l.colorIndex)!));
    const place = normPlace(l.place);
    if (place) loc.place = place;
    doc.locations.push(loc);
  }
  const locOk = (v: unknown) => (typeof v === 'string' && seen.has(v) ? v : undefined);

  if (obj(raw.days)) {
    for (const [d, v] of Object.entries(raw.days)) {
      if (!isDate(d) || !obj(v)) continue;
      const e: DayOverride = {};
      const a = locOk(v.locationId);
      if (a) { e.locationId = a; const b = locOk(v.toLocationId); if (b && b !== a) e.toLocationId = b; }
      if (str(v.notes).trim()) e.notes = str(v.notes);
      if (Object.keys(e).length) doc.days[d] = e;
    }
  }

  for (const f of arr(raw.flights)) if (obj(f)) { const fl = normFlight(f); const p = normMoney(f.price); if (p) fl.price = p; doc.flights.push(fl); }

  for (const s of arr(raw.stays)) {
    if (!obj(s)) continue;
    const stay: Stay = {
      id: str(s.id) || uid(),
      name: str(s.name),
      address: str(s.address),
      checkIn: isDate(s.checkIn) ? s.checkIn : '',
      checkOut: isDate(s.checkOut) ? s.checkOut : '',
      checkInTime: isTime(s.checkInTime) ? s.checkInTime : '',
      checkOutTime: isTime(s.checkOutTime) ? s.checkOutTime : '',
      status: status(s.status),
      conf: str(s.conf),
      cost: str(s.cost),
      link: str(s.link),
      notes: str(s.notes),
    };
    const lid = locOk(s.locationId);
    if (lid) stay.locationId = lid;
    const price = normMoney(s.price) ?? (stay.cost.trim() ? parseCost(stay.cost, home) : null);
    if (price) { stay.price = price; if (!s.price) stay.cost = ''; }
    const place = normPlace(s.place);
    if (place) stay.place = place;
    doc.stays.push(stay);
  }

  let unassigned: string | null = null;
  const fallbackLoc = () => {
    if (!unassigned) {
      const existing = doc.locations.find((l) => l.name.toLowerCase() === 'unassigned');
      unassigned = existing?.id ?? uid();
      if (!existing) { doc.locations.push({ id: unassigned, name: 'Unassigned' }); seen.add(unassigned); }
    }
    return unassigned;
  };
  for (const i of arr(raw.items)) {
    if (!obj(i)) continue;
    const kind: Item['kind'] = i.kind === 'restaurant' ? 'restaurant' : 'activity';
    const item: Item = {
      id: str(i.id) || uid(),
      locationId: locOk(i.locationId) ?? fallbackLoc(),
      kind,
      title: str(i.title),
      status: status(i.status),
      placements: [],
    };
    const place = normPlace(i.place);
    if (place) item.place = place;
    if (optStr(i.link)) item.link = str(i.link);
    if (optStr(i.notes)) item.notes = str(i.notes);
    const price = normMoney(i.price) ?? (optStr(i.cost) ? parseCost(str(i.cost), home) : null);
    if (price) item.price = price;
    if (i.mustDo === true) item.mustDo = true;
    if (i.done === true) item.done = true;
    if (kind === 'activity') {
      item.category = typeof i.category === "string" && i.category in CATEGORIES ? (i.category as ActivityCategory) : 'other';
      item.size = SIZES.includes(i.size as never) ? (i.size as Item['size']) : 'quick';
      if (i.includesEvening === true) item.includesEvening = true;
    } else {
      const meals = arr(i.meals).filter((m): m is Meal => MEALS.includes(m as Meal));
      if (meals.length) item.meals = [...new Set(meals)];
      if (optStr(i.cuisine)) item.cuisine = str(i.cuisine);
      if (optStr(i.booking)) item.booking = str(i.booking);
    }
    for (const p of arr(i.placements)) {
      if (!obj(p)) continue;
      const np = normPlacement(p, kind);
      if (np) item.placements.push(np);
    }
    if (kind === 'activity' && item.placements.length > 1) item.placements = item.placements.slice(0, 1);
    doc.items.push(item);
  }

  const itemIds = new Set(doc.items.map((i) => i.id));
  for (const l of arr(raw.legs)) {
    if (!obj(l)) continue;
    const modes = ['train', 'bus', 'ferry', 'car', 'transfer', 'other'];
    const leg: TransportLeg = {
      id: str(l.id) || uid(),
      mode: modes.includes(str(l.mode)) ? (l.mode as TransportLeg['mode']) : 'other',
      operator: str(l.operator),
      fromName: str(l.fromName),
      toName: str(l.toName),
      date: isDate(l.date) ? l.date : '',
      depTime: isTime(l.depTime) ? l.depTime : '',
      arrDate: isDate(l.arrDate) && isDate(l.date) && l.arrDate > l.date ? l.arrDate : '',
      arrTime: isTime(l.arrTime) ? l.arrTime : '',
      duration: str(l.duration),
      status: status(l.status),
      conf: str(l.conf),
      cost: str(l.cost),
      link: str(l.link),
      notes: str(l.notes),
    };
    const a = locOk(l.fromLocationId); if (a) leg.fromLocationId = a;
    const b = locOk(l.toLocationId); if (b) leg.toLocationId = b;
    const price = normMoney(l.price) ?? (leg.cost.trim() ? parseCost(leg.cost, home) : null);
    if (price) { leg.price = price; if (!l.price) leg.cost = ''; }
    if (typeof l.itemId === 'string' && itemIds.has(l.itemId)) { leg.itemId = l.itemId; leg.itemRole = l.itemRole === 'from' ? 'from' : 'to'; }
    doc.legs.push(leg);
  }
  return doc;
}
