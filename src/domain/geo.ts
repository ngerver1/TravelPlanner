// What goes on the map: ideas and stays with a position, filtered by day or location; and a day's route.
import type { Derived } from './derive';
import { dayStops } from './plan';
import type { Item, Place, Stay, TripDoc } from './types';

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
