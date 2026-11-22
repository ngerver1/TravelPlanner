import { describe, it, expect } from 'vitest';
import { readTripFile, migrateV1, normalizeV1 } from './migrate';
import { normalizeDoc } from './normalize';
import { derive, locLabel } from './derive';

// A v1 export, as v1's Backup → Export JSON wrote it.
const V1_FILE = {
  version: 1,
  updatedAt: 1764000000000,
  trip: { name: 'Japan 2027', start: '2027-01-22', end: '2027-01-28' },
  days: {
    '2027-01-25': { loc: 'rusutsu' },
    '2027-01-26': { loc: 'Rusutsu', loc2: 'Tokyo', notes: 'Bus at 9' },
    '2027-02-15': { notes: 'outside the trip' },
  },
  flights: [
    { id: 'f1', airline: 'Cathay', flightNo: 'cx156', from: 'bne', to: 'hkg', depDate: '2027-01-22', depTime: '10:45', arrDate: '2027-01-22', arrTime: '17:30', status: 'booked', conf: 'ABC123', notes: '' },
    { id: 'f2', airline: 'Cathay', flightNo: 'CX580', from: 'HKG', to: 'CTS', depDate: '2027-01-23', depTime: '23:55', arrDate: '2027-01-24', arrTime: '05:10', status: 'planned', conf: '', notes: 'red-eye' },
  ],
  stays: [
    { id: 's1', name: 'Harbour Hotel', location: 'Hong Kong', address: '1 Road', checkIn: '2027-01-22', checkOut: '2027-01-23', status: 'booked', conf: 'H1', cost: 'HK$2,000', link: 'https://example.com', notes: 'quiet room' },
    { id: 's2', name: 'Snow Lodge', location: 'Rusutsu', checkIn: '2027-01-24', checkOut: '2027-01-26', status: 'planned' },
    { id: 's3', name: 'City Inn', location: 'tokyo', checkIn: '2027-01-26', checkOut: '2027-01-28', status: 'idea' },
  ],
  items: [
    { id: 'i1', date: '2027-01-22', time: '08:30', title: 'Dim sum', place: 'Tim Ho Wan', category: 'food', status: 'idea', notes: 'n1', link: 'https://l1' },
    { id: 'i2', date: '2027-01-22', time: '12:30', title: 'Noodles', place: '', category: 'food', status: 'planned', notes: '', link: '' },
    { id: 'i3', date: '2027-01-22', time: '19:00', title: 'Hotpot', place: '', category: 'food', status: 'booked', notes: '', link: '' },
    { id: 'i4', date: '2027-01-22', time: '', title: 'Bakery', place: '', category: 'food', status: 'idea', notes: '', link: '' },
    { id: 'i5', date: '2027-01-25', time: '09:00', title: 'Ski lesson', place: '', category: 'activity', status: 'booked', notes: '', link: '' },
    { id: 'i6', date: '2027-01-25', time: '13:00', title: 'Onsen', place: '', category: 'sight', status: 'idea', notes: '', link: '' },
    { id: 'i7', date: '2027-01-25', time: '18:00', title: 'Night ski', place: '', category: 'activity', status: 'idea', notes: '', link: '' },
    { id: 'i8', date: '2027-01-26', time: '', title: 'Bus to Tokyo', place: '', category: 'transport', status: 'planned', notes: '', link: '' },
    { id: 'i9', date: '', time: '', title: 'Someday', place: '', category: 'other', status: 'idea', notes: '', link: '' },
    { id: 'i10', date: '2027-03-01', time: '11:59', title: 'Way later', place: '', category: 'sight', status: 'idea', notes: '', link: '' },
  ],
};

