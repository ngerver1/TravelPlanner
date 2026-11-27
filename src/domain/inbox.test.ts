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
    expect(b[1]).toEqual({ type: 'stay', name: 'X', checkIn: '2027-01-28' }); // day-first dates are read
    expect(b).toHaveLength(2);
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

import { extractLinks, bestLink } from './inbox';
describe('links in emails', () => {
  const html = `<a href="https://www.facebook.com/cathay">Like us</a>
    <a href="https://www.cathaypacific.com/manage?ref=ABC&amp;x=1">Manage booking</a>
    <a href="https://www.cathaypacific.com/">Home</a>
    <a href="https://email.example.com/unsubscribe?u=1">Unsubscribe</a>
    <a href="mailto:help@cx.com">Email us</a><img src="https://t.example.com/p.gif">`;
  it('finds the useful ones, booking links first, without unsubscribe/social/mailto', () => {
    const l = extractLinks(html);
    expect(l.map((x) => x.text)).toEqual(['Manage booking', 'Home']);
    expect(l[0].url).toBe('https://www.cathaypacific.com/manage?ref=ABC&x=1');
    expect(bestLink(l)).toBe('https://www.cathaypacific.com/manage?ref=ABC&x=1');
    expect(bestLink([{ text: 'Home', url: 'https://x.com/home' }])).toBeUndefined();
  });
  it('also finds links written out in plain text', () => {
    expect(extractLinks('', 'View your itinerary: https://booking.example.com/itinerary/123.')[0].url).toBe('https://booking.example.com/itinerary/123');
  });
  it('an AI answer can point at a link by number, and dates without a year use the trip', () => {
    const b = normalizeBookings({ bookings: [{ type: 'activity', name: 'teamLab', date: 'Fri 29 Jan', time: '10am', linkIndex: 1 }] },
      { tripStart: '2027-01-22', tripEnd: '2027-02-08', received: '2026-11-27' }, [{ text: 'Your tickets', url: 'https://tl.example/t/1' }]);
    expect(b).toEqual([{ type: 'activity', name: 'teamLab', date: '2027-01-29', time: '10:00', link: 'https://tl.example/t/1' }]);
  });
  it('reads booking links from markup', () => {
    const m = parseMarkup(`<script type="application/ld+json">${JSON.stringify({ '@type': 'LodgingReservation', reservationNumber: 'H1', modifyReservationUrl: 'https://hotel.example/manage/H1', reservationFor: { name: 'Hotel' }, checkinTime: '2027-01-24' })}</script>`);
    expect(m[0].link).toBe('https://hotel.example/manage/H1');
  });
});

import { enrichBookings, findCancel, findConf, findPrice, mapsLinkIn } from './inbox';
describe('rule-based second pass', () => {
  const hotel = `Your booking is confirmed
Booking number: 4821.993.120
PIN code: 7731
Check-in Tue 26 Jan 2027 from 15:00
Free cancellation until 23:59 on 24 January 2027
Total price
¥ 52,400
(includes taxes and fees)
Manage booking: https://secure.booking.example/mybooking.html?bn=4821993120&pincode=7731
Get directions <https://maps.app.goo.gl/AbC123>`;
  it('finds the confirmation number, price and cancellation terms', () => {
    expect(findConf(hotel)).toBe('4821.993.120');
    expect(findConf('Your booking reference is ABC123. Thanks')).toBe('ABC123');
    expect(findConf('Airline booking reference (PNR): XKQWTZ')).toBe('XKQWTZ');
    expect(findConf('Confirmation number: 1234567890')).toBe('1234567890');
    expect(findConf('Reservation details are below')).toBeUndefined();
    expect(findPrice(hotel)).toEqual({ amount: 52400, currency: 'JPY' });
    expect(findPrice('Subtotal HK$900\nTotal amount paid: HK$1,034.50')).toEqual({ amount: 1034.5, currency: 'HKD' });
    expect(findPrice('Room rate: 3 nights')).toBeUndefined();
    expect(findCancel(hotel)).toBe('Free cancellation until 24 Jan 23:59');
    expect(findCancel('This rate is non-refundable.')).toBe('Non-refundable');
  });
  it('labels plain-text links by the words before them, manage-booking first, maps kept apart', () => {
    const links = extractLinks('', hotel);
    expect(links[0]).toMatchObject({ text: 'Manage booking', url: 'https://secure.booking.example/mybooking.html?bn=4821993120&pincode=7731' });
    expect(mapsLinkIn(links)).toBe('https://maps.app.goo.gl/AbC123');
  });
  it('fills only the gaps', () => {
    const links = extractLinks('', hotel);
    const [b] = enrichBookings([{ type: 'stay', name: 'Granbell', checkIn: '2027-01-26' }], hotel, links, 'AUD');
    expect(b).toMatchObject({ price: { amount: 52400, currency: 'JPY' }, cancelBy: 'Free cancellation until 24 Jan 23:59',
      link: 'https://secure.booking.example/mybooking.html?bn=4821993120&pincode=7731', mapsUrl: 'https://maps.app.goo.gl/AbC123' });
    expect(b.conf).toBe('4821.993.120');
    const [kept] = enrichBookings([{ type: 'stay', name: 'X', checkIn: '2027-01-26', conf: 'MINE', price: { amount: 1, currency: 'AUD' } }], hotel, links);
    expect(kept.conf).toBe('MINE');
    expect(kept.price).toEqual({ amount: 1, currency: 'AUD' });
  });
});

