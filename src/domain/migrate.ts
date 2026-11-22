// Reading trip files: v2 documents are normalised; v1 files are normalised (as v1 did) then migrated.
import { isDate, isTime, MAX_SPAN, diffDays } from './dates';
import { norm, uid } from './ids';
import { mealFromTime, slotFromTime, UNASSIGNED } from './constants';
import { emptyDoc, normFlight, normalizeDoc, status, str } from './normalize';
import { locationOn } from './derive';
import type { ActivityCategory, Item, TripDoc } from './types';

// ---------- v1 shapes (from v1 logic.js normalize) ----------
export interface V1Day { loc?: string; loc2?: string; notes?: string }
export interface V1Stay {
  id: string; name: string; location: string; address: string; checkIn: string; checkOut: string;
  checkInTime: string; checkOutTime: string; status: TripDoc['stays'][number]['status']; conf: string; cost: string; link: string; notes: string;
}
export interface V1Item {
  id: string; date: string; time: string; title: string; place: string;
  category: 'food' | 'sight' | 'transport' | 'activity' | 'other'; status: Item['status']; notes: string; link: string;
}
export interface V1Trip {
  version: 1; updatedAt: number;
  trip: { name: string; start: string; end: string };
  days: Record<string, V1Day>;
  flights: TripDoc['flights'];
  stays: V1Stay[];
  items: V1Item[];
}

const V1_DEFAULT = { name: 'My trip', start: '2027-01-22', end: '2027-02-11' };
const V1_CATS = ['food', 'sight', 'transport', 'activity', 'other'];
type Raw = Record<string, unknown>;
const obj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** v1's normalize(), typed. */
export function normalizeV1(raw: unknown): V1Trip {
  const r: Raw = obj(raw) ? raw : {};
  const t: Raw = obj(r.trip) ? r.trip : {};
  const out: V1Trip = {
    version: 1,
    updatedAt: Number(r.updatedAt) || 0,
    trip: {
      name: str(t.name) || V1_DEFAULT.name,
      start: isDate(t.start) ? t.start : V1_DEFAULT.start,
      end: isDate(t.end) ? t.end : V1_DEFAULT.end,
    },
    days: {}, flights: [], stays: [], items: [],
  };
  if (out.trip.end < out.trip.start) out.trip.end = out.trip.start;
  if (diffDays(out.trip.start, out.trip.end) > MAX_SPAN) out.trip.end = out.trip.start;
  if (obj(r.days)) {
    for (const [d, v] of Object.entries(r.days)) {
      if (!isDate(d) || !obj(v)) continue;
      const e: V1Day = {};
      if (str(v.loc).trim()) e.loc = str(v.loc).trim();
      if (e.loc && str(v.loc2).trim()) e.loc2 = str(v.loc2).trim();
      if (str(v.notes).trim()) e.notes = str(v.notes);
      if (Object.keys(e).length) out.days[d] = e;
    }
  }
  for (const f of arr(r.flights)) if (obj(f)) out.flights.push(normFlight(f));
  for (const s of arr(r.stays)) {
    if (!obj(s)) continue;
    out.stays.push({
      id: str(s.id) || uid(), name: str(s.name), location: str(s.location), address: str(s.address),
      checkIn: isDate(s.checkIn) ? s.checkIn : '', checkOut: isDate(s.checkOut) ? s.checkOut : '',
      checkInTime: isTime(s.checkInTime) ? s.checkInTime : '', checkOutTime: isTime(s.checkOutTime) ? s.checkOutTime : '',
      status: status(s.status), conf: str(s.conf), cost: str(s.cost), link: str(s.link), notes: str(s.notes),
    });
  }
  for (const i of arr(r.items)) {
    if (!obj(i)) continue;
    out.items.push({
      id: str(i.id) || uid(), date: isDate(i.date) ? i.date : '', time: isTime(i.time) ? i.time : '',
      title: str(i.title), place: str(i.place),
      category: V1_CATS.includes(str(i.category)) ? (i.category as V1Item['category']) : 'other',
      status: status(i.status), notes: str(i.notes), link: str(i.link),
    });
  }
  return out;
}

const CAT_MAP: Record<Exclude<V1Item['category'], 'food'>, ActivityCategory> = {
  sight: 'sight', activity: 'activity', transport: 'other', other: 'other',
};

