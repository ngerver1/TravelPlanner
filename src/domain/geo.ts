// What goes on the map: ideas and stays with a position, filtered by day or location; and a day's route.
import type { Derived } from './derive';
import { dayStops } from './plan';
import type { Item, LocalText, Place, Stay, TripDoc } from './types';
import { airportQuery, placeQuery } from './maps';
import { cardFor, type LocalCardData } from './local';

export interface MapPoint {
  key: string; kind: 'item' | 'stay'; lat: number; lng: number; title: string;
  locationId?: string; placed: boolean; number?: number;
  ref: { type: 'item'; item: Item; pi: number } | { type: 'stay'; stay: Stay };
}
export type MapFilter = { by: 'all' } | { by: 'day'; date: string } | { by: 'location'; id: string };

export const hasPos = (p?: Place): p is Place & { lat: number; lng: number } => p?.lat != null && p?.lng != null;

export function mapPoints(doc: TripDoc, f: MapFilter): { points: MapPoint[]; missing: (Item | Stay)[] } {
  const points: MapPoint[] = [], missing: (Item | Stay)[] = [];
  const itemIn = (i: Item) => f.by === 'all' || (f.by === 'location' ? i.locationId === f.id : i.placements.some((p) => p.date === f.date));
  const stayIn = (s: Stay) => f.by === 'all' || (f.by === 'location' ? s.locationId === f.id : s.checkIn <= f.date && f.date <= s.checkOut);
  for (const s of doc.stays) {
    if (!stayIn(s)) continue;
    if (hasPos(s.place)) points.push({ key: 's' + s.id, kind: 'stay', lat: s.place.lat, lng: s.place.lng, title: s.name || 'Stay', locationId: s.locationId, placed: true, ref: { type: 'stay', stay: s } });
    else missing.push(s);
  }
  for (const i of doc.items) {
    if (!itemIn(i)) continue;
    const pi = f.by === 'day' ? i.placements.findIndex((p) => p.date === f.date) : i.placements.length ? 0 : -1;
    if (hasPos(i.place)) points.push({ key: 'i' + i.id, kind: 'item', lat: i.place.lat, lng: i.place.lng, title: i.title, locationId: i.locationId, placed: i.placements.length > 0, ref: { type: 'item', item: i, pi } });
    else missing.push(i);
  }
  return { points, missing };
}

/** A day's route: last night's stay → stops in day order → tonight's stay; only those with a position, numbered. */
export function dayRoute(doc: TripDoc, dv: Derived, date: string): MapPoint[] {
  const x = dv.info[date];
  if (!x) return [];
  const out: MapPoint[] = [];
  const stay = (s: Stay | undefined, key: string) => {
    if (s && hasPos(s.place)) out.push({ key, kind: 'stay', lat: s.place.lat, lng: s.place.lng, title: s.name || 'Stay', locationId: s.locationId, placed: true, ref: { type: 'stay', stay: s } });
  };
  stay(x.last[0], 'start');
  let n = 0;
  for (const e of dayStops(doc, date)) {
    if (!hasPos(e.item.place)) continue;
    out.push({ key: 'i' + e.item.id + e.pi, kind: 'item', lat: e.item.place.lat, lng: e.item.place.lng, title: e.item.title, locationId: e.item.locationId, placed: true, number: ++n, ref: { type: 'item', item: e.item, pi: e.pi } });
  }
  if (x.tonight[0] && x.tonight[0].id !== x.last[0]?.id) stay(x.tonight[0], 'end');
  else if (x.tonight[0] && out.length && out[0].key === 'start') stay(x.tonight[0], 'end'); // back to the same hotel
  return out;
}

/**
 * The day as places to go through, for Google Maps (by name, so no map positions are needed):
 * start = arrival airport / transport stop if you arrive today, else last night's stay;
 * then the day's stops in order; end = departure airport / transport stop if you leave today, else tonight's stay.
 */
export interface RoutePoint { label: string; query: string; kind: 'start' | 'stop' | 'end'; local?: LocalCardData }

