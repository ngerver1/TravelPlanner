// Fetches forecasts from Open-Meteo (free, no key) when a weather view is on screen, at most every few hours,
// and keeps the last one on this device so it still shows offline. Nothing else is sent: just positions.
import { useEffect, useSyncExternalStore } from 'react';
import { forecastUrl, placePosition, readForecast, type Forecast } from '../domain/weather';
import type { TripDoc } from '../domain/types';

const STORE = 'tripPlanner.weather';
const GEO = 'tripPlanner.weatherPlaces';
const FRESH = 3 * 60 * 60 * 1000;

type Cache = Record<string, Forecast>; // by location id
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') as T; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

let cache: Cache = read<Cache>(STORE, {});
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
let busy = false;

/** A place without a map position: look its name up once (Open-Meteo's free place search). */
async function lookUp(name: string): Promise<{ lat: number; lng: number } | null> {
  const known = read<Record<string, { lat: number; lng: number } | null>>(GEO, {});
  if (name in known) return known[name];
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: '1', language: 'en', format: 'json' })}`);
  if (!res.ok) throw new Error('lookup failed');
  const r = ((await res.json()) as { results?: { latitude: number; longitude: number }[] }).results?.[0];
  const pos = r ? { lat: r.latitude, lng: r.longitude } : null;
  write(GEO, { ...known, [name]: pos });
  return pos;
}

const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.abs(a.lat - b.lat) < 0.02 && Math.abs(a.lng - b.lng) < 0.02;

/** Refresh the forecasts for these places if they're missing, old, or the place has moved. */
export async function refreshWeather(doc: TripDoc, locIds: string[]) {
  if (busy || !navigator.onLine) return;
  busy = true;
  try {
    const want: { id: string; lat: number; lng: number }[] = [];
    for (const id of new Set(locIds)) {
      const loc = doc.locations.find((l) => l.id === id);
      if (!loc) continue;
      const pos = placePosition(doc, id) ?? (await lookUp(loc.name).catch(() => null));
      if (!pos) continue;
      const have = cache[id];
      if (!have || Date.now() - have.fetchedAt > FRESH || !near(have, pos)) want.push({ id, ...pos });
    }
    if (!want.length) return;
    const res = await fetch(forecastUrl(want));
    if (!res.ok) return;
    const body = await res.json();
    const list = Array.isArray(body) ? body : [body];
    const now = Date.now();
    const next = { ...cache };
    want.forEach((w, i) => { const f = list[i] && readForecast(list[i], now); if (f) next[w.id] = { ...f, lat: w.lat, lng: w.lng }; });
    // Keep only places still in the trip.
    for (const k of Object.keys(next)) if (!doc.locations.some((l) => l.id === k)) delete next[k];
    cache = next; write(STORE, cache); emit();
  } catch { /* offline or the service is down: keep what we have */ } finally { busy = false; }
}

/** Forecasts for these places (from this device), refreshed in the background when due. */
export function useWeather(doc: TripDoc, locIds: string[]): Cache {
  const snap = useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => cache);
  const key = [...new Set(locIds)].sort().join(',');
  useEffect(() => {
    if (!key) return;
    const go = () => refreshWeather(doc, key.split(','));
    go();
    const vis = () => { if (document.visibilityState === 'visible') go(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', go);
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', go); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return snap;
}
