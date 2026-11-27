// Read-only views of a stay and a flight, with everything clickable.
import { useState, type ReactNode } from 'react';
import { fmt, diffDays } from '../domain/dates';
import { flightLabel } from '../domain/derive';
import { airportQuery, mapsLink, placeQuery } from '../domain/maps';
import { GoogleMap } from './GoogleMap';
import { fmtPrice } from '../domain/money';
import type { Flight, Item, Status, Stay, TransportLeg } from '../domain/types';
import { MODE_LABEL } from '../domain/constants';
import { Icon, ModeIcon } from './Icons';
import { Linkified } from './ItemView';
import { LocChip, Modal, StatusPill, type ColorOf } from './ui';
import { LocalButton, cardFor } from './LocalCard';
import { telHref } from '../domain/local';
import type { LocalText } from '../domain/types';

/** The local name and address, as a row in a read-only view. */
export const LocalRow = ({ local }: { local?: LocalText }) => (local?.name || local?.address)
  ? <div className="iv-row"><span className="iv-l">Local</span><span className="iv-v iv-local">{local.name && <b>{local.name}</b>}{local.address && <span>{local.address}</span>}</span></div> : null;
export const PhoneRow = ({ phone }: { phone?: string }) => phone
  ? <div className="iv-row"><span className="iv-l">Phone</span><span className="iv-v"><a href={telHref(phone)}>{phone}</a></span></div> : null;

const Row = ({ label, children }: { label: string; children: ReactNode }) => <div className="iv-row"><span className="iv-l">{label}</span><span className="iv-v">{children}</span></div>;
const day = (d: string) => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

function Conf({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="row gap">
      <b className="mono-ish">{value}</b>
      <button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } }}>{copied ? 'Copied' : 'Copy'}</button>
    </span>
  );
}

