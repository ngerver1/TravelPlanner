import { describe, it, expect } from 'vitest';
import { directionsLink, mapsLink, parseMapsUrl, placeQuery } from './maps';

describe('reading Google Maps links', () => {
  it('takes the name and exact pin from a place link', () => {
    const r = parseMapsUrl('https://www.google.com/maps/place/Senso-ji+Temple/@35.7147651,139.7966553,17z/data=!3m1!4b1!4m6!3m5!1s0x60188ec1!8m2!3d35.7148!4d139.7967!16zL20vMDNsNXJ6');
    expect(r).toMatchObject({ name: 'Senso-ji Temple', lat: 35.7148, lng: 139.7967 });
    expect(r!.mapsUrl).toContain('google.com/maps/place');
  });
  it('falls back to the map centre, reads q= and place ids', () => {
    expect(parseMapsUrl('https://www.google.com/maps/@22.2783,114.1747,15z')).toMatchObject({ lat: 22.2783, lng: 114.1747 });
    expect(parseMapsUrl('https://maps.google.com/?q=43.0621,141.3544')).toMatchObject({ lat: 43.0621, lng: 141.3544 });
    expect(parseMapsUrl('https://www.google.com/maps/search/?api=1&query=Ichiran+Shibuya&query_place_id=ChIJabc')).toMatchObject({ name: 'Ichiran Shibuya', googlePlaceId: 'ChIJabc' });
  });
  it('keeps short share links as links only, and finds a link inside shared text', () => {
    expect(parseMapsUrl('Rusutsu Resort https://maps.app.goo.gl/AbCdEf123')).toEqual({ mapsUrl: 'https://maps.app.goo.gl/AbCdEf123' });
  });
  it('ignores things that are not Google Maps links', () => {
    expect(parseMapsUrl('Senso-ji')).toBeNull();
    expect(parseMapsUrl('https://example.com/maps/place/x')).toBeNull();
  });
});

describe('making links', () => {
  it('searches by name and city, or exact coordinates', () => {
    expect(placeQuery(undefined, 'Ichiran', 'Tokyo')).toBe('Ichiran, Tokyo');
    expect(placeQuery({ name: 'Ichiran', address: '1-22-7 Jinnan, Shibuya, Tokyo' }, 'x', 'Tokyo')).toBe('Ichiran, 1-22-7 Jinnan, Shibuya, Tokyo');
    expect(placeQuery({ name: 'X', lat: 1.5, lng: 2.5 }, 'x')).toBe('1.5,2.5');
    expect(mapsLink(undefined, 'Senso-ji', 'Tokyo')).toBe('https://www.google.com/maps/search/?api=1&query=Senso-ji%2C+Tokyo');
    expect(mapsLink({ name: 'a', mapsUrl: 'https://maps.app.goo.gl/x' }, 'a')).toBe('https://maps.app.goo.gl/x');
  });
  it('builds day directions from hotel through stops back to hotel', () => {
    const url = new URL(directionsLink(['A, Tokyo', 'B, Tokyo'], 'Hotel, Tokyo', 'Hotel, Tokyo')!);
    expect(url.pathname).toBe('/maps/dir/');
    expect(url.searchParams.get('origin')).toBe('Hotel, Tokyo');
    expect(url.searchParams.get('destination')).toBe('Hotel, Tokyo');
    expect(url.searchParams.get('waypoints')).toBe('A, Tokyo|B, Tokyo');
  });
  it('without a hotel, ends at the last stop and starts from where you are', () => {
    const url = new URL(directionsLink(['A', 'B', 'C'])!);
    expect(url.searchParams.get('origin')).toBeNull();
    expect(url.searchParams.get('destination')).toBe('C');
    expect(url.searchParams.get('waypoints')).toBe('A|B');
    expect(directionsLink([])).toBeNull();
  });
});
