import { describe, it, expect } from 'vitest';
import { daySummary, laneEntries, laneKey, moveToDate, overCapacity, parseLaneKey, placeAt, setChosen, slotLoad, swap, unplace } from './plan';
import { doc } from './testutil';
import type { Item, TripDoc } from './types';

const act = (id: string, size: Item['size'] = 'half', extra: Partial<Item> = {}): Item =>
  ({ id, locationId: 'tokyo', kind: 'activity', title: id, status: 'idea', category: 'sight', size, placements: [], ...extra });
const food = (id: string): Item => ({ id, locationId: 'tokyo', kind: 'restaurant', title: id, status: 'idea', placements: [] });
const D1 = '2027-01-10', D2 = '2027-01-11';
function trip(...items: Item[]): TripDoc { const d = doc(D1, '2027-01-12', ['Tokyo']); d.items = items; return d; }
const titles = (d: TripDoc, lane: Parameters<typeof laneEntries>[1]) => laneEntries(d, lane).map((e) => e.item.id);

describe('lanes', () => {
  it('round-trips lane keys', () => {
    for (const l of [{ date: D1 }, { date: D1, slot: 'evening' as const }, { date: D1, meal: 'dinner' as const }])
      expect(parseLaneKey(laneKey(l))).toEqual(l);
  });
});

describe('placing and moving', () => {
  it('places an idea into a slot, at the end or at an index', () => {
    const d = trip(act('a'), act('b'), act('c'));
    placeAt(d, { itemId: 'a', pi: -1 }, { date: D1, slot: 'morning' });
    placeAt(d, { itemId: 'b', pi: -1 }, { date: D1, slot: 'morning' });
    placeAt(d, { itemId: 'c', pi: -1 }, { date: D1, slot: 'morning' }, 0);
    expect(titles(d, { date: D1, slot: 'morning' })).toEqual(['c', 'a', 'b']);
  });

  it('activities have one placement: moving re-homes it and tidies the old lane', () => {
    const d = trip(act('a'), act('b'));
    placeAt(d, { itemId: 'a', pi: -1 }, { date: D1, slot: 'morning' });
    placeAt(d, { itemId: 'b', pi: -1 }, { date: D1, slot: 'morning' });
    placeAt(d, { itemId: 'a', pi: 0 }, { date: D2, slot: 'evening' });
    expect(d.items[0].placements).toEqual([{ date: D2, slot: 'evening', order: 0 }]);
    expect(d.items[1].placements[0].order).toBe(0);
  });

  it('reorders within a lane', () => {
    const d = trip(act('a'), act('b'), act('c'));
    for (const id of ['a', 'b', 'c']) placeAt(d, { itemId: id, pi: -1 }, { date: D1, slot: 'afternoon' });
    placeAt(d, { itemId: 'c', pi: 0 }, { date: D1, slot: 'afternoon' }, 0);
    expect(titles(d, { date: D1, slot: 'afternoon' })).toEqual(['c', 'a', 'b']);
  });

  it('rejects restaurants in slots and activities in meals', () => {
    const d = trip(act('a'), food('r'));
    expect(placeAt(d, { itemId: 'r', pi: -1 }, { date: D1, slot: 'morning' })).toBe(-1);
    expect(placeAt(d, { itemId: 'a', pi: -1 }, { date: D1, meal: 'lunch' })).toBe(-1);
  });

  it('restaurants can be options in several meals and stay in the ideas list', () => {
    const d = trip(food('r'));
    placeAt(d, { itemId: 'r', pi: -1 }, { date: D1, meal: 'lunch' });
    placeAt(d, { itemId: 'r', pi: -1 }, { date: D2, meal: 'dinner' });
    placeAt(d, { itemId: 'r', pi: -1 }, { date: D1, meal: 'lunch' }); // already there: no duplicate
    expect(d.items[0].placements.map((p) => `${p.date} ${p.meal}`)).toEqual([`${D1} lunch`, `${D2} dinner`]);
    // moving one option onto a meal that already has it merges them
    placeAt(d, { itemId: 'r', pi: 1 }, { date: D1, meal: 'lunch' });
    expect(d.items[0].placements).toHaveLength(1);
  });

  it('full-day items always sit in the morning lane', () => {
    const d = trip(act('ski', 'full'));
    placeAt(d, { itemId: 'ski', pi: -1 }, { date: D1, slot: 'evening' });
    expect(d.items[0].placements[0].slot).toBe('morning');
  });

  it('unplacing sends it back to the ideas list without deleting it', () => {
    const d = trip(act('a'), act('b'));
    placeAt(d, { itemId: 'a', pi: -1 }, { date: D1, slot: 'morning' });
    placeAt(d, { itemId: 'b', pi: -1 }, { date: D1, slot: 'morning' });
    unplace(d, { itemId: 'a', pi: 0 });
    expect(d.items).toHaveLength(2);
    expect(d.items[0].placements).toEqual([]);
    expect(d.items[1].placements[0].order).toBe(0);
  });

  it('moves to another date keeping the slot', () => {
    const d = trip(act('a'), food('r'));
    placeAt(d, { itemId: 'a', pi: -1 }, { date: D1, slot: 'evening' });
    moveToDate(d, { itemId: 'a', pi: 0 }, D2);
    expect(d.items[0].placements[0]).toMatchObject({ date: D2, slot: 'evening' });
    moveToDate(d, { itemId: 'r', pi: -1 }, D2);
    expect(d.items[1].placements[0]).toMatchObject({ date: D2, meal: 'lunch' });
  });
});

