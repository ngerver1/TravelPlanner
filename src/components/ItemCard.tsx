import type { ReactNode } from 'react';
import { CATEGORIES, RESTAURANT_ICON } from '../domain/constants';
import type { Item, Placement, Status } from '../domain/types';
import { StatusPill } from './ui';
import { mapsLink } from '../domain/maps';
import { fmtPrice } from '../domain/money';
import { LocalButton, cardFor } from './LocalCard';

export const itemIcon = (it: Item) => (it.kind === 'restaurant' ? RESTAURANT_ICON : CATEGORIES[it.category || 'other'].icon);
export const sizeLabel = (it: Item) =>
  it.kind !== 'activity' ? '' : it.size === 'full' ? (it.includesEvening ? 'Full day + eve' : 'Full day') : it.size === 'half' ? '½ day' : '';

/** One item as a compact card. Used in day lanes, the ideas list and location pages. */
export function ItemCard({ item, placement, onOpen, onEdit, onStatus, onMove, onChosen, dim, extra, className, area }: {
  item: Item; placement?: Placement; onOpen: () => void; onEdit?: () => void; onStatus: (s: Status) => void; onMove?: () => void;
  onChosen?: () => void; dim?: boolean; extra?: ReactNode; className?: string; area?: string;
}) {
  const size = sizeLabel(item);
  return (
    <div className={'icard' + (dim ? ' dim' : '') + (item.done ? ' done' : '') + (placement?.chosen ? ' chosen' : '') + (className ? ' ' + className : '')}
      onClick={onOpen} role="button" tabIndex={-1}>
      <span className="ic-i" aria-hidden="true">{itemIcon(item)}</span>
      <span className="ic-main">
        <span className="ic-title">
          {placement?.time && <span className="ic-time">{placement.time}</span>}
          {item.mustDo && <span className="ic-star" title="Must do">★</span>}
          {item.title || 'Untitled'}
        </span>
        {(
          <span className="ic-sub">
            <MapLink href={mapsLink(item.place, item.title, area)} pinned={!!item.place?.mapsUrl || item.place?.lat != null} />
            <LocalButton className="sm" data={cardFor(item.place?.name || item.title, item.local, { phone: item.phone, pos: item.place?.lat != null ? { lat: item.place.lat, lng: item.place.lng! } : null, context: `${item.place?.address || ''} ${area || ''}` })} />
            {size && <span className={'ic-size ' + item.size}>{size}</span>}
            {item.price && <span className="ic-cost">{fmtPrice(item.price)}</span>}
            {item.place?.name && item.place.name !== item.title && <span className="ic-place">{item.place.name}</span>}
            {extra}
          </span>
        )}
      </span>
      {onChosen && (
        <button type="button" className={'ic-pick' + (placement?.chosen ? ' on' : '')} title={placement?.chosen ? 'The pick for this meal (tap to clear)' : 'Make this the pick for this meal'}
          aria-label="Pick for this meal" onClick={(e) => { e.stopPropagation(); onChosen(); }} onPointerDown={(e) => e.stopPropagation()}>
          {placement?.chosen ? '✓' : '○'}
        </button>
      )}
      <span onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
        <StatusPill small value={item.status} onChange={onStatus} />
      </span>
      {onMove && (
        <button type="button" className="ic-menu" aria-label="Move to another day or slot" title="Move to…"
          onClick={(e) => { e.stopPropagation(); onMove(); }} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 5h9M9.5 2.5 12 5 9.5 7.5M13 11H4M6.5 8.5 4 11l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      <button type="button" className="ic-menu" aria-label="Edit" title="Edit"
        onClick={(e) => { e.stopPropagation(); (onEdit ?? onOpen)(); }} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>⋯</button>
    </div>
  );
}

/** Small "Map" link that opens Google Maps (exact place if linked, otherwise a search). */
export function MapLink({ href, pinned, label = 'Map' }: { href: string; pinned?: boolean; label?: string }) {
  return (
    <a className={'maplink' + (pinned ? ' pinned' : '')} href={href} target="_blank" rel="noreferrer"
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
      title={pinned ? 'Open this place in Google Maps' : 'Search Google Maps'}>
      <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M8 15s5-4.6 5-8.5A5 5 0 0 0 3 6.5C3 10.4 8 15 8 15z" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="8" cy="6.5" r="1.8" fill="currentColor" /></svg>
      {label}
    </a>
  );
}
