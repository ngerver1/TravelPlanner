import { useState } from 'react';
import { fmtLong } from '../domain/dates';
import { MEALS, MEAL_LABEL, SLOTS, SLOT_LABEL } from '../domain/constants';
import type { Lane } from '../domain/plan';
import type { Item } from '../domain/types';
import { Modal } from './ui';

/** "Move to…": pick a day and a slot/meal, or send it back to the ideas list. Nothing needs dragging. */
export function MoveSheet({ item, pi, dates, defaultDate, onMove, onUnplace, onEdit, onClose }: {
  item: Item; pi: number; dates: string[]; defaultDate?: string;
  onMove: (lane: Lane) => void; onUnplace: () => void; onEdit: () => void; onClose: () => void;
}) {
  const p = pi >= 0 ? item.placements[pi] : undefined;
  const [date, setDate] = useState(p?.date || defaultDate || dates[0] || '');
  const lanes: { key: string; label: string; lane: Lane }[] = item.kind === 'restaurant'
    ? MEALS.map((m) => ({ key: m, label: MEAL_LABEL[m], lane: { date, meal: m } }))
    : [{ key: 'none', label: 'Day, no slot yet', lane: { date } }, ...SLOTS.map((s) => ({ key: s, label: SLOT_LABEL[s], lane: { date, slot: s } }))];
  const current = p ? (p.meal || p.slot || 'none') : '';
  return (
    <Modal title={`Move “${item.title || 'Untitled'}” to…`} onClose={onClose}
      footer={<>
        {p && <button className="btn" onClick={onUnplace}>↩ Back to ideas</button>}
        <span className="grow" />
        <button className="btn ghost" onClick={onEdit}>Edit details</button>
      </>}>
      <label className="field"><span>Day</span>
        <select value={date} onChange={(e) => setDate(e.target.value)}>
          {dates.map((d) => <option key={d} value={d}>{fmtLong(d)}</option>)}
        </select>
      </label>
      <div className="move-lanes">
        {lanes.map((l) => (
          <button key={l.key} className={'btn' + (p && p.date === date && current === l.key ? ' on' : '')} onClick={() => onMove(l.lane)}>{l.label}</button>
        ))}
      </div>
      {item.kind === 'restaurant' && <p className="muted small">Places to eat can be an option on several days; this adds or moves one option.</p>}
    </Modal>
  );
}
