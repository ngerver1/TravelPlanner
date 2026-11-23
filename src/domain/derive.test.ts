import { describe, it, expect } from 'vitest';
import { derive, locLabel, daySegments } from './derive';
import { doc, stay, flight } from './testutil';
import { NEUTRAL } from './colors';

describe('auto location', () => {
  it('uses the stay you sleep in', () => {
    const d = doc('2027-01-01', '2027-01-04', ['Sapporo']);
    d.stays = [stay({ locationId: 'sapporo', checkIn: '2027-01-01', checkOut: '2027-01-04' })];
    const v = derive(d);
    expect(locLabel(v.info['2027-01-02'].loc)).toBe('Sapporo');
    expect(v.info['2027-01-02'].loc?.manual).toBe(false);
    // checkout day: woke up in Sapporo, nowhere tonight
    expect(locLabel(v.info['2027-01-04'].loc)).toBe('Sapporo');
  });

  it('shows "Sapporo → Tokyo" on a travel day between stays', () => {
    const d = doc('2027-01-01', '2027-01-05', ['Sapporo', 'Tokyo']);
    d.stays = [
      stay({ locationId: 'sapporo', checkIn: '2027-01-01', checkOut: '2027-01-03' }),
      stay({ locationId: 'tokyo', checkIn: '2027-01-03', checkOut: '2027-01-05' }),
    ];
    expect(locLabel(derive(d).info['2027-01-03'].loc)).toBe('Sapporo → Tokyo');
  });

  it('colours a travel day by where you end up', () => {
    const d = doc('2027-01-01', '2027-01-05', ['Sapporo', 'Tokyo']);
    d.stays = [
      stay({ locationId: 'sapporo', checkIn: '2027-01-01', checkOut: '2027-01-03' }),
      stay({ locationId: 'tokyo', checkIn: '2027-01-03', checkOut: '2027-01-05' }),
    ];
    const v = derive(d);
    expect(v.info['2027-01-03'].endLoc?.name).toBe('Tokyo');
    expect(v.info['2027-01-02'].endLoc?.name).toBe('Sapporo');
  });

  it('uses airport codes when there is no stay ("BNE → HKG")', () => {
    const d = doc('2027-01-01', '2027-01-03');
    d.flights = [flight({ from: 'BNE', to: 'HKG', depDate: '2027-01-01', depTime: '10:00', arrDate: '2027-01-01', arrTime: '18:00' })];
    const v = derive(d);
    expect(locLabel(v.info['2027-01-01'].loc)).toBe('BNE → HKG');
    expect(v.colorOf(v.info['2027-01-01'].loc!.a)).toEqual(NEUTRAL);
  });

  it('flight to a stay: "BNE → Hong Kong"', () => {
    const d = doc('2027-01-01', '2027-01-03', ['Hong Kong']);
    d.flights = [flight({ from: 'BNE', to: 'HKG', depDate: '2027-01-01', arrDate: '2027-01-01' })];
    d.stays = [stay({ locationId: 'hong kong', checkIn: '2027-01-01', checkOut: '2027-01-03' })];
    expect(locLabel(derive(d).info['2027-01-01'].loc)).toBe('BNE → Hong Kong');
  });

  it('overnight flight shows on both days and the night on the plane is not a gap', () => {
    const d = doc('2027-01-01', '2027-01-04', ['Brisbane', 'Hong Kong']);
    d.stays = [
      stay({ locationId: 'brisbane', checkIn: '2027-01-01', checkOut: '2027-01-02' }),
      stay({ locationId: 'hong kong', checkIn: '2027-01-03', checkOut: '2027-01-04' }),
    ];
    d.flights = [flight({ from: 'BNE', to: 'HKG', depDate: '2027-01-02', depTime: '23:00', arrDate: '2027-01-03', arrTime: '05:30' })];
    const v = derive(d);
    expect(v.info['2027-01-02'].dep).toHaveLength(1);
    expect(v.info['2027-01-03'].arr).toHaveLength(1);
    expect(v.info['2027-01-02'].night.kind).toBe('plane');
    expect(locLabel(v.info['2027-01-02'].loc)).toBe('Brisbane → HKG');
    expect(locLabel(v.info['2027-01-03'].loc)).toBe('Hong Kong');
    expect(v.uncovered).toEqual([]);
    expect(v.stats.plane).toBe(1);
    expect(v.stats.none).toBe(0);
  });

  it('manual override wins, and travel-day override keeps both', () => {
    const d = doc('2027-01-01', '2027-01-03', ['Sapporo', 'Rusutsu']);
    d.stays = [stay({ locationId: 'sapporo', checkIn: '2027-01-01', checkOut: '2027-01-03' })];
    d.days['2027-01-02'] = { locationId: 'sapporo', toLocationId: 'rusutsu' };
    const v = derive(d);
    expect(locLabel(v.info['2027-01-02'].loc)).toBe('Sapporo → Rusutsu');
    expect(v.info['2027-01-02'].loc?.manual).toBe(true);
    expect(locLabel(v.info['2027-01-02'].auto)).toBe('Sapporo');
  });

  it('after a flight, assumes I am at its destination until the next stay or flight', () => {
    const d = doc('2027-01-01', '2027-01-06', ['Tokyo']);
    d.flights = [
      flight({ from: 'BNE', to: 'HKG', depDate: '2027-01-01', arrDate: '2027-01-01' }),
      flight({ from: 'HKG', to: 'NRT', depDate: '2027-01-04', arrDate: '2027-01-04' }),
    ];
    d.stays = [stay({ locationId: 'tokyo', checkIn: '2027-01-05', checkOut: '2027-01-06' })];
    const v = derive(d);
    expect(locLabel(v.info['2027-01-02'].loc)).toBe('HKG');
    expect(locLabel(v.info['2027-01-03'].loc)).toBe('HKG');
    expect(locLabel(v.info['2027-01-04'].loc)).toBe('HKG → NRT');
    expect(locLabel(v.info['2027-01-05'].loc)).toBe('Tokyo');
    expect(v.info['2027-01-03'].night.kind).toBe('none'); // still flagged as no stay
  });

  it('does not carry a flight forward past a later checkout', () => {
    const d = doc('2027-01-01', '2027-01-05', ['Rusutsu']);
    d.flights = [flight({ from: 'HKG', to: 'CTS', depDate: '2027-01-01', arrDate: '2027-01-01' })];
    d.stays = [stay({ locationId: 'rusutsu', checkIn: '2027-01-01', checkOut: '2027-01-03' })];
    const v = derive(d);
    expect(locLabel(v.info['2027-01-03'].loc)).toBe('Rusutsu');
    expect(v.info['2027-01-04'].loc).toBeNull();
  });

  it('a day with nothing is unplanned', () => {
    const v = derive(doc('2027-01-01', '2027-01-02'));
    expect(v.info['2027-01-01'].loc).toBeNull();
    expect(v.stats.noLoc).toBe(2);
  });
});

