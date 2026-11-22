// Builders for tests only (not imported by the app).
import { emptyDoc } from './normalize';
import type { Flight, Stay, TripDoc } from './types';

export function doc(start: string, end: string, locs: string[] = []): TripDoc {
  const d = emptyDoc();
  d.trip = { name: 'Test', start, end };
  d.locations = locs.map((name) => ({ id: name.toLowerCase(), name }));
  return d;
}
let n = 0;
export const stay = (p: Partial<Stay>): Stay => ({
  id: 's' + ++n, name: 'Stay', address: '', checkIn: '', checkOut: '', checkInTime: '', checkOutTime: '',
  status: 'booked', conf: '', cost: '', link: '', notes: '', ...p,
});
export const flight = (p: Partial<Flight>): Flight => ({
  id: 'f' + ++n, airline: '', flightNo: 'XX1', from: '', to: '', depDate: '', depTime: '', arrDate: '', arrTime: '',
  status: 'booked', conf: '', notes: '', ...p,
});
