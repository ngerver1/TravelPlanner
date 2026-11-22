import { describe, it, expect } from 'vitest';
import { barsInWeek, packLanes, weeksCovering } from './month';
import { range } from './dates';

describe('month view layout', () => {
  it('gives continuous weeks across a month boundary', () => {
    const w = weeksCovering('2027-01-29', '2027-02-02');
    expect(w.map((x) => x[0])).toEqual(['2027-01-25', '2027-02-01']);
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
