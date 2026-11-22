import { addDays, diffDays, fmtLong, fmtShort } from '../domain/dates';
import { flightLabel, nightsOf, type Derived } from '../domain/derive';
import type { Flight, Stay, Status } from '../domain/types';
import { LocChip, StatusPill } from './ui';
import { MapLink } from './ItemCard';
import { mapsLink } from '../domain/maps';

export interface PanelActions {
  addStay: (from?: string, to?: string) => void;
  editStay: (s: Stay) => void;
  patchStay: (id: string, p: Partial<Stay>) => void;
  addFlight: (d?: string) => void;
  editFlight: (f: Flight) => void;
  patchFlight: (id: string, p: Partial<Flight>) => void;
}

export function StaysPanel({ dv, actions }: { dv: Derived; actions: PanelActions }) {
  const { stays, overlaps, uncovered, colorOf, locById } = dv;
  const locOf = (s: Stay) => { const l = s.locationId ? locById.get(s.locationId) : undefined; return l ? { id: l.id, name: l.name } : null; };
  return (
    <div className="panel-body">
      <div className="panel-actions"><button className="btn primary" onClick={() => actions.addStay()}>+ Add stay</button></div>
      {overlaps.length > 0 && (
        <div className="alert bad">
          <b>Overlapping stays</b>
          {overlaps.map(([a, b]) => (
            <div key={a.id + b.id}>“{a.name || 'Untitled'}” and “{b.name || 'Untitled'}” overlap ({fmtShort(a.checkIn > b.checkIn ? a.checkIn : b.checkIn)} – {fmtShort(a.checkOut < b.checkOut ? a.checkOut : b.checkOut)})</div>
          ))}
        </div>
      )}
      <h4>Nights still uncovered {uncovered.length ? `(${uncovered.reduce((n, r) => n + diffDays(r.from, r.to) + 1, 0)})` : ''}</h4>
      {dv.dates.length === 0 ? <p className="muted small">Set the trip dates first.</p>
        : uncovered.length === 0 ? <p className="muted small">Every night has a stay (or a plane seat).</p> : (
        <ul className="uncov">
          {uncovered.map((r) => (
            <li key={r.from}>
              <span><b>{r.from === r.to ? fmtLong(r.from) : `${fmtLong(r.from)} → ${fmtLong(r.to)}`}</b> <span className="muted">· {diffDays(r.from, r.to) + 1} night{r.from === r.to ? '' : 's'}</span></span>
              <button className="link sm" onClick={() => actions.addStay(r.from, addDays(r.to, 1))}>+ stay</button>
            </li>
          ))}
        </ul>
      )}
      <h4>All stays ({stays.length})</h4>
      {stays.length === 0 && <p className="muted small">No stays yet. Each stay fills in the location for the nights it covers.</p>}
      {stays.map((s) => (
        <div key={s.id} className="card" onClick={() => actions.editStay(s)}>
          <div className="card-row"><b>{s.name || 'Untitled stay'}</b><StatusPill small value={s.status} onChange={(st: Status) => actions.patchStay(s.id, { status: st })} /></div>
          <div className="card-row muted small">
            <span>{locOf(s) ? <LocChip loc={locOf(s)} colorOf={colorOf} size="sm" /> : 'No location'}</span>
            <span>{fmtShort(s.checkIn)} → {fmtShort(s.checkOut)} · {nightsOf(s)} night{nightsOf(s) === 1 ? '' : 's'} <MapLink href={mapsLink(s.place ?? { name: s.name, address: s.address }, s.name, locOf(s)?.name)} pinned={!!s.place?.mapsUrl} /></span>
          </div>
          {(s.cost || s.conf || s.link) && (
            <div className="card-row small muted">
              <span>{[s.cost, s.conf && `#${s.conf}`].filter(Boolean).join(' · ')}</span>
              {s.link && <a href={s.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="lnk">link ↗</a>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function FlightsPanel({ dv, actions }: { dv: Derived; actions: PanelActions }) {
  const { flights } = dv;
  return (
    <div className="panel-body">
      <div className="panel-actions"><button className="btn primary" onClick={() => actions.addFlight()}>+ Add flight</button></div>
      {flights.length === 0 && <p className="muted small">No flights yet. Times are local to each airport; an overnight flight shows on both days.</p>}
      {flights.map((f) => (
        <div key={f.id} className="card" onClick={() => actions.editFlight(f)}>
          <div className="card-row"><b>✈ {flightLabel(f)} {f.from || '?'} → {f.to || '?'}</b><StatusPill small value={f.status} onChange={(s) => actions.patchFlight(f.id, { status: s })} /></div>
          <div className="card-row muted small">
            <span>{f.airline}</span>
            <span>{fmtLong(f.depDate)} {f.depTime} → {f.arrDate && f.arrDate !== f.depDate ? fmtShort(f.arrDate) + ' ' : ''}{f.arrTime}</span>
          </div>
          {f.conf && <div className="card-row small muted"><span>#{f.conf}</span></div>}
        </div>
      ))}
    </div>
  );
}
