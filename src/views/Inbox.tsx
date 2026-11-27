import { useState } from 'react';
import { fmtLong } from '../domain/dates';
import { bookingTitle, findExisting, type Booking, type BookingType, type InboxEntry, type Match } from '../domain/inbox';
import { fmtPrice } from '../domain/money';
import type { TripDoc } from '../domain/types';

export interface InboxActions {
  /** Open the right editor, filled in from the booking (new), or the existing record with the booking's details merged in. */
  add: (entryId: string, index: number, b: Booking) => void;
  update: (entryId: string, index: number, b: Booking, m: Match) => void;
  /** Start a blank booking of a type from an email nothing could be read from. */
  addManual: (entryId: string, type: BookingType) => void;
  dismissBooking: (entryId: string, index: number) => void;
  dismissEntry: (entryId: string) => void;
}

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'Link'; } };

const SOURCE: Record<InboxEntry['source'], [string, string]> = {
  markup: ['Read from the booking details in the email', 'good'],
  ai: ['Read by AI: check the details', 'warn'],
  none: ['Not read automatically', 'muted'],
};

function details(b: Booking): string[] {
  const d = (x?: string) => (x ? fmtLong(x) : '');
  const lines: string[] = [];
  if (b.type === 'flight') lines.push([b.airline, `${d(b.depDate)} ${b.depTime || ''}`.trim() && `Departs ${d(b.depDate)} ${b.depTime || ''}`.trim(), (b.arrDate || b.arrTime) && `Arrives ${b.arrDate && b.arrDate !== b.depDate ? d(b.arrDate) + ' ' : ''}${b.arrTime || ''}`.trim()].filter(Boolean).join(' · '));
  if (b.type === 'stay') lines.push([b.city, b.checkIn && `${d(b.checkIn)}${b.checkInTime ? ' ' + b.checkInTime : ''} → ${d(b.checkOut)}${b.checkOutTime ? ' ' + b.checkOutTime : ''}`, b.address].filter(Boolean).join(' · '));
  if (b.type === 'transport') lines.push([b.date && `${d(b.date)} ${b.depTime || ''}${b.arrTime ? '–' + b.arrTime : ''}`.trim(), b.arrDate && `arrives ${d(b.arrDate)}`].filter(Boolean).join(' · '));
  if (b.type === 'restaurant' || b.type === 'activity') lines.push([b.date && `${d(b.date)} ${b.time || ''}`.trim(), b.city, b.partySize && `${b.partySize} people`, b.address].filter(Boolean).join(' · '));
  lines.push([b.conf && `Ref ${b.conf}`, b.price && fmtPrice(b.price)].filter(Boolean).join(' · '));
  if (!lines[0] && !b.depDate && !b.checkIn && !b.date) lines.unshift('No date found: add it when you save');
  return lines.filter(Boolean);
}

/** Bookings from forwarded emails, waiting for you to Add, Update or Dismiss. Nothing goes into the trip by itself. */
export function InboxPage({ entries, doc, actions, syncing }: { entries: InboxEntry[]; doc: TripDoc; actions: InboxActions; syncing: boolean }) {
  const list = [...entries].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return (
    <div className="page inbox">
      <h2 className="page-h">Inbox</h2>
      <p className="muted small">Bookings from emails you forward to <b>trips@aleagueapart.com</b>. Review each one: nothing is added to the trip until you save it.</p>
      {!syncing && <p className="alert warn small">Sync isn’t set up on this device, so the inbox can’t be read. Set it up in Settings.</p>}
      {syncing && !list.length && <p className="empty">Nothing waiting. Forward a booking confirmation to trips@aleagueapart.com and it will appear here within a minute (come back to the app, or tap Sync now in Settings).</p>}
      {list.map((e) => <Entry key={e.id} e={e} doc={doc} actions={actions} />)}
    </div>
  );
}

function Entry({ e, doc, actions }: { e: InboxEntry; doc: TripDoc; actions: InboxActions }) {
  const [label, tone] = SOURCE[e.source];
  const [showText, setShowText] = useState(e.bookings.length === 0);
  return (
    <section className="inbox-entry">
      <div className="ie-head">
        <div className="grow">
          <b>{e.subject || '(no subject)'}</b>
          <div className="muted small">{e.sender && <>{e.sender} · </>}{e.receivedAt && new Date(e.receivedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        </div>
        <button className="btn sm ghost" onClick={() => actions.dismissEntry(e.id)}>Dismiss email</button>
      </div>
      <div className={'ie-source small ' + tone}><span className={'sync-dot ' + tone} /> {label}</div>
      {e.note && <p className="small muted">{e.note}</p>}
      {e.bookings.map((b, i) => {
        const m = findExisting(doc, b);
        return (
          <div key={i} className="ie-booking">
            <div className="grow">
              <b>{bookingTitle(b)}</b>
              {details(b).map((l, j) => <div key={j} className="small muted">{l}</div>)}
              {b.link && <div className="small"><a href={b.link} target="_blank" rel="noreferrer">{hostOf(b.link)} ↗</a></div>}
              {m && <div className="small ie-match">Matches <b>{m.label}</b> already in your trip</div>}
            </div>
            <div className="ie-actions">
              {m ? <>
                <button className="btn sm primary" onClick={() => actions.update(e.id, i, b, m)}>Update existing</button>
                <button className="btn sm" onClick={() => actions.add(e.id, i, b)}>Add as new</button>
              </> : <button className="btn sm primary" onClick={() => actions.add(e.id, i, b)}>Add</button>}
              <button className="btn sm ghost" onClick={() => actions.dismissBooking(e.id, i)}>Dismiss</button>
            </div>
          </div>
        );
      })}
      {e.bookings.length === 0 && (
        <div className="ie-manual">
          <span className="small">Add it by hand as:</span>
          <div className="row gap wrap">
            {(['flight', 'stay', 'transport', 'restaurant', 'activity'] as BookingType[]).map((t) => (
              <button key={t} className="btn sm" onClick={() => actions.addManual(e.id, t)}>{t === 'stay' ? 'Stay' : t === 'activity' ? 'Thing to do' : t === 'restaurant' ? 'Place to eat' : t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>
      )}
      {e.links && e.links.length > 0 && (
        <div className="ie-links small">
          <span className="muted">Links in the email:</span>
          {e.links.slice(0, 6).map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.text} ↗</a>)}
        </div>
      )}
      {e.text && (
        <details open={showText} onToggle={(ev) => setShowText((ev.target as HTMLDetailsElement).open)} className="ie-text">
          <summary className="small">Email text</summary>
          <pre>{e.text}</pre>
          <button className="btn sm" onClick={() => navigator.clipboard?.writeText(e.text)}>Copy text</button>
        </details>
      )}
    </section>
  );
}
