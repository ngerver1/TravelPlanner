import { useState } from 'react';
import { MAX_SPAN, diffDays, fmt, isDate } from '../domain/dates';
import type { TripDoc } from '../domain/types';
import { DateInput } from './inputs';
import { Field, Modal } from './ui';

const datesLabel = (s: string, e: string) => {
  if (!isDate(s) || !isDate(e)) return '';
  const sameYear = s.slice(0, 4) === e.slice(0, 4);
  return `${fmt(s, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })} – ${fmt(e, { day: 'numeric', month: 'short', year: 'numeric' })}`;
};

/** Top line: trip name, its dates and an Edit button. */
export function TripSettings({ trip, onChange }: { trip: TripDoc['trip']; onChange: (p: Partial<TripDoc['trip']>) => void }) {
  const [edit, setEdit] = useState(false);
  const has = isDate(trip.start) && isDate(trip.end);
  const n = has ? diffDays(trip.start, trip.end) + 1 : 0;
  return (
    <>
      <div className="trip-line">
        <b className="trip-title" onClick={() => setEdit(true)}>{trip.name || 'My trip'}</b>
        {has ? <span className="trip-dates">{datesLabel(trip.start, trip.end)} <span className="muted">· {n} day{n === 1 ? '' : 's'}</span></span>
          : <span className="trip-dates muted">No dates yet</span>}
        <button type="button" className={'btn sm' + (has ? ' ghost' : ' primary')} onClick={() => setEdit(true)}>{has ? 'Edit' : 'Set dates'}</button>
      </div>
      {edit && <TripDialog trip={trip} onClose={() => setEdit(false)} onSave={(p) => { onChange(p); setEdit(false); }} />}
    </>
  );
}

function TripDialog({ trip, onSave, onClose }: { trip: TripDoc['trip']; onSave: (p: TripDoc['trip']) => void; onClose: () => void }) {
  const [name, setName] = useState(trip.name);
  const [s, setS] = useState(trip.start);
  const [e, setE] = useState(trip.end);
  const valid = isDate(s) && isDate(e) && s <= e && diffDays(s, e) <= MAX_SPAN;
  const n = valid ? diffDays(s, e) : 0;
  return (
    <Modal title="Trip" onClose={onClose}
      footer={<><span className="grow" /><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!valid || !name.trim()} onClick={() => onSave({ name: name.trim(), start: s, end: e })}>Save</button></>}>
      <div className="grid2">
        <Field label="Name" span><input value={name} onChange={(ev) => setName(ev.target.value)} /></Field>
        <Field label="First day"><DateInput value={s} onChange={(ev) => { const v = ev.target.value; setS(v); if (isDate(v) && (!isDate(e) || e < v)) setE(v); }} /></Field>
        <Field label="Last day" hint={valid ? `${n + 1} days · ${n} nights` : s && e ? 'Last day must be on or after the first' : ''}><DateInput value={e} min={s || undefined} onChange={(ev) => setE(ev.target.value)} /></Field>
      </div>
      <p className="muted small">Changing the dates never deletes anything: plans that end up outside the trip are listed so you can extend it again.</p>
    </Modal>
  );
}
