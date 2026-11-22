import { DateInput, TimeInput } from './inputs';
import { addDays, diffDays, fmt, isDate } from '../domain/dates';
import { CATEGORIES, MEALS, MEAL_LABEL, RESTAURANT_ICON, SIZES, SIZE_LABEL } from '../domain/constants';
import type { ActivityCategory, Flight, ItemKind, ItemSize, Meal, Stay, Status } from '../domain/types';
import type { DayInfo } from '../domain/derive';
import { ConfirmDel, Field, LocDisplay, Modal, Seg, StatusSelect, useForm, type ColorOf } from './ui';

const Footer = ({ isNew, onDelete, onClose, onSave, disabled, deleteLabel }: {
  isNew?: boolean; onDelete: () => void; onClose: () => void; onSave: () => void; disabled?: boolean; deleteLabel?: string;
}) => (
  <>
    {!isNew && <ConfirmDel onDelete={onDelete} label={deleteLabel} />}
    <span className="grow" />
    <button className="btn ghost" onClick={onClose}>Cancel</button>
    <button className="btn primary" onClick={onSave} disabled={disabled}>Save</button>
  </>
);

// ---------- flight ----------
export type FlightDraft = Flight & { _new?: boolean };

export function FlightForm({ initial, onSave, onDelete, onClose }: {
  initial: FlightDraft; onSave: (f: FlightDraft) => void; onDelete: () => void; onClose: () => void;
}) {
  const [f, setF, bind] = useForm(initial);
  const up = (v: string) => v.toUpperCase();
  const iata = (v: string) => v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const bad = f.depDate && f.arrDate && (f.arrDate < f.depDate || (f.arrDate === f.depDate && f.arrTime && f.depTime && f.arrTime < f.depTime));
  const save = () => onSave({ ...f, arrDate: f.arrDate || f.depDate });
  return (
    <Modal title={initial._new ? 'Add flight' : 'Edit flight'} onClose={onClose}
      footer={<Footer isNew={initial._new} onDelete={onDelete} onClose={onClose} onSave={save} disabled={!f.depDate} />}>
      <div className="grid2">
        <Field label="Airline"><input {...bind('airline')} /></Field>
        <Field label="Flight number"><input {...bind('flightNo', up)} /></Field>
        <Field label="From (airport code)"><input {...bind('from', iata)} maxLength={3} autoCapitalize="characters" /></Field>
        <Field label="To (airport code)"><input {...bind('to', iata)} maxLength={3} autoCapitalize="characters" /></Field>
        <Field label="Departs (local date)"><DateInput {...bind('depDate')} onChange={(e) => { const v = e.target.value; setF((p) => ({ ...p, depDate: v, arrDate: !p.arrDate || p.arrDate < v ? v : p.arrDate })); }} /></Field>
        <Field label="Departure time (local)"><TimeInput {...bind('depTime')} /></Field>
        <Field label="Arrives (local date)" hint={bad ? 'Arrival looks earlier than departure' : 'Next day for overnight flights'}><DateInput {...bind('arrDate')} /></Field>
        <Field label="Arrival time (local)"><TimeInput {...bind('arrTime')} /></Field>
        <Field label="Status" span><StatusSelect value={f.status} onChange={(s) => setF((p) => ({ ...p, status: s }))} /></Field>
        <Field label="Confirmation #"><input {...bind('conf')} /></Field>
        <Field label="Notes" span><textarea rows={2} {...bind('notes')} /></Field>
      </div>
    </Modal>
  );
}

// ---------- stay ----------
export type StayDraft = Omit<Stay, 'locationId'> & { locationName: string; _new?: boolean };

