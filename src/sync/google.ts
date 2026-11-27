// Google Maps Platform with your own key: the map with pins, place search ("Find on map") and local-language
// names ("Get local name"). The key is saved with the trip (so it syncs through the Gist to your other devices,
// by your choice); a key saved on a device only still wins on that device. Only used when you open the Map or
// tap a button: nothing runs in the background.
import { GOOGLE_LANG, localFromGoogle, type LocalLang } from '../domain/local';
import type { LocalText } from '../domain/types';
/** A place found by Find on map. */
export interface GeoResult { name: string; address: string; lat: number; lng: number; placeId?: string }

const KEY = 'tripPlanner.googleKey';
/** A key saved on this device only (how it worked before keys synced). */
export function deviceGoogleKey(): string { try { return (localStorage.getItem(KEY) || '').trim(); } catch { return ''; } }
export function clearDeviceGoogleKey() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
let tripKey = '';
/** The key saved with the trip (set by the app whenever the trip changes). */
export function setTripGoogleKey(k: string | undefined) { tripKey = (k || '').trim(); }
/** The key in use: this device's own, else the trip's. */
export const getGoogleKey = () => deviceGoogleKey() || tripKey;
export const googleKeySource = (): 'device' | 'trip' | '' => (deviceGoogleKey() ? 'device' : tripKey ? 'trip' : '');
export const hasGoogle = () => !!getGoogleKey();

type W = Window & { gm_authFailure?: () => void; __tpMapsReady?: () => void };
let loading: Promise<void> | null = null;
let authError = '';
/** Google turned the key down (wrong key, API not enabled, or this site not allowed). */
export const googleAuthError = () => authError;

/** Load the Maps JavaScript API once, with the saved key. */
export function loadGoogle(): Promise<void> {
  if (loading) return loading;
  const key = getGoogleKey();
  if (!key) return Promise.reject(new Error('No Google Maps key. Add one in Settings.'));
  loading = new Promise<void>((resolve, reject) => {
    const w = window as W;
    w.gm_authFailure = () => {
      authError = 'Google refused the key. Check it in Settings, that the Maps JavaScript and Places APIs are enabled, and that this site is allowed.';
      window.dispatchEvent(new Event('google-auth-failed'));
    };
    w.__tpMapsReady = () => resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, v: 'weekly', loading: 'async', callback: '__tpMapsReady', language: 'en' })}`;
    s.async = true;
    s.onerror = () => { loading = null; s.remove(); reject(new Error('Couldn’t load Google Maps. Check your connection.')); };
    document.head.appendChild(s);
  });
  return loading;
}

const places = async () => { await loadGoogle(); return google.maps.importLibrary('places') as Promise<google.maps.PlacesLibrary>; };
const bias = (near?: { lat: number; lng: number } | null) => (near ? { locationBias: { center: near, radius: 3000 } } : {});
const fail = (e: unknown) => new Error(authError || (e instanceof Error ? e.message : 'Google search failed'));

/** "Find on map": up to five places for a search (one Places Text Search request). */
export async function searchPlaces(query: string, near?: { lat: number; lng: number } | null): Promise<GeoResult[]> {
  try {
    const { Place } = await places();
    const { places: list } = await Place.searchByText({ textQuery: query, fields: ['id', 'displayName', 'formattedAddress', 'location'], maxResultCount: 5, ...bias(near) });
    return list.filter((p) => p.location).map((p) => ({ name: p.displayName || '', address: p.formattedAddress || '', lat: p.location!.lat(), lng: p.location!.lng(), placeId: p.id }));
  } catch (e) { throw fail(e); }
}

/**
 * "Get local name": the place's name and address in the local language, as Google has them. With a saved
 * Google place, one Place Details request; otherwise one search by name. Nothing is translated by us.
 */
export async function localFromGooglePlaces(q: { placeId?: string; query: string; near?: { lat: number; lng: number } | null }, lang: LocalLang): Promise<{ local?: LocalText; placeId?: string; found: boolean }> {
  try {
    const { Place } = await places();
    const language = GOOGLE_LANG[lang];
    if (q.placeId) {
      const p = new Place({ id: q.placeId, requestedLanguage: language });
      await p.fetchFields({ fields: ['displayName', 'formattedAddress'] });
      return { local: localFromGoogle({ name: p.displayName ?? undefined, address: p.formattedAddress ?? undefined }), placeId: q.placeId, found: true };
    }
    const { places: list } = await Place.searchByText({ textQuery: q.query, language, fields: ['id', 'displayName', 'formattedAddress'], maxResultCount: 1, ...bias(q.near) });
    const p = list[0];
    return p ? { local: localFromGoogle({ name: p.displayName ?? undefined, address: p.formattedAddress ?? undefined }), placeId: p.id, found: true } : { found: false };
  } catch (e) { throw fail(e); }
}

/** Settings → Test: one search, to see the key works from this site. */
export async function testGoogleKey(): Promise<string> {
  const r = await searchPlaces('Tokyo Station');
  return r.length ? `Works: found ${r[0].name}.` : 'The key loaded, but the search found nothing.';
}
