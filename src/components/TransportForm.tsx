import { addDays, isDate } from '../domain/dates';
import { MODES, MODE_ICON, MODE_LABEL, MEAL_LABEL, SLOT_LABEL } from '../domain/constants';
import type { Item, TransportLeg } from '../domain/types';
import { DateInput, TimeInput } from './inputs';
import { LocationSelect } from './LocationSelect';
import { MoneyField, type MoneyDraft } from './MoneyField';
import { ConfirmDel, Field, Modal, Seg, StatusSelect, useForm } from './ui';

export type LegDraft = Omit<TransportLeg, 'fromLocationId' | 'toLocationId' | 'price' | 'itemId' | 'itemRole'> & {
  _new?: boolean; fromLoc: string; toLoc: string; priceDraft: MoneyDraft; itemId: string; itemRole: 'to' | 'from';
};

/** Items you could link a booking to: those on the booking's day (or all, if none that day). */
export function linkable(items: Item[], date: string): { item: Item; label: string }[] {
  const on = items.filter((i) => i.placements.some((p) => p.date === date));
  return on.map((i) => {
    const p = i.placements.find((q) => q.date === date)!;
    return { item: i, label: `${i.title}${p.meal ? ` (${MEAL_LABEL[p.meal]})` : p.slot ? ` (${SLOT_LABEL[p.slot]})` : ''}` };
  });
}

export function TransportForm({ initial, items, onSave, onDelete, onClose }: {
  initial: LegDraft; items: Item[]; onSave: (l: LegDraft) => void; onDelete: () => void; onClose: () => void;
}) {
  const [f, setF, bind] = useForm(initial);
  const set = <K extends keyof LegDraft>(k: K, v: LegDraft[K]) => setF((p) => ({ ...p, [k]: v }));
  const opts = linkable(items, f.date);
  const linked = f.itemId ? items.find((i) => i.id === f.itemId) : undefined;
  const bad = f.arrDate && f.date && f.arrDate < f.date;
  return (
    <Modal title={initial._new ? 'Add transport' : 'Edit transport'} onClose={onClose}
      footer={<>
        {!initial._new && <ConfirmDel onDelete={onDelete} />}
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!f.date} onClick={() => onSave(f)}>Save</button>
      </>}>
      <div className="grid2">
        <Field label="Type" span>
          <div className="seg">{MODES.map((m) => <button type="button" key={m} className={f.mode === m ? 'on' : ''} onClick={() => set('mode', m)}>{MODE_ICON[m]} {MODE_LABEL[m]}</button>)}</div>
        </Field>
        <Field label="Operator / service" span><input {...bind('operator')} placeholder="e.g. JR Hokkaido · Super Hokuto 3" /></Field>
        <Field label="From" hint="Station, stop or address"><input {...bind('fromName')} /></Field>
        <Field label="To"><input {...bind('toName')} /></Field>
        <Field label="From location" hint="Set both to make this a travel day"><LocationSelect {...bind('fromLoc')} /></Field>
        <Field label="To location"><LocationSelect {...bind('toLoc')} /></Field>
        <Field label="Date"><DateInput {...bind('date')} onChange={(e) => { const v = e.target.value; setF((p) => ({ ...p, date: v, arrDate: p.arrDate && p.arrDate <= v ? '' : p.arrDate, itemId: '' })); }} /></Field>
        <Field label="Departs"><TimeInput {...bind('depTime')} /></Field>
        <Field label="Arrives (date, if not the same day)" hint={bad ? 'Arrival is before departure' : 'For overnight ferries, buses or trains'}>
          <DateInput {...bind('arrDate')} min={f.date && isDate(f.date) ? addDays(f.date, 1) : undefined} />
        </Field>
        <Field label="Arrives"><TimeInput {...bind('arrTime')} /></Field>
        <Field label="Linked to (optional)" span hint={f.date ? (opts.length ? 'Shows next to it on the day' : 'Nothing planned on this day yet') : 'Set the date first'}>
          <span className="row gap wrap">
            <select value={f.itemId} onChange={(e) => set('itemId', e.target.value)} disabled={!f.date} className="grow">
              <option value="">— Not linked —</option>
              {linked && !opts.some((o) => o.item.id === linked.id) && <option value={linked.id}>{linked.title}</option>}
              {opts.map((o) => <option key={o.item.id} value={o.item.id}>{o.label}</option>)}
            </select>
            {f.itemId && <Seg value={f.itemRole} onChange={(r) => set('itemRole', r)} options={[['to', 'Getting there'], ['from', 'Getting back']]} />}
          </span>
        </Field>
        <Field label="Status" span><StatusSelect value={f.status} onChange={(s) => set('status', s)} /></Field>
        <Field label="Confirmation #"><input {...bind('conf')} /></Field>
        <Field label="Booking link"><input {...bind('link')} inputMode="url" placeholder="https://" /></Field>
        <MoneyField label="Price (optional)" value={f.priceDraft} onChange={(v) => set('priceDraft', v)} hint={f.cost ? `Old note: ${f.cost}` : undefined} />
        <Field label="Notes" span><textarea rows={2} {...bind('notes')} /></Field>
      </div>
    </Modal>
  );
}
