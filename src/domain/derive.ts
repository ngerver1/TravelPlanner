// Derived view model: auto locations, night status, overlaps, out-of-range, colours, stats.
// Ported from v1 logic.js; locations are now records referenced by id.
import { addDays, diffDays, fmtLong, fmtShort, isDate, range } from './dates';
import { norm } from './ids';
import { NEUTRAL, PALETTE, assignColors, hash, isAirport, swatchAt, type Swatch } from './colors';
import type { Flight, Item, Location, Placement, Stay, TripDoc } from './types';

/** A location as shown on a day: a Location record (id) or a bare airport code from a flight. */
export interface LocRef { id?: string; name: string }
export interface DayLoc { a: LocRef; b: LocRef | null; manual: boolean }

export type Night =
  | { kind: 'end' }
  | { kind: 'booked' | 'planned' | 'idea'; stay: Stay; count: number }
  | { kind: 'plane'; flight: Flight }
  | { kind: 'none' };

/** A part of the day: at the first place (a), in the air, or at the second place (b). */
export interface DaySegment { at: 'a' | 'b' | 'air'; from: number; to: number }

const frac = (t: string | undefined) => (t && /^\d\d:\d\d$/.test(t) ? (Number(t.slice(0, 2)) * 60 + Number(t.slice(3))) / 1440 : null);

/**
 * Split a day by time: until the first flight leaves you're at `a`, then in the air, then at `b` from
 * when the last flight lands. Overnight flights fill the rest of (or the start of) the day with "air".
 * With no flight times, a travel day splits at the checkout time if known, else early (mostly destination).
 */
export function daySegments(loc: { a: LocRef; b: LocRef | null } | null, dep: Flight[], arr: Flight[], d: string, checkOutTime?: string): DaySegment[] {
  if (!loc) return [];
  const segs: DaySegment[] = [];
  const push = (at: DaySegment['at'], from: number, to: number) => { if (to - from > 0.001) segs.push({ at, from, to }); };
  const inbound = arr[0]; // overnight flight landing today
  const first = dep[0], last = dep[dep.length - 1];
  const after: DaySegment['at'] = loc.b ? 'b' : 'a';
  if (!first) {
    if (inbound) { const t = frac(inbound.arrTime) ?? 0.2; push('air', 0, t); push(after, t, 1); return segs; }
    if (!loc.b) return [{ at: 'a', from: 0, to: 1 }];
    const t = frac(checkOutTime) ?? 0.25;
    push('a', 0, t); push('b', t, 1);
    return segs;
  }
  let start = 0;
  if (inbound) { const t = frac(inbound.arrTime) ?? 0.15; push('air', 0, t); start = t; }
  const leave = Math.max(start, frac(first.depTime) ?? 0.4);
  push('a', start, leave);
  if (last.arrDate && last.arrDate !== d) { push('air', leave, 1); return segs; }
  const land = Math.max(leave, frac(last.arrTime) ?? Math.min(1, leave + 0.15));
  push('air', leave, land);
  push(after, land, 1);
  return segs;
}

export interface DayEntry { item: Item; placement: Placement; pi: number }

export interface DayInfo {
  date: string;
  loc: DayLoc | null;
  /** Where you end the day (for colouring): tonight's stay, else the place you travel to, else where you are. */
  endLoc: LocRef | null;
  /** How the day splits between places, as fractions of the day (00:00 → 24:00), from flight times. */
  segments: DaySegment[];
  auto: { a: LocRef; b: LocRef | null } | null;
  tonight: Stay[];
  last: Stay[];
  dep: Flight[];
  arr: Flight[];
  plane: Flight | null;
  night: Night;
  entries: DayEntry[];
  notes: string;
  checkIns: Stay[];
  checkOuts: Stay[];
}

export interface OutsideEntry { kind: 'day' | 'flight' | 'stay' | 'item'; id?: string; date?: string; label: string }

export interface Stats {
  nights: number; booked: number; plane: number; none: number; tentative: number;
  unbooked: number; noLoc: number; flights: number; flightsBooked: number;
}

