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
