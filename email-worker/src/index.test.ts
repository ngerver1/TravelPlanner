import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { type Env } from './index';

const ME = 'me@gmail.com';
let gist: { content?: string };
let patches = 0;

beforeEach(() => {
  gist = {}; patches = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    expect(String(url)).toBe('https://api.github.com/gists/G1');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer ghp_test');
    if (init?.method === 'PATCH') { gist.content = JSON.parse(String(init.body)).files['inbox.json'].content; patches++; return new Response('{}'); }
    return new Response(JSON.stringify({ files: { 'trip.json': { content: JSON.stringify({ trip: { start: '2027-01-22', end: '2027-02-08' } }) }, ...(gist.content ? { 'inbox.json': { content: gist.content } } : {}) } }));
  }));
});

const env = (ai?: (input: unknown) => unknown): Env => ({
  AI: { run: vi.fn(async (_m: string, input: unknown) => { if (!ai) throw new Error('quota'); return ai(input); }) } as unknown as Ai,
  AI_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', GITHUB_TOKEN: 'ghp_test', GIST_ID: 'G1', ALLOWED_SENDERS: `${ME.toUpperCase()}, other@example.com`,
});
function msg(from: string, subject: string, body: string, html = false) {
  const raw = [`From: ${from}`, `To: trips@aleagueapart.com`, `Subject: ${subject}`, 'MIME-Version: 1.0',
    `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset=utf-8`, '', body].join('\r\n');
  let rejected = '';
  return {
    m: { from, to: 'trips@aleagueapart.com', raw: new Response(raw).body!, headers: new Headers(), rawSize: raw.length, canBeForwarded: true,
      setReject: (r: string) => { rejected = r; }, forward: async () => ({}), reply: async () => {} } as unknown as ForwardableEmailMessage,
    rejected: () => rejected,
  };
}
const inbox = () => JSON.parse(gist.content!).entries;

