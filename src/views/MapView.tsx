import { lazy, Suspense, useMemo, useState } from 'react';
import { Icon } from '../components/Icons';
import { fmtLong } from '../domain/dates';
import type { Derived } from '../domain/derive';
import { dayRouteQueries, mapPoints, type MapFilter, type MapPoint } from '../domain/geo';
import { GoogleMap } from '../components/GoogleMap';
import type { TripDoc } from '../domain/types';
import type { Pin } from '../components/MapCanvas';
import { useOnline } from '../pwa';

const MapCanvas = lazy(() => import('../components/MapCanvas'));
const GoogleCanvas = lazy(() => import('../components/GoogleCanvas'));
import { hasGoogle } from '../sync/google';

export function toPins(points: MapPoint[], dv: Derived, onOpen: (p: MapPoint) => void): Pin[] {
  return points.map((p) => ({
    key: p.key, lat: p.lat, lng: p.lng, title: p.title, number: p.number, stay: p.kind === 'stay', filled: p.placed,
    color: p.locationId && dv.locById.get(p.locationId) ? dv.colorOf(p.locationId).solid : '#667085',
    onClick: () => onOpen(p),
  }));
}

export function Lazy({ children }: { children: React.ReactNode }) {
  const online = useOnline();
  if (!online) return <div className="mapcanvas map-offline">Map not available offline</div>;
  return <Suspense fallback={<div className="mapcanvas loading">Loading map…</div>}>{children}</Suspense>;
}

/** Map of the trip: pins for ideas and stays with a position, by location colour (filled = on a day). */
export function MapView({ doc, dv, onOpen }: { doc: TripDoc; dv: Derived; onOpen: (p: MapPoint) => void }) {
  const [filter, setFilter] = useState<MapFilter>({ by: 'all' });
  const { points, missing } = useMemo(() => mapPoints(doc, filter), [doc, filter]);
  const day = filter.by === 'day' ? dayRouteQueries(doc, dv, filter.date) : null;
  const dayRoute = day ? [day.origin, ...day.stops, day.destination].filter((v): v is string => !!v) : null;
  const pins = useMemo(() => toPins(points, dv, onOpen), [points, dv, onOpen]);
  const h = Math.max(300, Math.min(600, Math.round(window.innerHeight * 0.58)));
  const value = filter.by === 'all' ? 'all' : filter.by === 'day' ? 'd:' + filter.date : 'l:' + filter.id;
  return (
    <div className="mapview">
      <div className="row gap wrap map-bar">
        <select value={value} aria-label="Show" onChange={(e) => {
          const v = e.target.value;
          setFilter(v === 'all' ? { by: 'all' } : v.startsWith('d:') ? { by: 'day', date: v.slice(2) } : { by: 'location', id: v.slice(2) });
        }}>
          <option value="all">Everything</option>
          <optgroup label="A location">{dv.locOrder.map((l) => <option key={l.id} value={'l:' + l.id}>{l.name}</option>)}</optgroup>
          <optgroup label="A day">{dv.dates.map((d) => <option key={d} value={'d:' + d}>{fmtLong(d)}</option>)}</optgroup>
        </select>
        <span className="muted small">{filter.by === 'day' ? 'Google Maps: the day’s route, hotel to hotel' : `${pins.length} pinned · solid = on a day, hollow = idea`}</span>
      </div>
      {filter.by === 'day' ? (
        dayRoute?.length ? <GoogleMap route={dayRoute} height={h} title="Day route" /> : <p className="muted small">Nothing planned on this day yet.</p>
      ) : (<>
        <Lazy>{hasGoogle() ? <GoogleCanvas pins={pins} height={h} /> : <MapCanvas pins={pins} height={h} />}</Lazy>
        <p className="muted small">This overview pins things with an exact map position. To add one: open it → Edit → <b>Find on map</b>, or paste a long Google Maps link. Pick a day above to see it on Google Maps (by name, no position needed).</p>
      </>)}
      {filter.by !== 'day' && missing.length > 0 && (
        <details className="map-missing small">
          <summary>{missing.length} without a map position</summary>
          <div className="row gap wrap">
            {missing.map((m) => (
              <button key={m.id} className="btn sm" onClick={() => onOpen('title' in m
                ? { key: m.id, kind: 'item', lat: 0, lng: 0, title: m.title, placed: false, ref: { type: 'item', item: m, pi: m.placements.length ? 0 : -1 } }
                : { key: m.id, kind: 'stay', lat: 0, lng: 0, title: m.name, placed: true, ref: { type: 'stay', stay: m } })}>
                {'title' in m ? m.title || 'Untitled' : <><Icon name="stay" /> {m.name || 'Stay'}</>}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
