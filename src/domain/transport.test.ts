import { describe, it, expect } from 'vitest';
import { derive, locLabel } from './derive';
import { doc, stay, flight, leg } from './testutil';

const trip = () => {
  const d = doc('2027-01-01', '2027-01-05', ['Sapporo', 'Rusutsu']);
  d.stays = [
    stay({ locationId: 'sapporo', checkIn: '2027-01-01', checkOut: '2027-01-03' }),
    stay({ locationId: 'rusutsu', checkIn: '2027-01-03', checkOut: '2027-01-05' }),
  ];
  return d;
};

describe('NO TRANSPORT', () => {
  it('flags a day that changes location with nothing booked', () => {
    const v = derive(trip());
    expect(locLabel(v.info['2027-01-03'].loc)).toBe('Sapporo → Rusutsu');
    expect(v.info['2027-01-03'].noTransport).toBe(true);
    expect(v.transportGaps).toEqual(['2027-01-03']);
    expect(v.stats.noTransport).toBe(1);
    expect(v.info['2027-01-02'].noTransport).toBe(false);
  });
  it('a transport booking that day covers it', () => {
    const d = trip();
    d.legs = [leg({ date: '2027-01-03', depTime: '09:00', arrTime: '12:00', fromLocationId: 'sapporo', toLocationId: 'rusutsu' })];
    expect(derive(d).transportGaps).toEqual([]);
  });
  it('a flight that day covers it too', () => {
    const d = trip();
    d.flights = [flight({ depDate: '2027-01-03', arrDate: '2027-01-03', from: 'CTS', to: 'XXX' })];
    expect(derive(d).transportGaps).toEqual([]);
  });
  it('flags waking up somewhere new with no travel (set by hand)', () => {
    const d = doc('2027-01-01', '2027-01-03', ['Sapporo', 'Rusutsu']);
    d.days['2027-01-01'] = { locationId: 'sapporo' };
    d.days['2027-01-02'] = { locationId: 'rusutsu' };
    expect(derive(d).transportGaps).toEqual(['2027-01-02']);
  });
});

describe('transport bookings like flights', () => {
  it('fill in the day location and split the stripe by time', () => {
    const d = doc('2027-01-01', '2027-01-03', ['Sapporo', 'Rusutsu']);
    d.stays = [stay({ locationId: 'sapporo', checkIn: '2027-01-01', checkOut: '2027-01-02' })];
    d.legs = [leg({ date: '2027-01-02', depTime: '12:00', arrTime: '15:00', fromLocationId: 'sapporo', toLocationId: 'rusutsu' })];
    const v = derive(d);
    expect(locLabel(v.info['2027-01-02'].loc)).toBe('Sapporo → Rusutsu');
    expect(v.info['2027-01-02'].segments.map((s) => s.at)).toEqual(['a', 'air', 'b']);
    expect(locLabel(v.info['2027-01-03'].loc)).toBe('Rusutsu'); // still there the next day
  });
  it('an overnight ferry is not a missing stay', () => {
    const d = doc('2027-01-01', '2027-01-03', ['Tokyo', 'Sapporo']);
    d.legs = [leg({ mode: 'ferry', date: '2027-01-01', depTime: '19:00', arrDate: '2027-01-02', arrTime: '07:00', fromLocationId: 'tokyo', toLocationId: 'sapporo' })];
    const v = derive(d);
    expect(v.info['2027-01-01'].night.kind).toBe('transit');
    expect(v.info['2027-01-02'].legArr).toHaveLength(1);
    expect(locLabel(v.info['2027-01-02'].loc)).toBe('Sapporo');
    expect(v.uncovered.map((r) => r.from)).toEqual(['2027-01-02']);
  });
  it('lists bookings outside the trip', () => {
    const d = trip();
    d.legs = [leg({ date: '2027-02-01', operator: 'JR' })];
    expect(derive(d).outside.map((o) => o.kind)).toContain('leg');
  });
});