describe('night status', () => {
  it('picks the best status when stays overlap and marks NO STAY and trip end', () => {
    const d = doc('2027-01-01', '2027-01-04', ['A']);
    d.stays = [
      stay({ name: 'Idea', status: 'idea', locationId: 'a', checkIn: '2027-01-01', checkOut: '2027-01-02' }),
      stay({ name: 'Booked', status: 'booked', locationId: 'a', checkIn: '2027-01-01', checkOut: '2027-01-02' }),
      stay({ name: 'Planned', status: 'planned', locationId: 'a', checkIn: '2027-01-02', checkOut: '2027-01-03' }),
    ];
    const v = derive(d);
    const n1 = v.info['2027-01-01'].night;
    expect(n1.kind).toBe('booked');
    expect(n1.kind === 'booked' && n1.count).toBe(2);
    expect(v.info['2027-01-02'].night.kind).toBe('planned');
    expect(v.info['2027-01-03'].night.kind).toBe('none');
    expect(v.info['2027-01-04'].night.kind).toBe('end');
    expect(v.stats).toMatchObject({ nights: 3, booked: 1, tentative: 1, none: 1, unbooked: 2 });
    expect(v.uncovered).toEqual([{ from: '2027-01-03', to: '2027-01-03' }]);
  });

  it('groups uncovered nights into runs', () => {
    const d = doc('2027-01-01', '2027-01-06');
    d.stays = [stay({ checkIn: '2027-01-03', checkOut: '2027-01-04' })];
    expect(derive(d).uncovered).toEqual([
      { from: '2027-01-01', to: '2027-01-02' },
      { from: '2027-01-04', to: '2027-01-05' },
    ]);
  });
});

describe('overlaps', () => {
  it('flags overlapping stays but not back-to-back ones', () => {
    const d = doc('2027-01-01', '2027-01-10');
    const a = stay({ checkIn: '2027-01-01', checkOut: '2027-01-04' });
    const b = stay({ checkIn: '2027-01-04', checkOut: '2027-01-06' });
    const c = stay({ checkIn: '2027-01-05', checkOut: '2027-01-07' });
    d.stays = [a, b, c];
    const o = derive(d).overlaps;
    expect(o).toHaveLength(1);
    expect(o[0].map((s) => s.id)).toEqual([b.id, c.id]);
  });
});