/** Migrate a normalised v1 trip to a v2 document. */
export function migrateV1(v1: V1Trip): TripDoc {
  const doc = emptyDoc();
  doc.updatedAt = v1.updatedAt;
  doc.trip = { ...v1.trip };
  doc.flights = v1.flights.map((f) => ({ ...f }));

  // 1. One Location per distinct name in stay locations and day overrides (case-insensitive).
  //    Stay spellings come first; an all-lowercase name is upgraded if a capitalised spelling turns up.
  const byName = new Map<string, string>();
  const ensure = (name: string | undefined) => {
    const n = (name || '').trim();
    if (!n) return undefined;
    let id = byName.get(norm(n));
    if (!id) { id = uid(); byName.set(norm(n), id); doc.locations.push({ id, name: n }); }
    else {
      const l = doc.locations.find((x) => x.id === id)!;
      if (l.name === l.name.toLowerCase() && n !== n.toLowerCase()) l.name = n;
    }
    return id;
  };
  const dayKeys = Object.keys(v1.days).sort();
  for (const s of v1.stays) ensure(s.location);
  for (const d of dayKeys) { ensure(v1.days[d].loc); ensure(v1.days[d].loc2); }

  for (const d of dayKeys) {
    const v = v1.days[d];
    const e: TripDoc['days'][string] = {};
    const a = ensure(v.loc);
    if (a) { e.locationId = a; const b = ensure(v.loc2); if (b && b !== a) e.toLocationId = b; }
    if (v.notes) e.notes = v.notes;
    if (Object.keys(e).length) doc.days[d] = e;
  }
  doc.stays = v1.stays.map(({ location, ...s }) => {
    const id = ensure(location);
    return id ? { ...s, locationId: id } : { ...s };
  });

  // 4. An item's location is its day's location (the first one on travel days that is a location
  //    record, so an airport code like "BNE" is skipped). With none, "Unassigned".
  let unassigned: string | undefined;
  const itemLocation = (date: string) => {
    if (date) {
      const loc = locationOn(doc, date);
      const id = loc?.a.id ?? loc?.b?.id;
      if (id) return id;
    }
    if (!unassigned) unassigned = byName.get(norm(UNASSIGNED)) ?? ensure(UNASSIGNED)!;
    return unassigned;
  };

  // Keep v1's order within a day: by time, then file order.
  const orderOf = new Map<string, number>();
  const counters = new Map<string, number>();
  const sorted = v1.items.map((it, idx) => ({ it, idx }))
    .sort((p, q) => p.it.date.localeCompare(q.it.date) || (p.it.time || '99:99').localeCompare(q.it.time || '99:99') || p.idx - q.idx);
  for (const { it } of sorted) {
    if (!it.date) continue;
    const isFood = it.category === 'food';
    const lane = isFood ? `${it.date}|m|${mealFromTime(it.time)}` : `${it.date}|s|${slotFromTime(it.time) ?? '-'}`;
    const n = counters.get(lane) ?? 0;
    counters.set(lane, n + 1);
    orderOf.set(it.id, n);
  }

  for (const it of v1.items) {
    const base = {
      id: it.id,
      locationId: itemLocation(it.date),
      title: it.title,
      status: it.status,
      ...(it.place.trim() ? { place: { name: it.place.trim() } } : {}),
      ...(it.link ? { link: it.link } : {}),
      ...(it.notes ? { notes: it.notes } : {}),
    };
    const time = it.time ? { time: it.time } : {};
    if (it.category === 'food') {
      // 2. Food → restaurant with a meal placement.
      doc.items.push({
        ...base, kind: 'restaurant',
        placements: it.date ? [{ date: it.date, meal: mealFromTime(it.time), order: orderOf.get(it.id) ?? 0, ...time }] : [],
      });
    } else {
      // 3. Others → quick activities; slot from time, untimed = no slot.
      const slot = slotFromTime(it.time);
      doc.items.push({
        ...base, kind: 'activity', category: CAT_MAP[it.category], size: 'quick',
        placements: it.date ? [{ date: it.date, ...(slot ? { slot } : {}), order: orderOf.get(it.id) ?? 0, ...time }] : [],
      });
    }
  }
  return doc;
}

export type FileKind = 'v1' | 'v2';

/** Read any trip file (v1 or v2). Throws a readable Error if it isn't one. */
export function readTripFile(raw: unknown): { doc: TripDoc; from: FileKind } {
  if (!obj(raw)) throw new Error('Not a trip file.');
  if (raw.schema === 2) return { doc: normalizeDoc(raw), from: 'v2' };
  if (typeof raw.schema === 'number' && raw.schema > 2) throw new Error(`This file is from a newer version of the app (schema ${raw.schema}).`);
  if (!obj(raw.trip)) throw new Error('Not a trip file (no "trip" section).');
  return { doc: migrateV1(normalizeV1(raw)), from: 'v1' };
}
