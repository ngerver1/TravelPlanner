// Read-only views of a stay and a flight, with everything clickable.
import { useState, type ReactNode } from 'react';
import { fmt, diffDays } from '../domain/dates';
import { flightLabel } from '../domain/derive';
import { mapsLink } from '../domain/maps';
import { fmtPrice } from '../domain/money';
import type { Flight, Status, Stay } from '../domain/types';
import { Linkified } from './ItemView';
import { LocChip, Modal, StatusPill, type ColorOf } from './ui';

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
        <span className="iv-icon">🛏</span>
        <span className="muted small">Stay{nights ? ` · ${nights} night${nights > 1 ? 's' : ''}` : ''}</span>
        <span className="grow" />
        <StatusPill value={s.status} onChange={onStatus} />
      </div>
      <div className="iv-links">
        <a className="btn" href={mapsLink(s.place ?? { name: s.name, address: s.address }, s.name, location?.name)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
        {s.link && <a className="btn" href={s.link} target="_blank" rel="noreferrer">{host(s.link)} ↗</a>}
      </div>
      <div className="iv-rows">
        {location && <Row label="Location"><LocChip loc={location} colorOf={colorOf} size="sm" /></Row>}
        <Row label="Check in">{s.checkIn ? <button className="link" onClick={() => onGoDay(s.checkIn)}>{day(s.checkIn)}{s.checkInTime ? ` · from ${s.checkInTime}` : ''}</button> : '—'}</Row>
        <Row label="Check out">{s.checkOut ? <button className="link" onClick={() => onGoDay(s.checkOut)}>{day(s.checkOut)}{s.checkOutTime ? ` · by ${s.checkOutTime}` : ''}</button> : '—'}</Row>
        {s.address && <Row label="Address">{s.address}</Row>}
        {s.conf && <Row label="Confirmation"><Conf value={s.conf} /></Row>}
        {(s.price || s.cost) && <Row label="Price">{s.price ? fmtPrice(s.price) : s.cost}</Row>}
        {s.link && <Row label="Link"><a href={s.link} target="_blank" rel="noreferrer" className="iv-url">{s.link}</a></Row>}
        {s.notes && <Row label="Notes"><span className="pre"><Linkified text={s.notes} /></span></Row>}
      </div>
    </Modal>
  );
}

export function FlightView({ flight: f, onEdit, onStatus, onGoDay, onClose }: {
  flight: Flight; onEdit: () => void; onStatus: (st: Status) => void; onGoDay: (d: string) => void; onClose: () => void;
}) {
  const overnight = f.arrDate && f.depDate && f.arrDate !== f.depDate;
  const airport = (code: string) => code ? <a href={mapsLink(undefined, `${code} airport`)} target="_blank" rel="noreferrer">{code}</a> : '?';
  const statusUrl = f.flightNo ? `https://www.google.com/search?q=${encodeURIComponent(`${f.flightNo} flight status`)}` : '';
  return (
    <Modal title={`${flightLabel(f)} ${f.from || '?'} → ${f.to || '?'}`} onClose={onClose} footer={<><span className="grow" /><button className="btn primary" onClick={onEdit}>Edit</button></>}>
      <div className="iv-top">
        <span className="iv-icon">✈</span>
        <span className="muted small">{f.airline || 'Flight'}{overnight ? ' · overnight' : ''}</span>
        <span className="grow" />
        <StatusPill value={f.status} onChange={onStatus} />
      </div>
      {statusUrl && <div className="iv-links"><a className="btn" href={statusUrl} target="_blank" rel="noreferrer">Flight status ↗</a></div>}
      <div className="iv-rows">
        <Row label="Departs">{airport(f.from)} · {f.depDate ? <button className="link" onClick={() => onGoDay(f.depDate)}>{day(f.depDate)}</button> : '—'}{f.depTime ? ` · ${f.depTime}` : ''} <span className="muted small">(local)</span></Row>
        <Row label="Arrives">{airport(f.to)} · {f.arrDate ? <button className="link" onClick={() => onGoDay(f.arrDate)}>{day(f.arrDate)}</button> : '—'}{f.arrTime ? ` · ${f.arrTime}` : ''} <span className="muted small">(local)</span></Row>
        {f.conf && <Row label="Confirmation"><Conf value={f.conf} /></Row>}
        {f.price && <Row label="Price">{fmtPrice(f.price)}</Row>}
        {f.notes && <Row label="Notes"><span className="pre"><Linkified text={f.notes} /></span></Row>}
      </div>
    </Modal>
  );
}