describe('v1 migration', () => {
  const { doc, from } = readTripFile(structuredClone(V1_FILE));
  const loc = (name: string) => doc.locations.find((l) => l.name.toLowerCase() === name.toLowerCase())!;
  const item = (id: string) => doc.items.find((i) => i.id === id)!;

  it('detects a v1 file and produces schema 2', () => {
    expect(from).toBe('v1');
    expect(doc.schema).toBe(2);
    expect(doc.trip).toEqual(V1_FILE.trip);
  });

  it('creates one location per distinct name (case-insensitive) plus Unassigned', () => {
    const names = doc.locations.map((l) => l.name.toLowerCase()).sort();
    expect(names).toEqual(['hong kong', 'rusutsu', 'tokyo', 'unassigned']);
  });

  it('links stays and day overrides by id', () => {
    expect(doc.stays.find((s) => s.id === 's1')!.locationId).toBe(loc('Hong Kong').id);
    expect(doc.stays.find((s) => s.id === 's3')!.locationId).toBe(loc('Tokyo').id);
    expect(doc.days['2027-01-25']).toEqual({ locationId: loc('Rusutsu').id });
    expect(doc.days['2027-01-26']).toEqual({ locationId: loc('Rusutsu').id, toLocationId: loc('Tokyo').id, notes: 'Bus at 9' });
    expect(doc.days['2027-02-15']).toEqual({ notes: 'outside the trip' });
  });

  it('turns food into restaurants with meal placements', () => {
    expect(item('i1')).toMatchObject({ kind: 'restaurant', placements: [{ date: '2027-01-22', meal: 'breakfast', time: '08:30' }] });
    expect(item('i2').placements[0].meal).toBe('lunch');
    expect(item('i3').placements[0].meal).toBe('dinner');
    expect(item('i4').placements[0]).toMatchObject({ meal: 'lunch' });
    expect(item('i4').placements[0].time).toBeUndefined();
    expect(item('i1').place).toEqual({ name: 'Tim Ho Wan' });
  });

  it('turns everything else into quick activities with slots from time', () => {
    expect(item('i5')).toMatchObject({ kind: 'activity', size: 'quick', category: 'activity', placements: [{ slot: 'morning', time: '09:00' }] });
    expect(item('i6')).toMatchObject({ category: 'sight', placements: [{ slot: 'afternoon' }] });
    expect(item('i7').placements[0].slot).toBe('evening');
    expect(item('i8').category).toBe('other');
    expect(item('i8').placements[0].slot).toBeUndefined();
    expect(item('i9').placements).toEqual([]);
    expect(item('i10').placements[0]).toMatchObject({ date: '2027-03-01', slot: 'morning' });
  });

  it("assigns each item its day's location, first on travel days, else Unassigned", () => {
    // Jan 22: BNE → Hong Kong: the airport code is skipped, Hong Kong is used.
    expect(item('i1').locationId).toBe(loc('Hong Kong').id);
    expect(item('i5').locationId).toBe(loc('Rusutsu').id);
    expect(item('i8').locationId).toBe(loc('Rusutsu').id); // Rusutsu → Tokyo
    expect(item('i9').locationId).toBe(loc('Unassigned').id);
    expect(item('i10').locationId).toBe(loc('Unassigned').id);
  });

  it('carries flights, statuses, notes and links over unchanged', () => {
    expect(doc.flights.map((f) => [f.flightNo, f.from, f.status, f.conf])).toEqual([
      ['CX156', 'BNE', 'booked', 'ABC123'], ['CX580', 'HKG', 'planned', ''],
    ]);
    expect(item('i1')).toMatchObject({ status: 'idea', notes: 'n1', link: 'https://l1' });
    expect(item('i3').status).toBe('booked');
    expect(doc.stays.find((s) => s.id === 's1')).toMatchObject({ conf: 'H1', cost: 'HK$2,000', link: 'https://example.com', notes: 'quiet room', address: '1 Road' });
  });

  it('derives the same day locations v1 showed', () => {
    const v = derive(doc);
    expect(locLabel(v.info['2027-01-22'].loc)).toBe('BNE → Hong Kong');
    expect(v.info['2027-01-23'].night.kind).toBe('plane');
    expect(locLabel(v.info['2027-01-26'].loc)).toBe('Rusutsu → Tokyo');
    expect(v.outside.map((o) => o.kind).sort()).toEqual(['day', 'item']);
  });

  it('keeps order within a lane', () => {
    expect(item('i5').placements[0].order).toBe(0);
  });

  it('survives a round trip through JSON as v2', () => {
    const again = readTripFile(JSON.parse(JSON.stringify(doc)));
    expect(again.from).toBe('v2');
    expect(again.doc).toEqual(doc);
  });

  it('rejects things that are not trip files', () => {
    expect(() => readTripFile([])).toThrow();
    expect(() => readTripFile({ hello: 1 })).toThrow(/trip/);
    expect(() => readTripFile({ schema: 3, trip: {} })).toThrow(/newer/);
  });

  it('migrates an empty v1 trip', () => {
    const d = migrateV1(normalizeV1({ trip: { name: 'x', start: '2027-01-01', end: '2027-01-02' } }));
    expect(d.locations).toEqual([]);
    expect(d.items).toEqual([]);
  });
});

describe('normalizeDoc', () => {
  it('drops references to missing locations and invalid data', () => {
    const d = normalizeDoc({
      schema: 2, trip: { name: '', start: '2027-01-05', end: '2027-01-01' },
      locations: [{ id: 'a', name: 'A' }],
      days: { '2027-01-01': { locationId: 'zzz' }, 'nope': { notes: 'x' } },
      items: [{ id: 'x', locationId: 'zzz', kind: 'activity', title: 'T', placements: [{ date: '2027-01-01', slot: 'brunch' }, { date: '2027-01-02' }] }],
    });
    expect(d.trip.end).toBe('2027-01-05');
    expect(d.days).toEqual({});
    expect(d.items[0].placements).toEqual([{ date: '2027-01-01', order: 0 }]);
    expect(d.locations.find((l) => l.id === d.items[0].locationId)?.name).toBe('Unassigned');
  });
});
