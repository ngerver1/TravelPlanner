import { describe, it, expect } from 'vitest';
import { dayRoute, mapPoints } from './geo';
import { derive } from './derive';
import { placeAt } from './plan';
import { doc, stay } from './testutil';
import type { Item } from './types';

const item = (id: string, pos?: [number, number], extra: Partial<Item> = {}): Item => ({
  id, locationId: 'tokyo', kind: 'activity', title: id, status: 'idea', size: 'half', placements: [],
  ...(pos ? { place: { name: id, lat: pos[0], lng: pos[1] } } : {}), ...extra,
});

function trip() {
  const d = doc('2027-01-01', '2027-01-03', ['Tokyo', 'Kyoto']);
  d.stays = [stay({ id: 'h', name: 'Hotel', locationId: 'tokyo', checkIn: '2027-01-01', checkOut: '2027-01-03', place: { name: 'Hotel', lat: 35.68, lng: 139.76 } })];
  d.items = [item('a', [35.71, 139.79]), item('b', [35.66, 139.70]), item('c'), item('k', [35.0, 135.77], { locationId: 'kyoto' })];
  placeAt(d, { itemId: 'b', pi: -1 }, { date: '2027-01-02', slot: 'afternoon' });
  placeAt(d, { itemId: 'a', pi: -1 }, { date: '2027-01-02', slot: 'morning' });
  placeAt(d, { itemId: 'c', pi: -1 }, { date: '2027-01-02', slot: 'evening' });
  return d;
}

describe('map points', () => {
  it('shows everything with a position, and lists what has none', () => {
    const r = mapPoints(trip(), { by: 'all' });
    expect(r.points.map((p) => p.key).sort()).toEqual(['ia', 'ib', 'ik', 'sh']);
    expect(r.points.find((p) => p.key === 'ik')!.placed).toBe(false);
    expect(r.missing.map((m) => m.id)).toEqual(['c']);
  });
  it('filters by day and by location', () => {
    expect(mapPoints(trip(), { by: 'day', date: '2027-01-02' }).points.map((p) => p.key).sort()).toEqual(['ia', 'ib', 'sh']);
    expect(mapPoints(trip(), { by: 'location', id: 'kyoto' }).points.map((p) => p.key)).toEqual(['ik']);
  });
});

describe('day route', () => {
  it('starts and ends at the hotel with stops numbered in day order', () => {
    const d = trip();
    const r = dayRoute(d, derive(d), '2027-01-02');
    expect(r.map((p) => `${p.title}${p.number ?? ''}`)).toEqual(['Hotel', 'a1', 'b2', 'Hotel']);
  });
});

import { dayRouteQueries } from './geo';
import { embedDirections, embedPlace } from './maps';
import { flight } from './testutil';

describe('Google route for a day (by name)', () => {
  it('hotel → stops → hotel, using names when there are no positions', () => {
    const d = trip();
    d.stays[0].place = { name: 'Hotel' }; // no position
    const r = dayRouteQueries(d, derive(d), '2027-01-02')!;
    expect(r.origin).toBe('Hotel, Tokyo');
    expect(r.stops).toEqual(['35.71,139.79', '35.66,139.7', 'c, Tokyo']);
    expect(r.destination).toBe('Hotel, Tokyo');
  });
  it('ends at the departure airport on a flight day, starts at the arrival airport after an overnight flight', () => {
    const d = trip();
    d.flights = [flight({ from: 'HND', to: 'CTS', depDate: '2027-01-02', depTime: '20:00', arrDate: '2027-01-03', arrTime: '01:00' })];
    placeAt(d, { itemId: 'k', pi: -1 }, { date: '2027-01-03', slot: 'morning' });
    const v = derive(d);
    expect(dayRouteQueries(d, v, '2027-01-02')!.destination).toBe('HND airport');
    expect(dayRouteQueries(d, v, '2027-01-03')?.origin).toBe('CTS airport');
  });
  it('a same-day flight starts the day at the arrival airport', () => {
    const d = trip();
    d.flights = [flight({ from: 'BNE', to: 'HND', depDate: '2027-01-02', depTime: '06:00', arrDate: '2027-01-02', arrTime: '13:00' })];
    const r = dayRouteQueries(d, derive(d), '2027-01-02')!;
    expect(r.origin).toBe('HND airport');
    expect(r.destination).toBe('35.68,139.76'); // the hotel, by its exact position
  });
  it('builds keyless Google embeds', () => {
    expect(embedPlace('Senso-ji, Tokyo')).toBe('https://maps.google.com/maps?q=Senso-ji%2C+Tokyo&z=15&output=embed');
    const u = new URL(embedDirections(['Hotel', 'A', 'B'])!);
    expect(u.searchParams.get('saddr')).toBe('Hotel');
    expect(u.searchParams.get('daddr')).toBe('A to:B');
  });
});

import { dayRoutePoints } from './geo';
describe('day route points', () => {
  it('lists the day hop by hop with names to show', () => {
    const d = trip();
    const pts = dayRoutePoints(d, derive(d), '2027-01-02');
    expect(pts.map((p) => `${p.kind}:${p.label}`)).toEqual(['start:Hotel', 'stop:a', 'stop:b', 'stop:c', 'end:Hotel']);
  });
});
