import { describe, it, expect } from 'vitest';
import { costReport, fmtMoney, parseCost, toHome, costsCsv } from './money';
import { normalizeDoc } from './normalize';
import { placeAt, setChosen } from './plan';
import { doc, stay, flight } from './testutil';
import type { Item } from './types';

describe('reading old text costs', () => {
  it.each([
    ['HK$4,200', { amount: 4200, currency: 'HKD' }],
    ['¥3,000 pp', { amount: 3000, currency: 'JPY', perPerson: true }],
    ['120 AUD', { amount: 120, currency: 'AUD' }],
    ['$80', { amount: 80, currency: 'AUD' }],
    ['about 15k yen', { amount: 15000, currency: 'JPY' }],
    ['US$ 99.50 each', { amount: 99.5, currency: 'USD', perPerson: true }],
  ])('%s', (text, want) => expect(parseCost(text, 'AUD')).toEqual(want));
  it('gives up on text without a number', () => expect(parseCost('cheap', 'AUD')).toBeNull());
  it('converts old stay and item costs when loading, keeping unreadable text as a note', () => {
    const d = normalizeDoc({ schema: 2, trip: { name: 't', start: '2027-01-01', end: '2027-01-02' }, locations: [{ id: 'a', name: 'A' }],
      stays: [{ id: 's1', cost: 'HK$2,000' }, { id: 's2', cost: 'ask at desk' }],
      items: [{ id: 'i', locationId: 'a', kind: 'activity', title: 'x', cost: '¥3,000 pp' }] });
    expect(d.stays[0]).toMatchObject({ price: { amount: 2000, currency: 'HKD' }, cost: '' });
    expect(d.stays[1]).toMatchObject({ cost: 'ask at desk' });
    expect(d.stays[1].price).toBeUndefined();
    expect(d.items[0].price).toEqual({ amount: 3000, currency: 'JPY', perPerson: true });
    expect(d.trip.currency).toBe('AUD');
  });
});

describe('formatting and converting', () => {
  it('formats with symbols', () => {
    expect(fmtMoney(3000, 'JPY')).toBe('¥3,000');
    expect(fmtMoney(1234.5, 'HKD')).toBe('HK$1,234.50');
    expect(fmtMoney(12, 'CHF')).toBe('CHF 12');
  });
  it('converts with rates and multiplies per-person prices', () => {
    const rates = { base: 'AUD', date: 'x', rates: { JPY: 100, HKD: 5 } };
    expect(toHome({ amount: 3000, currency: 'JPY', perPerson: true }, 'AUD', rates, 2)).toBe(60);
    expect(toHome({ amount: 50, currency: 'AUD' }, 'AUD', undefined)).toBe(50);
    expect(toHome({ amount: 50, currency: 'USD' }, 'AUD', rates)).toBeNull();
  });
});

describe('cost report', () => {
  it('totals stays, flights, planned things and picked meals; lists ideas and missing costs separately', () => {
    const d = doc('2027-01-01', '2027-01-03', ['Tokyo']);
    d.trip.currency = 'AUD'; d.trip.people = 2;
    d.rates = { base: 'AUD', date: '2026-11-23', rates: { JPY: 100 } };
    d.stays = [stay({ locationId: 'tokyo', checkIn: '2027-01-01', checkOut: '2027-01-03', status: 'booked', price: { amount: 400, currency: 'AUD' } }), stay({ name: 'No price', checkIn: '2027-01-01', checkOut: '2027-01-02' })];
    d.flights = [flight({ depDate: '2027-01-01', status: 'planned', price: { amount: 300, currency: 'AUD', perPerson: true } })];
    const it = (id: string, kind: Item['kind'], price?: Item['price']): Item => ({ id, locationId: 'tokyo', kind, title: id, status: 'idea', placements: [], ...(kind === 'activity' ? { size: 'half' as const } : {}), ...(price ? { price } : {}) });
    d.items = [
      it('museum', 'activity', { amount: 2000, currency: 'JPY', perPerson: true }),  // placed: 2000*2/100 = 40
      it('someday', 'activity', { amount: 5000, currency: 'JPY' }),                   // idea, not counted
      it('ramen', 'restaurant', { amount: 1500, currency: 'JPY', perPerson: true }),  // picked twice: 2 * 30 = 60
      it('sushi', 'restaurant', { amount: 9000, currency: 'JPY' }),                   // an option, not picked
      it('noprice', 'activity'),
    ];
    placeAt(d, { itemId: 'museum', pi: -1 }, { date: '2027-01-02', slot: 'morning' });
    placeAt(d, { itemId: 'noprice', pi: -1 }, { date: '2027-01-02', slot: 'afternoon' });
    placeAt(d, { itemId: 'ramen', pi: -1 }, { date: '2027-01-01', meal: 'dinner' });
    placeAt(d, { itemId: 'ramen', pi: -1 }, { date: '2027-01-02', meal: 'dinner' });
    placeAt(d, { itemId: 'sushi', pi: -1 }, { date: '2027-01-02', meal: 'dinner' });
    setChosen(d, { itemId: 'ramen', pi: 1 }, true);
    // 1 Jan dinner: ramen only option → counts; 2 Jan: ramen picked over sushi → counts
    const r = costReport(d);
    expect(r.total).toBe(400 + 600 + 40 + 60);
    expect(r.byKind).toEqual({ stay: 400, flight: 600, transport: 0, activity: 40, food: 60 });
    expect(r.byStatus).toEqual({ booked: 400, planned: 600, idea: 100 });
    expect(r.ideas.map((l) => l.title)).toEqual(['someday']);
    expect(r.missing.map((m) => m.title).sort()).toEqual(['No price', 'noprice']);
    expect(r.byLocation.get('tokyo')).toBe(500);
    expect(costsCsv(r, () => 'Tokyo').split('\n')).toHaveLength(r.lines.length + 1);
  });
  it('reports currencies it cannot convert yet', () => {
    const d = doc('2027-01-01', '2027-01-02');
    d.stays = [stay({ checkIn: '2027-01-01', checkOut: '2027-01-02', price: { amount: 1000, currency: 'HKD' } })];
    const r = costReport(d);
    expect(r.unconverted).toEqual(['HKD']);
    expect(r.total).toBe(0);
  });
});