export function StayForm({ initial, onSave, onDelete, onClose }: {
  initial: StayDraft; onSave: (s: StayDraft) => void; onDelete: () => void; onClose: () => void;
}) {
  const [f, setF, bind] = useForm(initial);
  const n = f.checkIn && f.checkOut ? diffDays(f.checkIn, f.checkOut) : 0;
  return (
    <Modal title={initial._new ? 'Add stay' : 'Edit stay'} onClose={onClose}
      footer={<Footer isNew={initial._new} onDelete={onDelete} onClose={onClose} onSave={() => onSave(f)} disabled={!f.checkIn || !f.checkOut || n < 1} />}>
      <div className="grid2">
        <Field label="Name" span><input {...bind('name')} placeholder="Hotel / apartment" autoFocus /></Field>
        <Field label="Location" hint="City or area: sets the day's location"><input list="known-locs" {...bind('locationName')} /></Field>
        <Field label="Address"><input {...bind('address')} /></Field>
        <Field label="Check-in"><DateInput {...bind('checkIn')} onChange={(e) => { const v = e.target.value; setF((p) => ({ ...p, checkIn: v, checkOut: !p.checkOut || p.checkOut <= v ? (v ? addDays(v, 1) : '') : p.checkOut })); }} /></Field>
        <Field label="Check-out" hint={n > 0 ? `${n} night${n > 1 ? 's' : ''}` : f.checkIn && f.checkOut ? 'Check-out must be after check-in' : ''}><DateInput {...bind('checkOut')} /></Field>
        <Field label="Check-in time (optional)"><TimeInput {...bind('checkInTime')} /></Field>
        <Field label="Check-out time (optional)"><TimeInput {...bind('checkOutTime')} /></Field>
        <Field label="Status" span><StatusSelect value={f.status} onChange={(s) => setF((p) => ({ ...p, status: s }))} /></Field>
        <Field label="Confirmation #"><input {...bind('conf')} /></Field>
        <Field label="Cost"><input {...bind('cost')} /></Field>
        <Field label="Link" span><input {...bind('link')} placeholder="https://" inputMode="url" /></Field>
        <Field label="Notes" span><textarea rows={2} {...bind('notes')} /></Field>
      </div>
    </Modal>
  );
}

// ---------- item (activity or restaurant) ----------
export interface ItemDraft {
  _new?: boolean;
  id: string;
  kind: ItemKind;
  title: string;
  locationName: string;
  category: ActivityCategory;
  size: ItemSize;
  includesEvening: boolean;
  meals: Meal[];
  cuisine: string;
  booking: string;
  status: Status;
  mustDo: boolean;
  done: boolean;
  placeName: string;
  link: string;
  notes: string;
  /** The placement being edited (-1: none; a date then adds one). */
  pi: number;
  date: string;
  time: string;
  meal: Meal;
  /** Read-only summary of other placements. */
  elsewhere: string[];
}

export function ItemForm({ initial, trip, onSave, onDelete, onClose }: {
  initial: ItemDraft; trip: { start: string; end: string }; onSave: (f: ItemDraft) => void; onDelete: () => void; onClose: () => void;
}) {
  const [f, setF, bind] = useForm(initial);
  const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) => setF((p) => ({ ...p, [k]: v }));
  const outside = f.date && (!isDate(trip.start) || f.date < trip.start || f.date > trip.end);
  const placed = initial.pi >= 0;
  return (
    <Modal title={initial._new ? 'Add idea' : 'Edit'} onClose={onClose}
      footer={<Footer isNew={initial._new} onDelete={onDelete} onClose={onClose} onSave={() => onSave(f)} disabled={!f.title.trim()} />}>
      <div className="grid2">
        <Field label="Title" span><input {...bind('title')} autoFocus={initial._new} /></Field>
        <Field label="Type" span>
          <Seg value={f.kind} onChange={(k) => set('kind', k)} options={[['activity', '🎟 Thing to do'], ['restaurant', `${RESTAURANT_ICON} Place to eat`]]} />
        </Field>
        <Field label="Status" span><StatusSelect value={f.status} onChange={(s) => set('status', s)} /></Field>
        <Field label="Flags" span>
          <div className="row gap wrap">
            <button type="button" className={'btn sm' + (f.mustDo ? ' on' : '')} onClick={() => set('mustDo', !f.mustDo)}>★ Must do</button>
            <button type="button" className={'btn sm' + (f.done ? ' on' : '')} onClick={() => set('done', !f.done)}>✓ Done</button>
          </div>
        </Field>
        {f.kind === 'activity' ? (<>
          <Field label="How long" span>
            <div className="row gap wrap">
              <Seg value={f.size} onChange={(v) => set('size', v)} options={SIZES.map((z) => [z, SIZE_LABEL[z]] as [ItemSize, string])} />
              {f.size === 'full' && <label className="check"><input type="checkbox" checked={f.includesEvening} onChange={(e) => set('includesEvening', e.target.checked)} /> includes the evening</label>}
            </div>
          </Field>
          <Field label="Category" span>
            <div className="seg">{(Object.keys(CATEGORIES) as ActivityCategory[]).map((k) => (
              <button type="button" key={k} className={f.category === k ? 'on' : ''} onClick={() => set('category', k)}>{CATEGORIES[k].icon} {CATEGORIES[k].label}</button>
            ))}</div>
          </Field>
        </>) : (<>
          <Field label="Good for" span hint="Leave all off if it suits any meal">
            <div className="seg">{MEALS.map((m) => (
              <button type="button" key={m} className={f.meals.includes(m) ? 'on' : ''}
                onClick={() => set('meals', f.meals.includes(m) ? f.meals.filter((x) => x !== m) : [...f.meals, m])}>{MEAL_LABEL[m]}</button>
            ))}</div>
          </Field>
          <Field label="Cuisine"><input {...bind('cuisine')} /></Field>
          <Field label="Booking"><input {...bind('booking')} placeholder="e.g. booked 19:00, ref 1234" /></Field>
        </>)}
        <Field label="Location" hint="Whose list of ideas it belongs to"><input list="known-locs" {...bind('locationName')} /></Field>
        <Field label="Place"><input {...bind('placeName')} /></Field>
        <Field label="Link" span><input {...bind('link')} placeholder="https://" inputMode="url" /></Field>
        <Field label="Notes" span><textarea rows={3} {...bind('notes')} /></Field>
        <div className="field span sub-h"><span>{placed ? 'On this day' : 'Put it on a day (optional)'}</span></div>
        <Field label="Day" hint={placed && !f.date ? 'Empty: goes back to the ideas list' : outside ? 'Outside the trip dates' : ''}>
          <DateInput {...bind('date')} />
        </Field>
        <Field label="Time (optional)"><TimeInput {...bind('time')} /></Field>
        {f.kind === 'restaurant' && f.date && (
          <Field label="Meal" span><Seg value={f.meal} onChange={(m) => set('meal', m)} options={MEALS.map((m) => [m, MEAL_LABEL[m]] as [Meal, string])} /></Field>
        )}
        {f.elsewhere.length > 0 && <p className="muted small span">Also an option on: {f.elsewhere.join(', ')}</p>}
      </div>
    </Modal>
  );
}