export interface Derived {
  dates: string[];
  info: Record<string, DayInfo>;
  flights: Flight[];
  stays: Stay[];
  overlaps: [Stay, Stay][];
  outside: OutsideEntry[];
  fit: { start: string; end: string } | null;
  uncovered: { from: string; to: string }[];
  colorOf: (l: LocRef | Location | string | null | undefined) => Swatch;
  locById: Map<string, Location>;
  known: string[];
  /** Locations in trip order (first day there), then any others. */
  locOrder: Location[];
  /** Trip days at each location (either end of a travel day counts). */
  locDays: Map<string, string[]>;
  stats: Stats;
}

const flightKey = (f: Flight) => `${f.depDate || '9999'} ${f.depTime || '99:99'}`;
export const flightSort = (a: Flight, b: Flight) => flightKey(a).localeCompare(flightKey(b));
export const flightLabel = (f: Flight) => [f.airline && !f.flightNo ? f.airline : '', f.flightNo].filter(Boolean).join(' ') || 'Flight';
export const nightsOf = (s: Stay) => (isDate(s.checkIn) && isDate(s.checkOut) ? Math.max(0, diffDays(s.checkIn, s.checkOut)) : 0);
const RANK = { booked: 0, planned: 1, idea: 2 } as const;
const byRank = (a: Stay, b: Stay) => RANK[a.status] - RANK[b.status];

export const sameLoc = (x: LocRef | null | undefined, y: LocRef | null | undefined) => {
  if (!x || !y) return false;
  if (x.id && y.id) return x.id === y.id;
  return norm(x.name) === norm(y.name);
};
export const locLabel = (l: { a: LocRef; b: LocRef | null } | null) => (l ? l.a.name + (l.b ? ' → ' + l.b.name : '') : '');

/** Context shared by derive() and locationOn(): sorted flights/stays and lookup helpers. */
function context(doc: TripDoc) {
  const locById = new Map(doc.locations.map((l) => [l.id, l]));
  const flights = [...doc.flights].sort(flightSort);
  const stays = [...doc.stays].sort((a, b) => (a.checkIn || '9').localeCompare(b.checkIn || '9'));
  const validStays = stays.filter((s) => isDate(s.checkIn) && isDate(s.checkOut) && s.checkIn < s.checkOut);
  const staysOn = (d: string) => validStays.filter((s) => s.checkIn <= d && d < s.checkOut);
  const ref = (id: string | undefined): LocRef | null => {
    const l = id ? locById.get(id) : undefined;
    return l ? { id: l.id, name: l.name } : null;
  };
  const code = (c: string): LocRef | null => (c.trim() ? { name: c.trim() } : null);

  function dayCore(d: string) {
    const tonight = staysOn(d).sort(byRank);
    const last = staysOn(addDays(d, -1)).sort(byRank);
    const dep = flights.filter((f) => f.depDate === d);
    const arr = flights.filter((f) => f.arrDate === d && f.depDate !== d);
    const plane = flights.find((f) => isDate(f.depDate) && isDate(f.arrDate) && f.depDate <= d && f.arrDate > d) || null;

    // Auto location: where I woke up → where I sleep, filled from flights on travel days.
    let from = ref(last[0]?.locationId);
    let to = ref(tonight[0]?.locationId);
    if (dep.length || arr.length) {
      if (!from && !arr.length && dep[0]) from = code(dep[0].from);
      if (!to) {
        const lf = dep.length ? dep[dep.length - 1] : arr[arr.length - 1];
        to = lf ? code(lf.to) : null;
      }
    } else if (!from && !to && !plane) {
      // No stay and no flight today: assume I'm still where my last flight landed,
      // unless a stay has checked out since that flight arrived.
      const landed = flights.filter((f) => isDate(f.arrDate) && f.arrDate < d && f.to.trim());
      const lastFlight = landed[landed.length - 1];
      if (lastFlight) {
        const lastCheckout = validStays.reduce((m, s) => (s.checkOut < d && s.checkOut > m ? s.checkOut : m), '');
        if (lastFlight.arrDate >= lastCheckout) to = code(lastFlight.to);
      }
    }
    let auto: DayInfo['auto'] = null;
    if (from && to && !sameLoc(from, to)) auto = { a: from, b: to };
    else if (to || from) auto = { a: (to || from)!, b: null };

    const dd = doc.days[d] || {};
    const ma = ref(dd.locationId);
    const loc: DayLoc | null = ma
      ? { a: ma, b: ref(dd.toLocationId), manual: true }
      : auto ? { ...auto, manual: false } : null;
    return { tonight, last, dep, arr, plane, auto, loc, dd };
  }

  return { locById, flights, stays, validStays, dayCore };
}

