import { describe, it, expect } from 'vitest';
import { looseDate, looseTime } from './looseDates';

const trip = { tripStart: '2027-01-22', tripEnd: '2027-02-08', received: '2026-11-27' };
describe('dates as emails write them', () => {
  it.each([
    ['2027-01-26', '2027-01-26'], ['2027/1/26', '2027-01-26'], ['26/01/2027', '2027-01-26'], ['26.01.27', '2027-01-26'],
    ['01/26/2027', '2027-01-26'], ['26 Jan 2027', '2027-01-26'], ['Tue, 26 January 2027', '2027-01-26'], ['Jan 26, 2027', '2027-01-26'],
    ['January 26th 2027', '2027-01-26'], ['2027年1月26日', '2027-01-26'], ['Tuesday 26th of January, 2027', '2027-01-26'],
  ])('%s', (s, want) => expect(looseDate(s, trip)).toBe(want));
  it('fills in the year from the trip when the email leaves it out', () => {
    expect(looseDate('Tue 26 Jan', trip)).toBe('2027-01-26');
    expect(looseDate('Feb 3', trip)).toBe('2027-02-03');
    expect(looseDate('1月28日', trip)).toBe('2027-01-28');
    expect(looseDate('15 Dec', trip)).toBe('2026-12-15'); // not in the trip: next one after the email arrived
  });
  it('rejects nonsense', () => {
    expect(looseDate('31/02/2027')).toBeUndefined();
    expect(looseDate('soon')).toBeUndefined();
  });
});

describe('times as emails write them', () => {
  it.each([
    ['16:05', '16:05'], ['4:05 PM', '16:05'], ['4.05pm', '16:05'], ['4pm', '16:00'], ['12:30 a.m.', '00:30'],
    ['1605', '16:05'], ['16h05', '16:05'], ['16時05分', '16:05'], ['noon', '12:00'], ['Departs 9:15', '09:15'],
  ])('%s', (s, want) => expect(looseTime(s)).toBe(want));
  it('does not mistake other numbers for times', () => {
    expect(looseTime('25:00')).toBeUndefined();
    expect(looseTime('Gate 23')).toBeUndefined();
  });
});