export function StayView({ stay: s, location, colorOf, onEdit, onStatus, onGoDay, onClose }: {
  stay: Stay; location?: { id: string; name: string }; colorOf: ColorOf;
  onEdit: () => void; onStatus: (st: Status) => void; onGoDay: (d: string) => void; onClose: () => void;
}) {
  const nights = s.checkIn && s.checkOut ? diffDays(s.checkIn, s.checkOut) : 0;
  return (
    <Modal title={s.name || 'Stay'} onClose={onClose} footer={<><span className="grow" /><button className="btn primary" onClick={onEdit}>Edit</button></>}>
      <div className="iv-top">
        <span className="iv-icon"><Icon name="stay" /></span>
        <span className="muted small">Stay{nights ? ` · ${nights} night${nights > 1 ? 's' : ''}` : ''}</span>
        <span className="grow" />
        <StatusPill value={s.status} onChange={onStatus} />
      </div>
      <div className="iv-links">
        <LocalButton label="Show local" data={cardFor(s.name || 'Hotel', s.local, { phone: s.phone, pos: s.place?.lat != null ? { lat: s.place.lat, lng: s.place.lng! } : null, context: `${s.address} ${location?.name || ''}` })} />
        <a className="btn" href={mapsLink(s.place ?? { name: s.name, address: s.address }, s.name, location?.name)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
        {s.link && <a className="btn" href={s.link} target="_blank" rel="noreferrer">{host(s.link)} ↗</a>}
      </div>
      <GoogleMap query={placeQuery(s.place ?? { name: s.name, address: s.address }, s.name || 'Hotel', location?.name)} title={`Map of ${s.name}`} />
      <div className="iv-rows">
        {location && <Row label="Location"><LocChip loc={location} colorOf={colorOf} size="sm" /></Row>}
        <Row label="Check in">{s.checkIn ? <button className="link" onClick={() => onGoDay(s.checkIn)}>{day(s.checkIn)}{s.checkInTime ? ` · from ${s.checkInTime}` : ''}</button> : '—'}</Row>
        <Row label="Check out">{s.checkOut ? <button className="link" onClick={() => onGoDay(s.checkOut)}>{day(s.checkOut)}{s.checkOutTime ? ` · by ${s.checkOutTime}` : ''}</button> : '—'}</Row>
        {s.address && <Row label="Address">{s.address}</Row>}
        <LocalRow local={s.local} />
        <PhoneRow phone={s.phone} />
        {s.conf && <Row label="Confirmation"><Conf value={s.conf} /></Row>}
        {(s.price || s.cost) && <Row label="Price">{s.price ? fmtPrice(s.price) : s.cost}</Row>}
        {s.link && <Row label="Link"><a href={s.link} target="_blank" rel="noreferrer" className="iv-url">{s.link}</a></Row>}
        {s.notes && <Row label="Notes"><span className="pre"><Linkified text={s.notes} /></span></Row>}
      </div>
    </Modal>
  );
}

/** Google maps of the departure and arrival airports, with a switch between them. */
function AirportMaps({ from, to }: { from: string; to: string }) {
  const [which, setWhich] = useState<'from' | 'to'>('from');
  const code = which === 'from' ? from : to;
  if (!from && !to) return null;
  return (
    <div className="airport-maps">
      <div className="seg sm">
        {from && <button type="button" className={which === 'from' ? 'on' : ''} onClick={() => setWhich('from')}>{from} airport</button>}
        {to && <button type="button" className={which === 'to' ? 'on' : ''} onClick={() => setWhich('to')}>{to} airport</button>}
      </div>
      {code && <GoogleMap key={code} query={airportQuery(code)} title={`${code} airport`} />}
    </div>
  );
}

export function FlightView({ flight: f, onEdit, onStatus, onGoDay, onClose }: {
  flight: Flight; onEdit: () => void; onStatus: (st: Status) => void; onGoDay: (d: string) => void; onClose: () => void;
}) {
  const overnight = f.arrDate && f.depDate && f.arrDate !== f.depDate;
  const airport = (code: string) => code ? <a href={mapsLink(undefined, airportQuery(code))} target="_blank" rel="noreferrer">{code} airport</a> : '?';
  const statusUrl = f.flightNo ? `https://www.google.com/search?q=${encodeURIComponent(`${f.flightNo} flight status`)}` : '';
  return (
    <Modal title={`${flightLabel(f)} ${f.from || '?'} → ${f.to || '?'}`} onClose={onClose} footer={<><span className="grow" /><button className="btn primary" onClick={onEdit}>Edit</button></>}>
      <div className="iv-top">
        <span className="iv-icon"><Icon name="flight" /></span>
        <span className="muted small">{f.airline || 'Flight'}{overnight ? ' · overnight' : ''}</span>
        <span className="grow" />
        <StatusPill value={f.status} onChange={onStatus} />
      </div>
      {(statusUrl || f.link) && <div className="iv-links">
        {statusUrl && <a className="btn" href={statusUrl} target="_blank" rel="noreferrer">Flight status ↗</a>}
        {f.link && <a className="btn" href={f.link} target="_blank" rel="noreferrer">{host(f.link)} ↗</a>}
      </div>}
      <AirportMaps from={f.from} to={f.to} />
      <div className="iv-rows">
        <Row label="Departs">{airport(f.from)} · {f.depDate ? <button className="link" onClick={() => onGoDay(f.depDate)}>{day(f.depDate)}</button> : '—'}{f.depTime ? ` · ${f.depTime}` : ''} <span className="muted small">(local)</span></Row>
        <Row label="Arrives">{airport(f.to)} · {f.arrDate ? <button className="link" onClick={() => onGoDay(f.arrDate)}>{day(f.arrDate)}</button> : '—'}{f.arrTime ? ` · ${f.arrTime}` : ''} <span className="muted small">(local)</span></Row>
        {f.conf && <Row label="Confirmation"><Conf value={f.conf} /></Row>}
        {f.price && <Row label="Price">{fmtPrice(f.price)}</Row>}
        {f.link && <Row label="Link"><a href={f.link} target="_blank" rel="noreferrer" className="iv-url">{f.link}</a></Row>}
        {f.notes && <Row label="Notes"><span className="pre"><Linkified text={f.notes} /></span></Row>}
      </div>
    </Modal>
  );
}

/** "Sapporo Stn → Rusutsu Resort" (typed names, else locations). */
export const legRoute = (l: TransportLeg, locName: (id?: string) => string) =>
  `${l.fromName || locName(l.fromLocationId) || '?'} → ${l.toName || locName(l.toLocationId) || '?'}`;
export const legTitle = (l: TransportLeg) => l.operator || MODE_LABEL[l.mode];

export function TransportView({ leg: l, locName, item, onEdit, onStatus, onGoDay, onOpenItem, onClose }: {
  leg: TransportLeg; locName: (id?: string) => string; item?: Item;
  onEdit: () => void; onStatus: (st: Status) => void; onGoDay: (d: string) => void; onOpenItem: (it: Item) => void; onClose: () => void;
}) {
  const from = l.fromName || locName(l.fromLocationId), to = l.toName || locName(l.toLocationId);
  const p = new URLSearchParams({ api: '1', ...(from ? { origin: [from, locName(l.fromLocationId)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') } : {}), destination: [to, locName(l.toLocationId)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') || '?', travelmode: l.mode === 'car' ? 'driving' : 'transit' });
  return (
    <Modal title={legTitle(l)} onClose={onClose} footer={<><span className="grow" /><button className="btn primary" onClick={onEdit}>Edit</button></>}>
      <div className="iv-top">
        <span className="iv-icon"><ModeIcon mode={l.mode} /></span>
        <span className="muted small">{MODE_LABEL[l.mode]} · {legRoute(l, locName)}</span>
        <span className="grow" />
        <StatusPill value={l.status} onChange={onStatus} />
      </div>
      <div className="iv-links">
        <LocalButton label={`Show local: ${from || 'from'}`} data={cardFor(from || 'From', l.fromLocal, { context: locName(l.fromLocationId) })} />
        <LocalButton label={`Show local: ${to || 'to'}`} data={cardFor(to || 'To', l.toLocal, { context: locName(l.toLocationId) })} />
        {to && <a className="btn" href={`https://www.google.com/maps/dir/?${p}`} target="_blank" rel="noreferrer">Directions ↗</a>}
        {l.link && <a className="btn" href={l.link} target="_blank" rel="noreferrer">{host(l.link)} ↗</a>}
      </div>
      {to && <GoogleMap route={[[from, locName(l.fromLocationId)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '), [to, locName(l.toLocationId)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ')].filter(Boolean)} mode={l.mode === 'car' ? 'driving' : 'transit'} title="Route" />}
      <div className="iv-rows">
        <Row label="Departs">{from || '?'} · {l.date ? <button className="link" onClick={() => onGoDay(l.date)}>{day(l.date)}</button> : '—'}{l.depTime ? ` · ${l.depTime}` : ''}</Row>
        <Row label="Arrives">{to || '?'} · {l.arrDate ? <button className="link" onClick={() => onGoDay(l.arrDate)}>{day(l.arrDate)}</button> : 'same day'}{l.arrTime ? ` · ${l.arrTime}` : ''}</Row>
        {l.fromLocal && <Row label="From (local)"><span className="iv-local">{l.fromLocal.name && <b>{l.fromLocal.name}</b>}{l.fromLocal.address && <span>{l.fromLocal.address}</span>}</span></Row>}
        {l.toLocal && <Row label="To (local)"><span className="iv-local">{l.toLocal.name && <b>{l.toLocal.name}</b>}{l.toLocal.address && <span>{l.toLocal.address}</span>}</span></Row>}
        {item && <Row label={l.itemRole === 'from' ? 'Getting back from' : 'Getting to'}><button className="link" onClick={() => onOpenItem(item)}>{item.title}</button></Row>}
        {l.conf && <Row label="Confirmation"><Conf value={l.conf} /></Row>}
        {(l.price || l.cost) && <Row label="Price">{l.price ? fmtPrice(l.price) : l.cost}</Row>}
        {l.link && <Row label="Link"><a href={l.link} target="_blank" rel="noreferrer" className="iv-url">{l.link}</a></Row>}
        {l.notes && <Row label="Notes"><span className="pre"><Linkified text={l.notes} /></span></Row>}
      </div>
    </Modal>
  );
}
