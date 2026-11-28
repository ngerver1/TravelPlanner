import { describe as group, expect, it } from 'vitest';
import { describe, forecastUrl, placePosition, readForecast, temps, wetness } from './weather';
import { normalizeDoc } from './normalize';

group('weather', () => {
  const raw = {
    latitude: 42.75, longitude: 140.9,
    daily: { time: ['2027-01-25', '2027-01-26', '2027-01-27', '2027-01-28'], weather_code: [73, 3, 0, 61], temperature_2m_max: [-2.6, -1, 1, 4], temperature_2m_min: [-11.4, -9, -8, 0],
      precipitation_probability_max: [85, 20, 0, 60], precipitation_sum: [9, 0.2, 0, 6.4], snowfall_sum: [12.6, 0, 0, 0] },
    hourly: { time: ['2027-01-25T00:00', '2027-01-25T01:00', '2027-01-28T00:00'], temperature_2m: [-9, -9.5, 1], precipitation_probability: [80, 70, 50], weather_code: [73, 71, 61] },
  };
  it('reads the forecast, keeping hourly for the first three days', () => {
    const f = readForecast(raw, 1)!;
    expect(f.daily['2027-01-25']).toEqual({ code: 73, max: -2.6, min: -11.4, pop: 85, rain: 9, snow: 12.6 });
    expect(f.hourly['2027-01-25']).toEqual([{ time: '00:00', temp: -9, pop: 80, code: 73 }, { time: '01:00', temp: -9.5, pop: 70, code: 71 }]);
    expect(f.hourly['2027-01-28']).toBeUndefined();
    expect(readForecast({}, 1)).toBeNull();
  });
  it('names the weather and the wet part', () => {
    expect(describe(73)).toMatchObject({ label: 'Snow', icon: 'snow' });
    expect(describe(2).icon).toBe('cloudsun');
    expect(describe(95).label).toBe('Thunderstorms');
    const f = readForecast(raw, 1)!;
    expect(temps(f.daily['2027-01-25'])).toBe('-3° / -11°');
    expect(wetness(f.daily['2027-01-25'])).toBe('Snow 85% · 13 cm');
    expect(wetness(f.daily['2027-01-27'])).toBe('');
    expect(wetness(f.daily['2027-01-28'])).toBe('Rain 60% · 6 mm');
  });
  it('asks for several places in one request', () => {
    const u = new URL(forecastUrl([{ lat: 42.7512, lng: 140.9 }, { lat: 22.3, lng: 114.17 }]));
    expect(u.host).toBe('api.open-meteo.com');
    expect(u.searchParams.get('latitude')).toBe('42.751,22.300');
    expect(u.searchParams.get('timezone')).toBe('auto');
  });
  it('finds a place’s position from the place, its hotel, or an idea there', () => {
    const doc = normalizeDoc({ locations: [{ id: 'a', name: 'Rusutsu' }, { id: 'b', name: 'Tokyo', place: { name: 'Tokyo', lat: 35.7, lng: 139.7 } }, { id: 'c', name: 'Nowhere' }],
      stays: [{ id: 's', name: 'Westin', locationId: 'a', place: { name: 'Westin', lat: 42.75, lng: 140.9 } }] });
    expect(placePosition(doc, 'a')).toEqual({ lat: 42.75, lng: 140.9 });
    expect(placePosition(doc, 'b')).toEqual({ lat: 35.7, lng: 139.7 });
    expect(placePosition(doc, 'c')).toBeUndefined();
  });
});
