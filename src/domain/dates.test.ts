import { describe, it, expect } from 'vitest';
import { fmtDMY, maskDMY, maskTime, parseDMY, parseTime } from './dates';

describe('DD/MM/YYYY', () => {
  it('formats and parses', () => {
    expect(fmtDMY('2027-01-22')).toBe('22/01/2027');
    expect(fmtDMY('')).toBe('');
    expect(parseDMY('22/01/2027')).toBe('2027-01-22');
    expect(parseDMY('2/1/2027')).toBe('2027-01-02');
    expect(parseDMY('30/02/2027')).toBeNull();
    expect(parseDMY('01/22/2027')).toBeNull();
  });
  it('masks typed digits', () => {
    expect(maskDMY('2')).toBe('2');
    expect(maskDMY('220')).toBe('22/0');
    expect(maskDMY('22012027')).toBe('22/01/2027');
    expect(maskDMY('22/01/20279')).toBe('22/01/2027');
  });
});

describe('24-hour time', () => {
  it('masks and parses', () => {
    expect(maskTime('1930')).toBe('19:30');
    expect(parseTime('19:30')).toBe('19:30');
    expect(parseTime('930')).toBe('09:30');
    expect(parseTime('9:05')).toBe('09:05');
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('7pm')).toBeNull();
  });
});
