// Find a place's position with OpenStreetMap's Nominatim search (free, no key). Used only when you press
// "Find on map" (their usage policy allows occasional searches, not search-as-you-type).
export interface GeoResult { name: string; address: string; lat: number; lng: number }

export async function geocode(query: string): Promise<GeoResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: 'jsonv2', limit: '6', 'accept-language': 'en' })}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const list = await res.json() as { name?: string; display_name: string; lat: string; lon: string }[];
  return list.map((r) => ({ name: r.name || r.display_name.split(',')[0], address: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
}

import type { NominatimResult } from '../domain/local';
export type Pos2 = { lat: number; lng: number };
/**
 * One OpenStreetMap lookup for a place's local-language name and address (asked for in `lang`): by name
 * (near the map position if there is one), or by the map position alone. One request per tap, never automatic.
 */
export async function lookupLocal(q: { name: string; near?: Pos2 | null } | { pos: Pos2 }, lang: string): Promise<NominatimResult | null> {
  const common = { format: 'jsonv2', addressdetails: '1', namedetails: '1', 'accept-language': lang };
  let url: string;
  if ('pos' in q) url = `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ ...common, lat: String(q.pos.lat), lon: String(q.pos.lng), zoom: '18' })}`;
  else {
    const p = new URLSearchParams({ ...common, q: q.name, limit: '1' });
    if (q.near) { const d = 0.02; p.set('viewbox', `${q.near.lng - d},${q.near.lat + d},${q.near.lng + d},${q.near.lat - d}`); p.set('bounded', '1'); }
    url = `https://nominatim.openstreetmap.org/search?${p}`;
  }
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json() as NominatimResult | NominatimResult[] | { error?: string };
  const r = Array.isArray(data) ? data[0] : data;
  return r && !('error' in r) ? (r as NominatimResult) : null;
}
