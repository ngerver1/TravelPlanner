import { fmtLong, fmtShort } from '../domain/dates';
import { Icon, ModeIcon } from '../components/Icons';
import { flightLabel, type Derived } from '../domain/derive';
import { fmtPrice } from '../domain/money';
import type { Flight, Status, TransportLeg } from '../domain/types';
import { legRoute, legTitle } from '../components/BookingViews';
import { LocDisplay, StatusPill } from '../components/ui';

export interface TravelActions {
  addFlight: (d?: string) => void;
  openFlight: (f: Flight) => void;
  patchFlight: (id: string, p: Partial<Flight>) => void;
  addLeg: (p: { date?: string; fromLoc?: string; toLoc?: string }) => void;
  openLeg: (l: TransportLeg) => void;
  patchLeg: (id: string, p: Partial<TransportLeg>) => void;
}

type Row = { key: string; date: string; t: string; kind: 'flight'; f: Flight } | { key: string; date: string; t: string; kind: 'leg'; l: TransportLeg };

/** Flights and other transport in date order, with the days that still need transport at the top. */
export function TravelPage({ dv, actions }: { dv: Derived; actions: TravelActions }) {
  const locName = (id?: string) => (id ? dv.locById.get(id)?.name || '' : '');
  const rows: Row[] = [
    ...dv.flights.map((f) => ({ key: 'f' + f.id, date: f.depDate, t: f.depTime, kind: 'flight' as const, f })),
    ...dv.legs.map((l) => ({ key: 'l' + l.id, date: l.date, t: l.depTime, kind: 'leg' as const, l })),
  ].sort((a, b) => `${a.date || '9999'} ${a.t || '99'}`.localeCompare(`${b.date || '9999'} ${b.t || '99'}`));
  return (
    <div className="page">
      <h2 className="page-h">Travel</h2>
      <div className="panel-actions row gap wrap">
        <button className="btn primary" onClick={() => actions.addFlight()}>+ Add flight</button>
        <button className="btn primary" onClick={() => actions.addLeg({})}>+ Add transport</button>
      </div>
      {dv.transportGaps.length > 0 && (
        <>
          <h4 className="sec-h">Need transport ({dv.transportGaps.length})</h4>
          <ul className="uncov">
            {dv.transportGaps.map((d) => {
              const loc = dv.info[d].loc;
              return (
                <li key={d}>
                  <span><b>{fmtLong(d)}</b> {loc && <LocDisplay loc={loc} colorOf={dv.colorOf} size="sm" />}</span>
                  <button className="link sm" onClick={() => actions.addLeg({ date: d, fromLoc: loc?.b ? loc.a.name : '', toLoc: (loc?.b ?? loc?.a)?.name })}>+ transport</button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <h4 className="sec-h">All travel ({rows.length})</h4>
      {!rows.length && <p className="muted small">No flights or transport yet. Times are local; overnight trips show on both days.</p>}
      {rows.map((r) => r.kind === 'flight' ? (
        <div key={r.key} className="card" onClick={() => actions.openFlight(r.f)}>
          <div className="card-row"><b><Icon name="flight" /> {flightLabel(r.f)} {r.f.from || '?'} → {r.f.to || '?'}</b><StatusPill small value={r.f.status} onChange={(s: Status) => actions.patchFlight(r.f.id, { status: s })} /></div>
          <div className="card-row muted small">
            <span>{r.f.airline}</span>
            <span>{fmtLong(r.f.depDate)} {r.f.depTime} → {r.f.arrDate && r.f.arrDate !== r.f.depDate ? fmtShort(r.f.arrDate) + ' ' : ''}{r.f.arrTime}</span>
          </div>
          {(r.f.conf || r.f.price) && <div className="card-row small muted"><span>{[r.f.price && fmtPrice(r.f.price), r.f.conf && `#${r.f.conf}`].filter(Boolean).join(' · ')}</span></div>}
        </div>
      ) : (
        <div key={r.key} className="card" onClick={() => actions.openLeg(r.l)}>
          <div className="card-row"><b><ModeIcon mode={r.l.mode} /> {legTitle(r.l)}</b><StatusPill small value={r.l.status} onChange={(s: Status) => actions.patchLeg(r.l.id, { status: s })} /></div>
          <div className="card-row muted small">
            <span>{legRoute(r.l, locName)}</span>
            <span>{r.l.date ? fmtLong(r.l.date) : 'No date'} {r.l.depTime}{r.l.arrDate ? ` → ${fmtShort(r.l.arrDate)} ${r.l.arrTime}` : r.l.arrTime ? `–${r.l.arrTime}` : ''}</span>
          </div>
          {(r.l.conf || r.l.price) && <div className="card-row small muted"><span>{[r.l.price && fmtPrice(r.l.price), r.l.conf && `#${r.l.conf}`].filter(Boolean).join(' · ')}</span></div>}
        </div>
      ))}
    </div>
  );
}