const localOf = (english: string, local: LocalText | undefined, phone: string | undefined, place: Place | undefined, context: string) => {
  const card = cardFor(english, local, { phone, pos: hasPos(place) ? { lat: place.lat, lng: place.lng } : null, context });
  return card ? { local: card } : {};
};

/** The day as an ordered list of places (label for display, query for Google Maps). See dayRouteQueries. */
export function dayRoutePoints(doc: TripDoc, dv: Derived, date: string): RoutePoint[] {
  const x = dv.info[date];
  if (!x) return [];
  const area = (id?: string) => (id ? dv.locById.get(id)?.name : undefined);
  const stayPt = (s: Stay | undefined, kind: RoutePoint['kind']): RoutePoint | undefined =>
    s ? { label: s.name || 'Hotel', query: placeQuery(s.place ?? { name: s.name, address: s.address }, s.name || 'Hotel', area(s.locationId)), kind, ...localOf(s.name || 'Hotel', s.local, s.phone, s.place, `${s.address} ${area(s.locationId) || ''}`) } : undefined;
  const airport = (code: string, kind: RoutePoint['kind']): RoutePoint => ({ label: `${code} airport`, query: airportQuery(code), kind });
  const legPt = (name: string, locId: string | undefined, kind: RoutePoint['kind'], local?: LocalText): RoutePoint | undefined => {
    const q = name ? [name, area(locId)].filter(Boolean).join(', ') : area(locId);
    return q ? { label: name || area(locId)!, query: q, kind, ...localOf(name || area(locId)!, local, undefined, undefined, area(locId) || '') } : undefined;
  };
  const stops: RoutePoint[] = dayStops(doc, date).map((e) => ({ label: e.item.title || 'Untitled', query: placeQuery(e.item.place, e.item.title, area(e.item.locationId)), kind: 'stop',
    ...localOf(e.item.place?.name || e.item.title, e.item.local, e.item.phone, e.item.place, `${e.item.place?.address || ''} ${area(e.item.locationId) || ''}`) }));
  const arrLeg = x.legArr.find((l) => !l.itemId);
  const depLeg = x.legDep.find((l) => !l.itemId);
  // A flight that lands the same day: the day's plans happen after landing, so start at the arrival airport.
  // One that lands on a later day (overnight): the day ends at the departure airport.
  const landsToday = x.dep.filter((f) => f.arrDate === date).pop();
  const leavesTonight = x.dep.find((f) => f.arrDate && f.arrDate > date);
  const origin = landsToday?.to ? airport(landsToday.to, 'start') : x.arr[0]?.to ? airport(x.arr[0].to, 'start')
    : arrLeg ? legPt(arrLeg.toName, arrLeg.toLocationId, 'start', arrLeg.toLocal) : stayPt(x.last[0], 'start');
  const destination = leavesTonight?.from ? airport(leavesTonight.from, 'end')
    : depLeg ? legPt(depLeg.fromName, depLeg.fromLocationId, 'end', depLeg.fromLocal) : stayPt(x.tonight[0], 'end');
  if (!stops.length && !(origin && destination && origin.query !== destination.query)) return [];
  return [origin, ...stops, destination].filter((p): p is RoutePoint => !!p);
}

/**
 * The day as places to go through, for Google Maps (by name, so no map positions are needed):
 * start = arrival airport / transport stop if you arrive today, else last night's stay;
 * then the day's stops in order; end = departure airport / transport stop if you leave today, else tonight's stay.
 */
export function dayRouteQueries(doc: TripDoc, dv: Derived, date: string): { origin?: string; stops: string[]; destination?: string } | null {
  const pts = dayRoutePoints(doc, dv, date);
  if (!pts.length) return null;
  return {
    origin: pts.find((p) => p.kind === 'start')?.query,
    stops: pts.filter((p) => p.kind === 'stop').map((p) => p.query),
    destination: pts.find((p) => p.kind === 'end')?.query,
  };
}