describe('swap', () => {
  it('swaps two placed half/full-day items across days', () => {
    const d = trip(act('a'), act('b', 'full'));
    placeAt(d, { itemId: 'a', pi: -1 }, { date: D1, slot: 'afternoon' });
    placeAt(d, { itemId: 'b', pi: -1 }, { date: D2, slot: 'morning' });
    swap(d, { itemId: 'a', pi: 0 }, { itemId: 'b', pi: 0 });
    expect(d.items[0].placements[0]).toMatchObject({ date: D2, slot: 'morning' });
    expect(d.items[1].placements[0]).toMatchObject({ date: D1, slot: 'morning' }); // full day stays in morning
  });

  it('an idea dropped on a placed item takes its place; the other goes back to ideas', () => {
    const d = trip(act('a'), act('b'));
    placeAt(d, { itemId: 'b', pi: -1 }, { date: D1, slot: 'evening' });
    swap(d, { itemId: 'a', pi: -1 }, { itemId: 'b', pi: 0 });
    expect(d.items[0].placements[0]).toMatchObject({ date: D1, slot: 'evening' });
    expect(d.items[1].placements).toEqual([]);
  });
});

describe('slot capacity', () => {
  it('half fills a slot, full fills morning+afternoon (+evening), quick stacks', () => {
    const d = trip(act('h1'), act('h2'), act('f', 'full', { includesEvening: true }), act('q', 'quick'));
    placeAt(d, { itemId: 'h1', pi: -1 }, { date: D1, slot: 'afternoon' });
    placeAt(d, { itemId: 'q', pi: -1 }, { date: D1, slot: 'evening' });
    expect(overCapacity(slotLoad(d, D1))).toEqual([]);
    placeAt(d, { itemId: 'f', pi: -1 }, { date: D1, slot: 'morning' });
    expect(slotLoad(d, D1)).toEqual({ morning: 1, afternoon: 2, evening: 1 });
    expect(overCapacity(slotLoad(d, D1))).toEqual(['afternoon']);
    placeAt(d, { itemId: 'h2', pi: -1 }, { date: D1, slot: 'evening' });
    expect(overCapacity(slotLoad(d, D1))).toEqual(['afternoon', 'evening']);
  });
});

describe('meal options', () => {
  it('marking one chosen clears the others in that meal', () => {
    const d = trip(food('r1'), food('r2'));
    placeAt(d, { itemId: 'r1', pi: -1 }, { date: D1, meal: 'dinner' });
    placeAt(d, { itemId: 'r2', pi: -1 }, { date: D1, meal: 'dinner' });
    setChosen(d, { itemId: 'r1', pi: 0 }, true);
    setChosen(d, { itemId: 'r2', pi: 0 }, true);
    expect(d.items[0].placements[0].chosen).toBeUndefined();
    expect(d.items[1].placements[0].chosen).toBe(true);
    expect(daySummary(d, D1).meals).toEqual({ breakfast: 'none', lunch: 'none', dinner: 'chosen' });
  });
});

import { dayStops } from './plan';
describe('day stops', () => {
  it('orders a day breakfast → morning → lunch → afternoon → dinner → evening → unslotted, picking chosen meals', () => {
    const d = trip(act('m'), act('a'), act('e'), act('u', 'quick'), food('b'), food('l1'), food('l2'));
    placeAt(d, { itemId: 'e', pi: -1 }, { date: D1, slot: 'evening' });
    placeAt(d, { itemId: 'u', pi: -1 }, { date: D1 });
    placeAt(d, { itemId: 'a', pi: -1 }, { date: D1, slot: 'afternoon' });
    placeAt(d, { itemId: 'm', pi: -1 }, { date: D1, slot: 'morning' });
    placeAt(d, { itemId: 'b', pi: -1 }, { date: D1, meal: 'breakfast' });
    placeAt(d, { itemId: 'l1', pi: -1 }, { date: D1, meal: 'lunch' });
    placeAt(d, { itemId: 'l2', pi: -1 }, { date: D1, meal: 'lunch' });
    setChosen(d, { itemId: 'l2', pi: 0 }, true);
    expect(dayStops(d, D1).map((e) => e.item.id)).toEqual(['b', 'm', 'l2', 'a', 'e', 'u']);
  });
});