// ---------- locations ----------
export interface RangeDraft { from: string; to: string; loc: string; loc2: string; clear?: boolean }

export function RangeLocForm({ initial, trip, onApply, onClose }: {
  initial: RangeDraft; trip: { start: string; end: string }; onApply: (f: RangeDraft) => void; onClose: () => void;
}) {
  const [f, , bind] = useForm(initial);
  const valid = isDate(f.from) && isDate(f.to) && f.from <= f.to;
  const n = valid ? diffDays(f.from, f.to) + 1 : 0;
  return (
    <Modal title="Set location for a range of days" onClose={onClose}
      footer={<>
        <button className="btn ghost" disabled={!valid} onClick={() => onApply({ ...f, clear: true })}>Reset range to auto</button>
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!valid || !f.loc.trim()} onClick={() => onApply(f)}>Set {n ? `${n} day${n > 1 ? 's' : ''}` : ''}</button>
      </>}>
      <div className="grid2">
        <Field label="From"><DateInput {...bind('from')} min={trip.start} max={trip.end} /></Field>
        <Field label="To"><DateInput {...bind('to')} min={trip.start} max={trip.end} /></Field>
        <Field label="Location"><input list="known-locs" {...bind('loc')} autoFocus /></Field>
        <Field label="Travelling to (optional)" hint="For travel days, e.g. Sapporo → Tokyo"><input list="known-locs" {...bind('loc2')} /></Field>
      </div>
      <p className="muted small">These days become manual. “Reset range to auto” goes back to locations worked out from your stays and flights.</p>
    </Modal>
  );
}

export interface DayDraft { loc: string; loc2: string; notes: string }

export function DayForm({ date, info, onSave, onReset, onClose, colorOf }: {
  date: string; info: DayInfo; onSave: (f: DayDraft) => void; onReset: () => void; onClose: () => void; colorOf: ColorOf;
}) {
  const m = info.loc?.manual ? info.loc : null;
  const [f, , bind] = useForm<DayDraft>({ loc: m?.a.name || '', loc2: m?.b?.name || '', notes: info.notes || '' });
  return (
    <Modal title={fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })} onClose={onClose}
      footer={<>
        {info.loc?.manual && <button className="btn ghost" onClick={onReset}>Reset location to auto</button>}
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave(f)}>Save</button>
      </>}>
      <p className="muted small">Auto location: {info.auto ? <LocDisplay loc={info.auto} colorOf={colorOf} size="sm" /> : 'none (add a stay or flight)'}</p>
      <div className="grid2">
        <Field label="Location (leave empty for auto)"><input list="known-locs" {...bind('loc')} /></Field>
        <Field label="Travelling to (optional)"><input list="known-locs" {...bind('loc2')} /></Field>
        <Field label="Notes" span><textarea rows={3} {...bind('notes')} /></Field>
      </div>
    </Modal>
  );
}