describe('email worker', () => {
  it('rejects anyone not on the allowed list, and stores nothing', async () => {
    const t = msg('stranger@spam.com', 'hi', 'buy now');
    await worker.email(t.m, env());
    expect(t.rejected()).toMatch(/only accepts/);
    expect(patches).toBe(0);
  });

  it('reads booking markup without using the AI', async () => {
    const ld = { '@type': 'FlightReservation', reservationNumber: 'ABC123', reservationFor: { flightNumber: '581', airline: { iataCode: 'CX', name: 'Cathay' },
      departureAirport: { iataCode: 'CTS' }, arrivalAirport: { iataCode: 'HKG' }, departureTime: '2027-01-28T16:05:00+09:00', arrivalTime: '2027-01-28T21:10:00+08:00' } };
    const e = env(() => { throw new Error('should not be called'); });
    await worker.email(msg(ME, 'Fwd: Your booking', `<script type="application/ld+json">${JSON.stringify(ld)}</script><p>Thanks</p>`, true).m, e);
    const [entry] = inbox();
    expect(entry).toMatchObject({ source: 'markup', subject: 'Your booking', bookings: [{ type: 'flight', flightNo: 'CX581', conf: 'ABC123' }] });
    expect(e.AI.run).not.toHaveBeenCalled();
  });

  it('falls back to Workers AI, and appends to what is already there', async () => {
    gist.content = JSON.stringify({ entries: [{ id: 'old', receivedAt: '2026-11-01T00:00:00Z', subject: 'Older', text: 'x', bookings: [] }] });
    const e = env(() => ({ response: { bookings: [{ type: 'stay', name: 'Snow Lodge', city: 'Rusutsu', checkIn: '2027-01-24', checkOut: '2027-01-26', conf: 'H-77', priceAmount: 42000, priceCurrency: 'JPY' }] } }));
    await worker.email(msg(ME, 'Booking confirmed', '---------- Forwarded message ---------\nFrom: Rusutsu Resort <stay@rusutsu.example>\nYour stay is confirmed...').m, e);
    const entries = inbox();
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ source: 'ai', sender: 'Rusutsu Resort', bookings: [{ type: 'stay', name: 'Snow Lodge', price: { amount: 42000, currency: 'JPY' } }] });
    const input = (e.AI.run as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(input.response_format.type).toBe('json_schema');
  });

  it('gives the AI the trip dates and numbered links; reads loose dates; attaches the booking link', async () => {
    const e = env((input) => {
      const user = (input as { messages: { content: string }[] }).messages[1].content;
      expect(user).toContain('Trip dates: 2027-01-22 to 2027-02-08');
      expect(user).toContain('[1] View your tickets — https://tl.example/t/9');
      return { response: { bookings: [{ type: 'activity', name: 'teamLab Planets', date: 'Fri 29 Jan', time: '10:00 AM', linkIndex: 1 }] } };
    });
    const html = '<p>Your tickets for Fri 29 Jan, 10:00 AM</p><a href="https://tl.example/t/9">View your tickets</a><a href="https://x.example/unsubscribe">Unsubscribe</a>';
    await worker.email(msg(ME, 'Fwd: teamLab tickets', html, true).m, e);
    const [entry] = inbox();
    expect(entry.bookings[0]).toEqual({ type: 'activity', name: 'teamLab Planets', date: '2027-01-29', time: '10:00', link: 'https://tl.example/t/9' });
    expect(entry.links).toEqual([{ text: 'View your tickets', url: 'https://tl.example/t/9' }]);
  });

  it('fills in reference, price, manage link, maps link and cancellation the AI missed', async () => {
    const body = ['Your booking is confirmed', 'Booking number: 4821.993.120', 'Shinjuku Granbell Hotel, Tue 26 Jan - Thu 28 Jan 2027',
      'Free cancellation until 23:59 on 24 January 2027', 'Total price', '¥ 52,400',
      'Manage booking: https://secure.booking.example/mybooking.html?bn=4821993120', 'Get directions <https://maps.app.goo.gl/AbC123>'].join('\n');
    await worker.email(msg(ME, 'Fwd: Booking confirmed', body).m, env(() => ({ response: { bookings: [{ type: 'stay', name: 'Shinjuku Granbell Hotel', checkIn: 'Tue 26 Jan', checkOut: 'Thu 28 Jan' }] } })));
    expect(inbox()[0].bookings[0]).toEqual({
      type: 'stay', name: 'Shinjuku Granbell Hotel', checkIn: '2027-01-26', checkOut: '2027-01-28', conf: '4821.993.120',
      price: { amount: 52400, currency: 'JPY' }, link: 'https://secure.booking.example/mybooking.html?bn=4821993120',
      mapsUrl: 'https://maps.app.goo.gl/AbC123', cancelBy: 'Free cancellation until 24 Jan 23:59',
    });
  });

  it('keeps the complete bookings when the AI answer is cut off', async () => {
    const cut = '{"bookings":[{"type":"flight","flightNo":"CX581","from":"CTS","to":"HKG","depDate":"2027-01-28","depTime":"16:05"},{"type":"flight","flightNo":"CX5';
    await worker.email(msg(ME, 'Itinerary', 'Your flights...').m, env(() => ({ response: cut })));
    expect(inbox()[0]).toMatchObject({ source: 'ai', bookings: [{ type: 'flight', flightNo: 'CX581', depDate: '2027-01-28' }] });
  });

  it('keeps the email text for hand entry when nothing can be read (e.g. AI quota used up)', async () => {
    await worker.email(msg(ME, 'Ski school', 'Lesson Tuesday 9am, ref SK-1').m, env());
    const [entry] = inbox();
    expect(entry).toMatchObject({ source: 'none', bookings: [] });
    expect(entry.text).toContain('ref SK-1');
    expect(entry.note).toMatch(/Couldn’t read automatically/);
  });

  it('lets Gmail’s forwarding confirmation code through, without the AI', async () => {
    const e = env(() => ({ response: { bookings: [] } }));
    await worker.email(msg('forwarding-noreply@google.com', 'Gmail Forwarding Confirmation', 'Confirmation code: 123456').m, e);
    expect(inbox()[0]).toMatchObject({ note: expect.stringMatching(/forwarding confirmation/i) });
    expect(inbox()[0].text).toContain('123456');
    expect(e.AI.run).not.toHaveBeenCalled();
  });
});