import { summariseCancel } from './inbox';
describe('cancellation notes are short', () => {
  const ctx = { tripStart: '2027-01-22', tripEnd: '2027-02-08', received: '2026-11-27' };
  it('keeps only dated free / partial refund terms', () => {
    const policy = `Cancellation policy: You can cancel for free until 23:59 on 24 January 2027.
If you cancel between 25 January and 26 January 2027 you will receive a 50% refund of the total.
After that the booking is non-refundable. All prices are in JPY and include 10% consumption tax.
The property may pre-authorise your card. Please note currency conversion fees may apply.`;
    expect(summariseCancel(policy, ctx)).toBe('Free cancellation until 24 Jan 23:59 · 50% refund until 26 Jan');
  });
  it('says Non-refundable when that is all there is, and nothing for undated waffle', () => {
    expect(summariseCancel('This rate is non-refundable. Taxes included.', ctx)).toBe('Non-refundable');
    expect(summariseCancel('Free cancellation up to 48 hours before arrival. Currency: JPY.', ctx)).toBeUndefined();
    expect(summariseCancel('Prices include GST. Terms and conditions apply.', ctx)).toBeUndefined();
  });
  it('shortens what the AI wrote, or drops it', () => {
    const [b] = normalizeBookings({ bookings: [{ type: 'stay', name: 'X', checkIn: '2027-01-26', cancelBy: 'Free cancellation until Jan 24, 2027 (local time). Payment in JPY at the property.' }] }, ctx);
    expect(b.cancelBy).toBe('Free cancellation until 24 Jan');
    const [c] = normalizeBookings({ bookings: [{ type: 'stay', name: 'X', checkIn: '2027-01-26', cancelBy: 'Standard terms apply; see website for currency conditions' }] }, ctx);
    expect(c.cancelBy).toBeUndefined();
  });
});

import { parseAiAnswer } from './inbox';
describe('AI answers cut off part-way', () => {
  it('keeps the complete bookings and the finished fields of a cut-off one', () => {
    const cut = '{"bookings":[{"type":"flight","flightNo":"CX581","depDate":"2027-01-28","note":"has a } brace and \\"quote\\""},{"type":"flight","flightNo":"CX502","depDate":"2027-02-0';
    expect(parseAiAnswer(cut)).toEqual({ bookings: [{ type: 'flight', flightNo: 'CX581', depDate: '2027-01-28', note: 'has a } brace and "quote"' }, { type: 'flight', flightNo: 'CX502' }] });
  });
  it('keeps the fields before a value that ran on, even in the first booking', () => {
    const runaway = '{"bookings":[{"type":"stay","name":"Hotel Niseko","conf":"AB12","checkIn":"2027-01-25","address":"1-2 Kabayama ' + 'and so on '.repeat(400);
    expect(parseAiAnswer(runaway)).toEqual({ bookings: [{ type: 'stay', name: 'Hotel Niseko', conf: 'AB12', checkIn: '2027-01-25' }] });
    expect(parseAiAnswer('{"bookings":[{"type":"stay","name":"Hotel ' + 'x'.repeat(99))).toBeNull();
  });
  it('passes whole answers and objects through, and gives up on junk', () => {
    expect(parseAiAnswer('{"bookings":[]}')).toEqual({ bookings: [] });
    expect(parseAiAnswer({ bookings: [{ type: 'stay' }] })).toEqual({ bookings: [{ type: 'stay' }] });
    expect(parseAiAnswer('```json\n{"bookings":[{"type":"stay","name":"X"}]}\n```')).toEqual({ bookings: [{ type: 'stay', name: 'X' }] });
    expect(parseAiAnswer('not json')).toBeNull();
  });
});