describe('out of range', () => {
  it('lists data outside the trip and suggests an extended range', () => {
    const d = doc('2027-01-10', '2027-01-12', ['Tokyo']);
    d.days['2027-01-05'] = { locationId: 'tokyo', notes: 'x' };
    d.days['2027-01-11'] = { notes: 'inside' };
    d.flights = [flight({ from: 'NRT', to: 'BNE', depDate: '2027-01-15', arrDate: '2027-01-16' }), flight({ depDate: '' })];
    d.stays = [stay({ name: 'Early', checkIn: '2027-01-08', checkOut: '2027-01-11' }), stay({ name: 'Nodates' })];
    d.items = [{ id: 'i1', locationId: 'tokyo', kind: 'activity', title: 'Museum', status: 'idea', placements: [{ date: '2027-01-20', order: 0 }] },
      { id: 'i2', locationId: 'tokyo', kind: 'activity', title: 'Pool only', status: 'idea', placements: [] }];
    const v = derive(d);
    expect(v.outside.map((o) => o.kind).sort()).toEqual(['day', 'flight', 'flight', 'item', 'stay', 'stay']);
    expect(v.outside.find((o) => o.kind === 'day')?.label).toContain('Tokyo');
    expect(v.fit).toEqual({ start: '2027-01-05', end: '2027-01-20' });
  });

  it('nothing outside → no fit', () => {
    const v = derive(doc('2027-01-10', '2027-01-12'));
    expect(v.outside).toEqual([]);
    expect(v.fit).toBeNull();
  });
});

describe('colours', () => {
  it('gives each location its own colour, stable by id', () => {
    const d = doc('2027-01-01', '2027-01-03', ['Sapporo', 'Tokyo']);
    const v = derive(d);
    expect(v.colorOf('sapporo')).not.toEqual(v.colorOf('tokyo'));
    expect(v.colorOf({ id: 'tokyo', name: 'Tokyo' })).toEqual(v.colorOf('tokyo'));
  });
  it('respects a pinned colorIndex', () => {
    const d = doc('2027-01-01', '2027-01-03', ['Sapporo', 'Tokyo']);
    d.locations[0].colorIndex = 3;
    d.locations[1].colorIndex = 3;
    const v = derive(d);
    expect(v.colorOf('sapporo')).toEqual(v.colorOf('tokyo'));
  });
});

describe('trip with no dates yet', () => {
  it('derives an empty view', () => {
    const d = doc('', '');
    const v = derive(d);
    expect(v.dates).toEqual([]);
    expect(v.stats.nights).toBe(0);
    expect(v.outside).toEqual([]);
  });
});

describe('day split by flight times', () => {
  const r = (x: { at: string; from: number; to: number }[]) => x.map((s) => `${s.at} ${s.from.toFixed(2)}-${s.to.toFixed(2)}`);
  const A = { name: 'Sapporo', id: 's' }, B = { name: 'Hong Kong', id: 'h' };
  it('splits at departure and arrival times', () => {
    const f = flight({ depDate: '2027-01-28', depTime: '16:05', arrDate: '2027-01-28', arrTime: '21:00' });
    expect(r(daySegments({ a: A, b: B }, [f], [], '2027-01-28'))).toEqual(['a 0.00-0.67', 'air 0.67-0.88', 'b 0.88-1.00']);
  });
  it('an overnight flight is in the air for the rest of the day, and the start of the next', () => {
    const f = flight({ depDate: '2027-01-23', depTime: '23:55', arrDate: '2027-01-24', arrTime: '05:10' });
    expect(r(daySegments({ a: B, b: { name: 'CTS' } }, [f], [], '2027-01-23'))).toEqual(['a 0.00-1.00', 'air 1.00-1.00']);
    expect(r(daySegments({ a: A, b: null }, [], [f], '2027-01-24'))).toEqual(['air 0.00-0.22', 'a 0.22-1.00']);
  });
  it('without flights, a travel day splits at checkout (or early), a normal day is one place', () => {
    expect(r(daySegments({ a: A, b: B }, [], [], 'x', '10:00'))).toEqual(['a 0.00-0.42', 'b 0.42-1.00']);
    expect(r(daySegments({ a: A, b: B }, [], [], 'x'))).toEqual(['a 0.00-0.25', 'b 0.25-1.00']);
    expect(r(daySegments({ a: A, b: null }, [], [], 'x'))).toEqual(['a 0.00-1.00']);
  });
});
