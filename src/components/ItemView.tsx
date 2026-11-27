// Read-only view of an idea: everything clickable (website, Google Maps, links in notes, its days).
import type { ReactNode } from 'react';
import { fmt } from '../domain/dates';
import { CATEGORIES, MEAL_LABEL, SLOT_LABEL } from '../domain/constants';
import { mapsLink, placeQuery } from '../domain/maps';
import { GoogleMap } from './GoogleMap';
import { fmtPrice } from '../domain/money';
import type { Item, Status, TransportLeg } from '../domain/types';
import { MODE_LABEL, STATUS_LABEL } from '../domain/constants';
import { ModeIcon } from './Icons';
import { itemIcon, sizeLabel } from './ItemCard';
import { LocChip, Modal, StatusPill, type ColorOf } from './ui';
import { LocalButton, cardFor } from './LocalCard';
import { LocalRow, PhoneRow } from './BookingViews';

/** Turn web addresses in text into links. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return <>{parts.map((p, i) => (/^https?:\/\//.test(p)
    ? <a key={i} href={p.replace(/[.,;:!?)]+$/, '')} target="_blank" rel="noreferrer">{p.replace(/^https?:\/\/(www\.)?/, '').replace(/[.,;:!?)]+$/, '').slice(0, 60)}</a>
    : <span key={i}>{p}</span>))}</>;
}
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export function ItemView({ item, location, colorOf, onEdit, onMove, onStatus, onGoDay, onClose, otherOptions, legs = [], onOpenLeg, onAddLeg }: {
  item: Item; location?: { id: string; name: string }; colorOf: ColorOf;
  /** How many other places to eat are options for the same day and meal. */
  otherOptions?: (date: string, meal: string) => number;
  /** Transport bookings linked to this item. */
  legs?: TransportLeg[]; onOpenLeg?: (l: TransportLeg) => void; onAddLeg?: (role: 'to' | 'from') => void;
  onEdit: () => void; onMove: () => void; onStatus: (s: Status) => void; onGoDay: (d: string) => void; onClose: () => void;
}) {
  const p = item.place;
  const Row = ({ label, children }: { label: string; children: ReactNode }) => <div className="iv-row"><span className="iv-l">{label}</span><span className="iv-v">{children}</span></div>;
  const kind = item.kind === 'restaurant' ? 'Place to eat' : `${CATEGORIES[item.category || 'other'].label}${sizeLabel(item) ? ' · ' + sizeLabel(item) : ' · Quick'}`;
  return (
    <Modal title={item.title || 'Untitled'} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onMove}>⇄ Move</button>
        <span className="grow" />
        <button className="btn primary" onClick={onEdit}>Edit</button>
      </>}>
      <div className="iv-top">
        <span className="iv-icon">{itemIcon(item)}</span>
        <span className="muted small">{kind}</span>
        {item.mustDo && <span className="iv-flag">★ Must do</span>}
        {item.done && <span className="iv-flag">✓ Done</span>}
        <span className="grow" />
        <StatusPill value={item.status} onChange={onStatus} />
      </div>
      <div className="iv-links">
        <LocalButton label="Show local" data={cardFor(p?.name || item.title, item.local, { phone: item.phone, pos: p?.lat != null ? { lat: p.lat, lng: p.lng! } : null, context: `${p?.address || ''} ${location?.name || ''}` })} />
        <a className="btn" href={mapsLink(p, item.title, location?.name)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
        {item.link && <a className="btn" href={item.link} target="_blank" rel="noreferrer">{host(item.link)} ↗</a>}
      </div>
      <GoogleMap query={placeQuery(p, item.title, location?.name)} title={`Map of ${item.title}`} />
      <div className="iv-rows">
        {location && <Row label="Location"><LocChip loc={location} colorOf={colorOf} size="sm" /></Row>}
        <Row label="When">
          {item.placements.length ? (
            <span className="iv-days">{item.placements.map((pl, i) => (
              <button key={i} className="link" onClick={() => onGoDay(pl.date)}>
                {fmt(pl.date, { weekday: 'short', day: 'numeric', month: 'short' })}{pl.meal ? ` · ${MEAL_LABEL[pl.meal]}` : pl.slot ? ` · ${SLOT_LABEL[pl.slot]}` : ''}{pl.time ? ` · ${pl.time}` : ''}{(() => { const n = pl.chosen && pl.meal && otherOptions ? otherOptions(pl.date, pl.meal) : 0; return n ? ` · ✓ chosen over ${n} other option${n > 1 ? 's' : ''}` : ''; })()}
              </button>
            ))}</span>
          ) : <span className="muted">Not planned yet</span>}
        </Row>
        {(legs.length > 0 || (onAddLeg && item.placements.length > 0)) && (
          <Row label="Transport">
            <span className="iv-days">
              {legs.map((l) => (
                <button key={l.id} className="link" onClick={() => onOpenLeg?.(l)}>
                  {l.itemRole === 'from' ? 'Back: ' : 'There: '}<ModeIcon mode={l.mode} /> {l.operator || MODE_LABEL[l.mode]}{l.depTime ? ` · ${l.depTime}` : ''} <span className={`pill sm st-${l.status}`}>{STATUS_LABEL[l.status]}</span>
                </button>
              ))}
              {onAddLeg && item.placements.length > 0 && (
                <span className="row gap">
                  <button className="link small" onClick={() => onAddLeg('to')}>+ Getting there</button>
                  <button className="link small" onClick={() => onAddLeg('from')}>+ Getting back</button>
                </span>
              )}
            </span>
          </Row>
        )}
        {(p?.name && p.name !== item.title) || p?.address ? <Row label="Place">{[p?.name !== item.title ? p?.name : '', p?.address].filter(Boolean).join(', ')}</Row> : null}
        <LocalRow local={item.local} />
        <PhoneRow phone={item.phone} />
        {item.price && <Row label="Cost">{fmtPrice(item.price)}</Row>}
        {item.cuisine && <Row label="Cuisine">{item.cuisine}</Row>}
        {item.meals?.length ? <Row label="Good for">{item.meals.map((m) => MEAL_LABEL[m]).join(', ')}</Row> : null}
        {item.booking && <Row label="Booking"><Linkified text={item.booking} /></Row>}
        {item.link && <Row label="Link"><a href={item.link} target="_blank" rel="noreferrer" className="iv-url">{item.link}</a></Row>}
        {item.notes && <Row label="Notes"><span className="pre"><Linkified text={item.notes} /></span></Row>}
      </div>
    </Modal>
  );
}