import { enrichBookings as enrich2, normalizeBookings as norm2, parseMarkup as markup2 } from './inbox';
describe('local-language names and addresses from emails', () => {
  const jp = `【予約確認】ザ・ウェスティン ルスツリゾート
予約番号：WR12345
施設名：ザ・ウェスティン ルスツリゾート
住所：〒048-1711 北海道虻田郡留寿都村泉川133
電話番号：0136-46-3111
チェックイン：2027年1月25日`;
  it('Japanese email: the AI answer is kept when it was copied from the email', () => {
    const ai = norm2({ bookings: [{ type: 'stay', name: 'The Westin Rusutsu Resort', checkIn: '2027-01-25', localName: 'ザ・ウェスティン ルスツリゾート', localAddress: '〒048-1711 北海道虻田郡留寿都村泉川133', phone: '0136-46-3111' }] });
    const [b] = enrich2(ai, jp, []);
    expect(b.localName).toBe('ザ・ウェスティン ルスツリゾート');
    expect(b.localAddress).toBe('〒048-1711 北海道虻田郡留寿都村泉川133');
    expect(b.phone).toBe('0136-46-3111');
  });
  it('a translated or made-up local name is dropped, and the email’s own one is used instead', () => {
    const ai = norm2({ bookings: [{ type: 'stay', name: 'The Westin Rusutsu Resort', checkIn: '2027-01-25', localName: 'ウェスティンホテル留寿都', localAddress: '北海道留寿都村' }] });
    const [b] = enrich2(ai, jp, []);
    expect(b.localName).toBe('ザ・ウェスティン ルスツリゾート');
    expect(b.localAddress).toBe('〒048-1711 北海道虻田郡留寿都村泉川133');
  });
  it('mixed English/Japanese email: the Japanese address is found by rules when the AI misses it', () => {
    const mixed = `Reservation confirmed: Sushi Kanesaka
Date: 26 January 2027, 19:00, 2 guests
Address: 8-10-3 Ginza, Chuo-ku, Tokyo
〒104-0061 東京都中央区銀座8-10-3 B1F
Tel: 03-5568-4411`;
    const ai = norm2({ bookings: [{ type: 'restaurant', name: 'Sushi Kanesaka', date: '2027-01-26', time: '19:00' }] });
    const [b] = enrich2(ai, mixed, []);
    expect(b.localAddress).toBe('〒104-0061 東京都中央区銀座8-10-3 B1F');
    expect(b.phone).toBe('03-5568-4411');
    expect(b.localName).toBeUndefined();
  });
  it('English-only email: nothing local is invented; flights never get local text', () => {
    const ai = norm2({ bookings: [{ type: 'flight', flightNo: 'CX580', depDate: '2027-01-23', localName: '国泰航空' }, { type: 'stay', name: 'Hilton', checkIn: '2027-01-24', localName: 'ヒルトン' }] });
    const out = enrich2(ai, 'Flight CX580 23 Jan. Hilton Niseko Village, check in 24 Jan.', []);
    expect(out[0].localName).toBeUndefined();
    expect(out[1].localName).toBeUndefined();
  });
  it('booking markup: a Japanese name and address become the local ones', () => {
    const html = `<script type="application/ld+json">{"@type":"FoodEstablishmentReservation","reservationNumber":"R1","startTime":"2027-01-26T19:00:00+09:00",
      "reservationFor":{"@type":"FoodEstablishment","name":"鮨 かねさか","alternateName":"Sushi Kanesaka","telephone":"+81 3-5568-4411","address":"東京都中央区銀座8-10-3"}}</script>`;
    const [b] = enrich2(markup2(html), 'Your reservation is confirmed.', [], 'AUD', {}, true);
    expect(b).toMatchObject({ type: 'restaurant', name: 'Sushi Kanesaka', localName: '鮨 かねさか', localAddress: '東京都中央区銀座8-10-3', phone: '+81 3-5568-4411' });
  });
});
