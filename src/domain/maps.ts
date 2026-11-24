// Google Maps links (free, no API key): reading pasted links, search links and day directions.
// URL format: https://developers.google.com/maps/documentation/urls/get-started
import type { Place } from './types';

const num = (s: string | undefined) => (s != null && s !== '' && isFinite(Number(s)) ? Number(s) : undefined);
const validLL = (lat?: number, lng?: number) => lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const isMapsHost = (h: string) => /(^|\.)google\.[a-z.]+$/.test(h) || h === 'maps.app.goo.gl' || h === 'goo.gl' || h === 'g.co';

/**
 * Read what we can from a Google Maps link: place name, coordinates, place id.
 * Short links (maps.app.goo.gl) can't be expanded from the browser; they're kept as the link only.
 */
export function parseMapsUrl(raw: string): (Partial<Place> & { mapsUrl: string }) | null {
  const text = raw.trim();
  const m = text.match(/https?:\/\/\S+/);
  if (!m) return null;
  let u: URL;
  try { u = new URL(m[0]); } catch { return null; }
  if (!isMapsHost(u.hostname)) return null;
  const out: Partial<Place> & { mapsUrl: string } = { mapsUrl: u.toString() };
  const path = decodeURIComponent(u.pathname.replace(/\+/g, ' '));
  const place = path.match(/\/place\/([^/]+)/);
  if (place && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(place[1])) out.name = place[1].trim();
  // Exact pin (!3d lat !4d lng) beats the map centre (@lat,lng).
  const pin = u.toString().match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const at = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const q = u.searchParams.get('query') ?? u.searchParams.get('q') ?? u.searchParams.get('ll') ?? u.searchParams.get('destination');
  const qll = q?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  const ll = pin ? [pin[1], pin[2]] : qll ? [qll[1], qll[2]] : at ? [at[1], at[2]] : null;
  if (ll) { const lat = num(ll[0]), lng = num(ll[1]); if (validLL(lat, lng)) { out.lat = lat; out.lng = lng; } }
  if (q && !qll && !out.name) out.name = q.trim();
  const pid = u.searchParams.get('query_place_id') ?? u.searchParams.get('place_id');
  if (pid) out.googlePlaceId = pid;
  return out;
}

/** What to search for: exact coordinates, else the place name/address plus the city. */
export function placeQuery(place: Place | undefined, title: string, area?: string): string {
  if (place && validLL(place.lat, place.lng)) return `${place.lat},${place.lng}`;
  const name = place?.name || title;
  const bits = [name, place?.address, area && !(place?.address || '').toLowerCase().includes(area.toLowerCase()) ? area : ''].filter(Boolean);
  return bits.join(', ');
}

/** "Open in Google Maps": the pasted link if there is one, else a search. */
export function mapsLink(place: Place | undefined, title: string, area?: string): string {
  if (place?.mapsUrl) return place.mapsUrl;
  const p = new URLSearchParams({ api: '1', query: placeQuery(place, title, area) });
  if (place?.googlePlaceId) p.set('query_place_id', place.googlePlaceId);
  return `https://www.google.com/maps/search/?${p}`;
}

/** Most waypoints a Maps directions link accepts. */
export const MAX_WAYPOINTS = 9;

/** Directions through a day's stops. With no origin, Google Maps starts from where you are. */
export function directionsLink(stops: string[], origin?: string, destination?: string, mode?: 'transit' | 'walking' | 'driving'): string | null {
  const list = stops.filter(Boolean);
  const dest = destination || list[list.length - 1];
  if (!dest) return null;
  const ways = (destination ? list : list.slice(0, -1)).filter((s) => s !== origin && s !== dest).slice(0, MAX_WAYPOINTS);
  const p = new URLSearchParams({ api: '1', destination: dest });
  if (origin) p.set('origin', origin);
  if (ways.length) p.set('waypoints', ways.join('|'));
  if (mode) p.set('travelmode', mode);
  return `https://www.google.com/maps/dir/?${p}`;
}

// ---------- Google Maps embeds (no key: the classic maps.google.com embed) ----------
const G = 'https://maps.google.com/maps';
/** Embedded Google map of one place (a search, or exact coordinates). */
export function embedPlace(query: string, zoom = 15): string {
  return `${G}?${new URLSearchParams({ q: query, z: String(zoom), output: 'embed' })}`;
}
/** Embedded Google map with directions: origin → stops → destination (" to:" joins the stops). */
export function embedDirections(points: string[], mode?: 'transit' | 'walking' | 'driving'): string | null {
  const list = points.filter(Boolean);
  if (list.length < 2) return list.length ? embedPlace(list[0]) : null;
  const p = new URLSearchParams({ saddr: list[0], daddr: list.slice(1).join(' to:'), output: 'embed' });
  if (mode) p.set('dirflg', mode === 'transit' ? 'r' : mode === 'walking' ? 'w' : 'd');
  return `${G}?${p}`;
}
/** What to search for an airport code. */
export const airportQuery = (code: string) => `${code.trim().toUpperCase()} airport`;
