// Weather from Open-Meteo (free, no key): reading its answer, and naming the weather codes.
// https://open-meteo.com/en/docs : daily and hourly forecasts up to 16 days, times in the place's own time zone.
import type { TripDoc } from './types';

export interface DayWx { code: number; max: number; min: number; pop: number | null; rain: number; snow: number }
export interface HourWx { time: string; temp: number; pop: number | null; code: number }
export interface Forecast { fetchedAt: number; lat: number; lng: number; daily: Record<string, DayWx>; hourly: Record<string, HourWx[]> }

export type WxIcon = 'sun' | 'cloudsun' | 'cloud' | 'fog' | 'rain' | 'snow' | 'thunder';
/** WMO weather codes, as Open-Meteo returns them. */
export function describe(code: number): { label: string; icon: WxIcon; snowy: boolean } {
  if (code === 0) return { label: 'Clear', icon: 'sun', snowy: false };
  if (code <= 2) return { label: code === 1 ? 'Mostly clear' : 'Partly cloudy', icon: 'cloudsun', snowy: false };
  if (code === 3) return { label: 'Cloudy', icon: 'cloud', snowy: false };
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'fog', snowy: false };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'rain', snowy: false };
  if (code >= 61 && code <= 67) return { label: code >= 66 ? 'Freezing rain' : 'Rain', icon: 'rain', snowy: false };
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: 'snow', snowy: true };
  if (code >= 80 && code <= 82) return { label: 'Showers', icon: 'rain', snowy: false };
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: 'snow', snowy: true };
  if (code >= 95) return { label: 'Thunderstorms', icon: 'thunder', snowy: false };
  return { label: 'Weather', icon: 'cloud', snowy: false };
}

type Raw = { latitude?: number; longitude?: number; daily?: Record<string, unknown[]>; hourly?: Record<string, unknown[]> };
const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);

/** One location's forecast from Open-Meteo's answer. Hourly is kept for the first three days only. */
export function readForecast(raw: Raw, fetchedAt: number): Forecast | null {
  const d = raw.daily, h = raw.hourly;
  if (!d || !Array.isArray(d.time) || raw.latitude == null || raw.longitude == null) return null;
  const daily: Record<string, DayWx> = {};
  d.time.forEach((t, i) => {
    const max = n(d.temperature_2m_max?.[i]), min = n(d.temperature_2m_min?.[i]), code = n(d.weather_code?.[i]);
    if (typeof t !== 'string' || max == null || min == null || code == null) return;
    daily[t] = { code, max, min, pop: n(d.precipitation_probability_max?.[i]), rain: n(d.precipitation_sum?.[i]) ?? 0, snow: n(d.snowfall_sum?.[i]) ?? 0 };
  });
  const hourly: Record<string, HourWx[]> = {};
  const days = Object.keys(daily).sort().slice(0, 3);
  (h?.time || []).forEach((t, i) => {
    if (typeof t !== 'string') return;
    const date = t.slice(0, 10);
    if (!days.includes(date)) return;
    const temp = n(h!.temperature_2m?.[i]), code = n(h!.weather_code?.[i]);
    if (temp == null || code == null) return;
    (hourly[date] ||= []).push({ time: t.slice(11, 16), temp, pop: n(h!.precipitation_probability?.[i]), code });
  });
  return { fetchedAt, lat: raw.latitude, lng: raw.longitude, daily, hourly };
}

/** The forecast URL for several places at once. */
export function forecastUrl(points: { lat: number; lng: number }[]): string {
  const r = (x: number) => x.toFixed(3);
  return `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
    latitude: points.map((p) => r(p.lat)).join(','), longitude: points.map((p) => r(p.lng)).join(','),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,snowfall_sum',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    timezone: 'auto', forecast_days: '16',
  })}`;
}

/**
 * Where a place is, for its weather: its own map position, else the first stay there with one, else the
 * first idea there with one. Undefined: look the name up instead.
 */
export function placePosition(doc: TripDoc, locId: string): { lat: number; lng: number } | undefined {
  const has = (p?: { lat?: number; lng?: number }) => (p?.lat != null && p?.lng != null ? { lat: p.lat, lng: p.lng } : undefined);
  const loc = doc.locations.find((l) => l.id === locId);
  return has(loc?.place) ?? doc.stays.filter((s) => s.locationId === locId).map((s) => has(s.place)).find(Boolean)
    ?? doc.items.filter((i) => i.locationId === locId).map((i) => has(i.place)).find(Boolean);
}

/** "−3° / −11°" */
export const temps = (w: DayWx) => `${Math.round(w.max)}° / ${Math.round(w.min)}°`;
/** "Snow 80% · 12 cm", "Rain 40% · 5 mm", or '' for a dry day. */
export function wetness(w: DayWx): string {
  const snowy = w.snow > 0 || describe(w.code).snowy;
  const amount = snowy ? (w.snow >= 0.5 ? `${Math.round(w.snow)} cm` : '') : w.rain >= 0.5 ? `${Math.round(w.rain)} mm` : '';
  const wetCode = ['rain', 'snow', 'thunder'].includes(describe(w.code).icon);
  if (w.pop == null || (w.pop < (wetCode ? 10 : 20) && !amount)) return '';
  return [`${snowy ? 'Snow' : 'Rain'} ${w.pop}%`, amount].filter(Boolean).join(' · ');
}
