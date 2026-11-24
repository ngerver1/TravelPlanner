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
