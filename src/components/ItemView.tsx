// Read-only view of an idea: everything clickable (website, Google Maps, links in notes, its days).
import type { ReactNode } from 'react';
import { fmt } from '../domain/dates';
import { CATEGORIES, MEAL_LABEL, SLOT_LABEL } from '../domain/constants';
import { mapsLink } from '../domain/maps';
import { fmtPrice } from '../domain/money';
import type { Item, Status } from '../domain/types';
import { itemIcon, sizeLabel } from './ItemCard';
import { LocChip, Modal, StatusPill, type ColorOf } from './ui';

/** Turn web addresses in text into links. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return <>{parts.map((p, i) => (/^https?:\/\//.test(p)
    ? <a key={i} href={p.replace(/[.,;:!?)]+$/, '')} target="_blank" rel="noreferrer">{p.replace(/^https?:\/\/(www\.)?/, '').replace(/[.,;:!?)]+$/, '').slice(0, 60)}</a>
    : <span key={i}>{p}</span>))}</>;
}
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export function ItemView({ item, location, colorOf, onEdit, onMove, onStatus, onGoDay, onClose }: {
  item: Item; location?: { id: string; name: string }; colorOf: ColorOf;
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
        <a className="btn" href={mapsLink(p, item.title, location?.name)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
        {item.link && <a className="btn" href={item.link} target="_blank" rel="noreferrer">{host(item.link)} ↗</a>}
      </div>
      <div className="iv-rows">
        {location && <Row label="Location"><LocChip loc={location} colorOf={colorOf} size="sm" /></Row>}
        <Row label="When">
          {item.placements.length ? (
            <span className="iv-days">{item.placements.map((pl, i) => (
              <button key={i} className="link" onClick={() => onGoDay(pl.date)}>
                {fmt(pl.date, { weekday: 'short', day: 'numeric', month: 'short' })}{pl.meal ? ` · ${MEAL_LABEL[pl.meal]}` : pl.slot ? ` · ${SLOT_LABEL[pl.slot]}` : ''}{pl.time ? ` · ${pl.time}` : ''}{pl.chosen ? ' (the pick)' : ''}
              </button>
            ))}</span>
          ) : <span className="muted">Not planned yet</span>}
        </Row>
        {(p?.name && p.name !== item.title) || p?.address ? <Row label="Place">{[p?.name !== item.title ? p?.name : '', p?.address].filter(Boolean).join(', ')}</Row> : null}
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