/** The location of any date (inside or outside the trip range). */
export function locationOn(doc: TripDoc, d: string): DayLoc | null {
  return context(doc).dayCore(d).loc;
}

export function derive(doc: TripDoc): Derived {
  const { start, end } = doc.trip;
  const dates = range(start, end);
  const inRange = (d: string) => isDate(d) && isDate(start) && isDate(end) && d >= start && d <= end;
  const { locById, flights, stays, validStays, dayCore } = context(doc);

  // Placements by date
  const byDate = new Map<string, DayEntry[]>();
  for (const item of doc.items)
    item.placements.forEach((placement, pi) => {
      const list = byDate.get(placement.date) || [];
      list.push({ item, placement, pi });
      byDate.set(placement.date, list);
    });

  const info: Record<string, DayInfo> = {};
  for (const d of dates) {
    const c = dayCore(d);
    let night: Night;
    if (d === end) night = { kind: 'end' };
    else if (c.tonight.length) night = { kind: c.tonight[0].status, stay: c.tonight[0], count: c.tonight.length };
    else if (c.plane) night = { kind: 'plane', flight: c.plane };
    else night = { kind: 'none' };

    const entries = (byDate.get(d) || []).sort(
      (p, q) => (p.placement.time || '99:99').localeCompare(q.placement.time || '99:99') || p.placement.order - q.placement.order,
    );
    const stayLoc = c.tonight[0]?.locationId ? locById.get(c.tonight[0].locationId) : undefined;
    const endLoc: LocRef | null = !c.loc ? null
      : stayLoc && (sameLoc(c.loc.a, { id: stayLoc.id, name: stayLoc.name }) || sameLoc(c.loc.b, { id: stayLoc.id, name: stayLoc.name })) ? { id: stayLoc.id, name: stayLoc.name }
      : c.loc.b?.id ? c.loc.b : c.loc.a.id ? c.loc.a : c.loc.b ?? c.loc.a;
    const lastOut = validStays.filter((s) => s.checkOut === d).map((s) => s.checkOutTime).filter(Boolean).sort().pop();
    info[d] = {
      date: d, loc: c.loc, endLoc, segments: daySegments(c.loc, c.dep, c.arr, d, lastOut), auto: c.auto, tonight: c.tonight, last: c.last, dep: c.dep, arr: c.arr, plane: c.plane,
      night, entries, notes: c.dd.notes || '',
      checkIns: validStays.filter((s) => s.checkIn === d),
      checkOuts: validStays.filter((s) => s.checkOut === d),
    };
  }

  // Stats
  const nights = Math.max(0, dates.length - 1);
  let booked = 0, plane = 0, none = 0, tentative = 0, noLoc = 0;
  for (const d of dates) {
    const n = info[d].night.kind;
    if (n === 'booked') booked++;
    else if (n === 'plane') plane++;
    else if (n === 'none') none++;
    else if (n === 'planned' || n === 'idea') tentative++;
    if (!info[d].loc) noLoc++;
  }
  const tripFlights = flights.filter((f) => inRange(f.depDate));
  const flightsBooked = tripFlights.filter((f) => f.status === 'booked').length;

  // Uncovered nights, grouped into runs
  const uncovered: { from: string; to: string }[] = [];
  for (const d of dates) {
    if (info[d].night.kind !== 'none') continue;
    const lastRun = uncovered[uncovered.length - 1];
    if (lastRun && addDays(lastRun.to, 1) === d) lastRun.to = d;
    else uncovered.push({ from: d, to: d });
  }

  // Overlapping stays
  const overlaps: [Stay, Stay][] = [];
  for (let i = 0; i < validStays.length; i++)
    for (let j = i + 1; j < validStays.length; j++) {
      const a = validStays[i], b = validStays[j];
      if (a.checkIn < b.checkOut && b.checkIn < a.checkOut) overlaps.push([a, b]);
    }

  // Anything outside the trip dates (never deleted, only flagged)
  const outside: OutsideEntry[] = [];
  const outsideDates: string[] = [];
  const name = (id?: string) => (id ? locById.get(id)?.name : undefined);
  for (const [d, v] of Object.entries(doc.days)) {
    if (inRange(d)) continue;
    const a = name(v.locationId), b = name(v.toLocationId);
    const bits = [a && `location “${a}${b ? ' → ' + b : ''}”`, v.notes && 'notes'].filter(Boolean);
    if (bits.length) { outside.push({ kind: 'day', date: d, label: `${fmtLong(d)}: ${bits.join(' + ')}` }); outsideDates.push(d); }
  }
  for (const f of flights) {
    if (!f.depDate) outside.push({ kind: 'flight', id: f.id, label: `${flightLabel(f)} has no departure date` });
    else if (!inRange(f.depDate)) {
      outside.push({ kind: 'flight', id: f.id, date: f.depDate, label: `Flight ${flightLabel(f)} ${f.from}→${f.to} on ${fmtLong(f.depDate)}` });
      outsideDates.push(f.depDate);
    }
  }
  for (const s of stays) {
    if (!isDate(s.checkIn) || !isDate(s.checkOut)) outside.push({ kind: 'stay', id: s.id, label: `Stay “${s.name || 'Untitled'}” is missing dates` });
    else if (!inRange(s.checkIn) || !inRange(s.checkOut)) {
      outside.push({ kind: 'stay', id: s.id, label: `Stay “${s.name || 'Untitled'}” ${fmtShort(s.checkIn)} → ${fmtShort(s.checkOut)}` });
      outsideDates.push(s.checkIn, s.checkOut);
    }
  }
  for (const i of doc.items)
    for (const p of i.placements)
      if (!inRange(p.date)) {
        outside.push({ kind: 'item', id: i.id, date: p.date, label: `“${i.title || 'Untitled'}” on ${fmtLong(p.date)}` });
        outsideDates.push(p.date);
      }
  const bounds = [...outsideDates, ...[start, end].filter(isDate)].sort();
  const fit = outsideDates.length ? { start: bounds[0], end: bounds[bounds.length - 1] } : null;

  // Colours: assigned in trip order (hash of the name as seed, so v1 colours carry over).
  const order: Location[] = [];
  const seen = new Set<string>();
  const push = (id?: string) => {
    const l = id ? locById.get(id) : undefined;
    if (l && !seen.has(l.id)) { seen.add(l.id); order.push(l); }
  };
  for (const d of dates) { push(info[d].loc?.a.id); push(info[d].loc?.b?.id); }
  for (const s of stays) push(s.locationId);
  for (const v of Object.values(doc.days)) { push(v.locationId); push(v.toLocationId); }
  for (const l of doc.locations) push(l.id);
  const hues = assignColors(order.filter((l) => !isAirport(l.name)).map((l) => ({ key: l.id, fixed: l.colorIndex })));
  const colorOf = (l: LocRef | Location | string | null | undefined): Swatch => {
    if (!l) return NEUTRAL;
    const r = typeof l === 'string' ? { id: locById.has(l) ? l : undefined, name: locById.get(l)?.name ?? l } : l;
    if (isAirport(r.name)) return NEUTRAL;
    const idx = r.id != null ? hues.get(r.id) : undefined;
    return swatchAt(idx ?? hash(norm(r.name)) % PALETTE.length);
  };

  const known = [...new Set(doc.locations.map((l) => l.name))].sort((a, b) => a.localeCompare(b));

  const locDays = new Map<string, string[]>();
  for (const d of dates)
    for (const r of [info[d].loc?.a, info[d].loc?.b]) {
      if (!r?.id) continue;
      const l = locDays.get(r.id) || [];
      if (l[l.length - 1] !== d) l.push(d);
      locDays.set(r.id, l);
    }
  const first = (id: string) => locDays.get(id)?.[0] ?? '9999';
  const locOrder = [...doc.locations].sort((a, b) => first(a.id).localeCompare(first(b.id)) || order.indexOf(a) - order.indexOf(b));

  return {
    dates, info, flights, stays, overlaps, outside, fit, uncovered, colorOf, locById, known, locOrder, locDays,
    stats: { nights, booked, plane, none, tentative, unbooked: nights - booked - plane, noLoc, flights: tripFlights.length, flightsBooked },
  };
}
