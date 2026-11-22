import { describe, it, expect } from 'vitest';
import { barsInWeek, monthsCovering, packLanes } from './month';
import { range } from './dates';

describe('month view layout', () => {
  it('covers whole months with Monday-start weeks', () => {
    const m = monthsCovering('2027-01-22', '2027-02-11');
    expect(m.map((x) => x.key)).toEqual(['2027-01', '2027-02']);
    expect(m[0].weeks[0][0]).toBe('2026-12-28'); // Mon before 1 Jan 2027 (a Friday)
    expect(m[0].weeks.at(-1)!.includes('2027-01-31')).toBe(true);
    expect(m[1].weeks[0][0]).toBe('2027-02-01');
  });

  it('packs back-to-back stays in one lane and overlaps in another', () => {
    const p = packLanes([
      { item: 'a', start: '2027-01-01', end: '2027-01-04' },
      { item: 'b', start: '2027-01-04', end: '2027-01-06' },
      { item: 'c', start: '2027-01-05', end: '2027-01-07' },
    ]);
    expect(Object.fromEntries(p.map((x) => [x.item, x.lane]))).toEqual({ a: 0, b: 0, c: 1 });
  });

  it('places bars from midday check-in to midday check-out, split across weeks', () => {
    const wk1 = range('2027-01-04', '2027-01-10');
    const wk2 = range('2027-01-11', '2027-01-17');
    const bars = [{ item: 'x', start: '2027-01-08', end: '2027-01-12', lane: 0 }];
    expect(barsInWeek(bars, wk1)).toEqual([{ item: 'x', lane: 0, from: 10, to: 15, openLeft: false, openRight: true }]);
    expect(barsInWeek(bars, wk2)).toEqual([{ item: 'x', lane: 0, from: 1, to: 4, openLeft: true, openRight: false }]);
  });
});
