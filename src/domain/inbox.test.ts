import { describe, it, expect } from 'vitest';
import { findExisting, normalizeBookings, normalizeInbox, parseMarkup, splitIso } from './inbox';
import { doc, flight, stay, leg } from './testutil';

const ld = (o: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(o)}</script></head><body>Hi</body></html>`;

describe('booking markup in emails', () => {
  it('reads a flight', () => {
    const b = parseMarkup(ld({
      '@context': 'http://schema.org', '@type': 'FlightReservation', reservationNumber: 'ABC123',
      reservationFor: { '@type': 'Flight', flightNumber: '581', airline: { '@type': 'Airline', name: 'Cathay Pacific', iataCode: 'CX' },
        departureAirport: { '@type': 'Airport', iataCode: 'CTS' }, arrivalAirport: { '@type': 'Airport', iataCode: 'HKG' },
        departureTime: '2027-01-28T16:05:00+09:00', arrivalTime: '2027-01-28T21:10:00+08:00' },
    }));
    expect(b).toEqual([{ type: 'flight', conf: 'ABC123', airline: 'Cathay Pacific', flightNo: 'CX581', from: 'CTS', to: 'HKG', depDate: '2027-01-28', depTime: '16:05', arrDate: '2027-01-28', arrTime: '21:10' }]);
  });
  it('reads a hotel with price, a train, a restaurant and an event (several in one email, @graph)', () => {
    const html = ld({ '@graph': [
      { '@type': 'LodgingReservation', reservationNumber: 'H-77', totalPrice: '42000', priceCurrency: 'JPY', checkinTime: '2027-01-24T15:00:00+09:00', checkoutTime: '2027-01-26T10:00:00+09:00',
        reservationFor: { '@type': 'LodgingBusiness', name: 'Snow Lodge', address: { streetAddress: '13 Izumikawa', addressLocality: 'Rusutsu', addressCountry: 'JP' } } },
      { '@type': 'TrainReservation', reservationNumber: 'T9', reservationFor: { '@type': 'TrainTrip', trainName: 'Hokuto 3', provider: { name: 'JR Hokkaido' },
        departureStation: { name: 'Sapporo' }, arrivalStation: { name: 'Hakodate' }, departureTime: '2027-01-27T08:00:00+09:00', arrivalTime: '2027-01-27T11:45:00+09:00' } },
      { '@type': 'FoodEstablishmentReservation', reservationNumber: 'R1', partySize: '2', startTime: '2027-01-28T19:30:00+09:00', reservationFor: { '@type': 'FoodEstablishment', name: 'Gonpachi', address: '1-13-11 Nishiazabu, Tokyo' } },
      { '@type': 'EventReservation', reservationNumber: 'E5', reservationFor: { '@type': 'Event', name: 'teamLab Planets', startDate: '2027-01-29T10:00:00+09:00', location: { name: 'teamLab Planets', address: { addressLocality: 'Tokyo' } } } },
    ] });
    const b = parseMarkup(html);
    expect(b.map((x) => x.type)).toEqual(['stay', 'transport', 'restaurant', 'activity']);
    expect(b[0]).toMatchObject({ name: 'Snow Lodge', city: 'Rusutsu', checkIn: '2027-01-24', checkInTime: '15:00', checkOut: '2027-01-26', price: { amount: 42000, currency: 'JPY' } });
    expect(b[1]).toMatchObject({ mode: 'train', operator: 'JR Hokkaido · Hokuto 3', fromName: 'Sapporo', toName: 'Hakodate', date: '2027-01-27', depTime: '08:00', arrTime: '11:45' });
    expect(b[1].arrDate).toBeUndefined();
    expect(b[2]).toMatchObject({ name: 'Gonpachi', date: '2027-01-28', time: '19:30', partySize: 2 });
    expect(b[3]).toMatchObject({ name: 'teamLab Planets', city: 'Tokyo', date: '2027-01-29', time: '10:00' });
  });
  it('ignores emails without markup or with broken markup', () => {
    expect(parseMarkup('<p>Your booking</p>')).toEqual([]);
    expect(parseMarkup('<script type="application/ld+json">{oops</script>')).toEqual([]);
  });
  it('keeps local times as written', () => expect(splitIso('2027-01-28T23:55:00-10:00')).toEqual({ date: '2027-01-28', time: '23:55' }));
});

describe('AI answers are tidied', () => {
  it('keeps well-formed fields and drops junk', () => {
    const b = normalizeBookings({ bookings: [
      { type: 'flight', flightNo: 'cx 581', from: 'cts', to: 'HKG', depDate: '2027-01-28', depTime: '9:05', priceAmount: 850, priceCurrency: 'aud', conf: 'ABC' },
      { type: 'stay', name: 'X', checkIn: '28/01/2027' },
      { type: 'spaceship', name: 'nope' },
      { type: 'activity' },
    ] });
    expect(b[0]).toEqual({ type: 'flight', conf: 'ABC', flightNo: 'CX581', from: 'CTS', to: 'HKG', depDate: '2027-01-28', depTime: '09:05', price: { amount: 850, currency: 'AUD' } });
    expect(b[1]).toBeUndefined(); // only a name (bad date dropped) is too little to be useful
    expect(b).toHaveLength(1);
  });
  it('reads the inbox file safely', () => {
    expect(normalizeInbox({ entries: [{ id: 'a', receivedAt: '2026-11-26T00:00:00Z', subject: 'Hi', source: 'weird', text: 'x', bookings: 'no' }] }))
      .toEqual([{ id: 'a', receivedAt: '2026-11-26T00:00:00Z', subject: 'Hi', sender: '', source: 'none', bookings: [], text: 'x' }]);
    expect(normalizeInbox('garbage')).toEqual([]);
  });
});

describe('matching an email to an existing booking', () => {
  it('by confirmation number, or a flight by number and date', () => {
    const d = doc('2027-01-01', '2027-01-30');
    d.flights = [flight({ id: 'f', flightNo: 'CX581', conf: '', depDate: '2027-01-28', from: 'CTS', to: 'HKG' })];
    d.stays = [stay({ id: 's', name: 'Snow Lodge', conf: 'H-77' })];
    d.legs = [leg({ id: 'l', conf: 'T9', operator: 'JR' })];
    expect(findExisting(d, { type: 'flight', flightNo: 'CX581', depDate: '2027-01-28' })?.id).toBe('f');
    expect(findExisting(d, { type: 'stay', conf: 'h-77' })?.id).toBe('s');
    expect(findExisting(d, { type: 'transport', conf: 'T9' })?.id).toBe('l');
    expect(findExisting(d, { type: 'stay', conf: 'nope' })).toBeNull();
  });
});
