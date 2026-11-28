import { describe, expect, it } from 'vitest';
import { derive } from './derive';
import { doc, flight, leg, stay } from './testutil';
import { agenda, phase, problems, stillToBook, summary } from './today';
import type { Item } from './types';

const trip = () => {
  const d = doc('2027-01-24', '2027-01-27', ['Tokyo', 'Rusutsu']);
  d.flights.push(flight({ flightNo: 'JL501', from: 'HND', to: 'CTS', depDate: '2027-01-25', depTime: '11:00', arrDate: '2027-01-25', arrTime: '12:35' }));
  d.stays.push(stay({ name: 'Tokyo Inn', locationId: 'tokyo', checkIn: '2027-01-24', checkOut: '2027-01-25', checkOutTime: '' }));
  d.stays.push(stay({ name: 'Westin', locationId: 'rusutsu', checkIn: '2027-01-25', checkOut: '2027-01-27', checkInTime: '16:00', status: 'planned' }));
  d.legs.push(leg({ mode: 'bus', operator: 'Resort Liner', date: '2027-01-25', depTime: '13:30', arrTime: '15:45', fromLocationId: 'rusutsu', toLocationId: 'rusutsu' }));
  const item = (p: Partial<Item>): Item => ({ id: p.title!, locationId: 'rusutsu', kind: 'activity', title: '', status: 'idea', placements: [], ...p });
  d.items.push(item({ title: 'Dinner', kind: 'restaurant', placements: [{ date: '2027-01-25', meal: 'dinner', order: 0 }] }));
  d.items.push(item({ title: 'Breakfast', kind: 'restaurant', placements: [{ date: '2027-01-25', meal: 'breakfast', order: 0, time: '07:15' }] }));
  d.items.push(item({ title: 'Onsen', placements: [{ date: '2027-01-25', slot: 'evening', order: 0 }] }));
  return d;
};

describe('Today', () => {
  it('lists the day in time order, guessing times for plans without one', () => {
    const d = trip(), dv = derive(d);
    const rows = agenda(d, dv, '2027-01-25').map((r) => `${r.time}${r.approx ? '~' : ''} ${r.kind === 'item' ? r.item.title : r.kind === 'flight' ? r.flight.flightNo + ' ' + r.at : r.kind === 'leg' ? r.leg.operator + ' ' + r.at : r.stay.name + ' ' + r.at}`);
    expect(rows).toEqual(['07:15 Breakfast', '10:00~ Tokyo Inn out', '11:00 JL501 dep', '13:30 Resort Liner dep', '16:00 Westin in', '19:00~ Dinner', '20:30~ Onsen']);
  });
  it('warns about tonight and things not booked', () => {
    const d = trip(), dv = derive(d);
    expect(problems(dv, '2027-01-25').map((p) => p.text)).toEqual(['Westin isn’t booked yet']);
    expect(problems(dv, '2027-01-27').map((p) => p.kind)).toEqual([]); // last day: no night needed
    d.stays.pop(); // no stay in Rusutsu
    expect(problems(derive(d), '2027-01-25').map((p) => p.kind)).toContain('nostay');
  });
  it('knows where today is against the trip', () => {
    const dv = derive(trip());
    expect(phase(dv, '2026-11-28')).toEqual({ kind: 'before', days: 57 });
    expect(phase(dv, '2027-01-25')).toEqual({ kind: 'during', day: 2 });
    expect(phase(dv, '2027-02-01')).toEqual({ kind: 'after' });
  });
  it('lists what is still to book before the trip, and sums it up after', () => {
    const d = trip(), dv = derive(d);
    expect(stillToBook(d, dv).map((p) => `${p.date} ${p.text}`)).toEqual(['2027-01-25 Westin']);
    expect(summary(d, dv)).toMatchObject({ days: 4, stays: 2, flights: 1, plans: 3 });
  });
});
