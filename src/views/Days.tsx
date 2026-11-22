import { useEffect, useState } from 'react';
import { fmt, fmtLong, fmtShort } from '../domain/dates';
import { CATEGORIES, MEAL_LABEL, RESTAURANT_ICON, SLOT_LABEL } from '../domain/constants';
import { flightLabel, type DayEntry, type DayInfo, type Derived } from '../domain/derive';
import type { Flight, Item, Status, Stay } from '../domain/types';
import { LocChip, LocDisplay, StatusPill, cssVars, type ColorOf } from '../components/ui';

export type QuickType = keyof typeof CATEGORIES | 'restaurant';

export interface DayActions {
  setDayLoc: (d: string, a: string, b: string) => void;
  editDay: (d: string) => void;
  addStay: (from?: string, to?: string) => void;
  editStay: (s: Stay) => void;
  patchStay: (id: string, p: Partial<Stay>) => void;
  editFlight: (f: Flight) => void;
  patchFlight: (id: string, p: Partial<Flight>) => void;
  editItem: (it: Item, pi: number) => void;
  newItem: (d: string) => void;
  patchItem: (id: string, p: Partial<Item>) => void;
  movePlacement: (id: string, pi: number, date: string | null) => void;
  quickAdd: (p: { date: string; title: string; time: string; type: QuickType }) => void;
}

const itemIcon = (it: Item) => (it.kind === 'restaurant' ? RESTAURANT_ICON : CATEGORIES[it.category || 'other'].icon);

export function DaysView({ dv, doc, focus, actions }: {
  dv: Derived; doc: { items: Item[] }; focus: { date: string; t: number } | null; actions: DayActions;
}) {
  const { dates, info, colorOf } = dv;
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById('day-' + focus.date);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
  }, [focus]);
  if (!dates.length) return null;
  const ideas = doc.items.filter((i) => i.placements.length === 0);
  return (
    <div className="itin">
      {ideas.length > 0 && <Ideas items={ideas} dv={dv} actions={actions} />}
      {dates.map((d, idx) => <DayCard key={d} d={d} idx={idx} x={info[d]} colorOf={colorOf} dates={dates} actions={actions} />)}
    </div>
  );
}

function Ideas({ items, dv, actions }: { items: Item[]; dv: Derived; actions: DayActions }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="iday ideas">
      <header className="iday-h clickable" onClick={() => setOpen(!open)}>
        <b>💡 Ideas not on a day yet ({items.length})</b>
        <span className="muted small">{open ? 'Hide' : 'Show'}</span>
      </header>
      {open && (
        <ul className="events">
          {items.map((it) => {
            const l = dv.locById.get(it.locationId);
            return (
              <li key={it.id} className="ev item" onClick={() => actions.editItem(it, -1)}>
                <span className="ev-i">{itemIcon(it)}</span>
                <span className="ev-main">
                  <b>{it.title || 'Untitled'}</b>{' '}
                  {l && <LocChip loc={{ id: l.id, name: l.name }} colorOf={dv.colorOf} size="sm" />}
                  {it.notes && <span className="ev-notes">{it.notes}</span>}
                </span>
                <MoveSelect label="Put on…" dates={dv.dates} onPick={(d) => actions.movePlacement(it.id, -1, d)} />
                <StatusPill small value={it.status} onChange={(s) => actions.patchItem(it.id, { status: s })} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MoveSelect({ label, dates, exclude, onPick, allowBack }: {
  label: string; dates: string[]; exclude?: string; onPick: (d: string | null) => void; allowBack?: boolean;
}) {
  return (
    <select className="move" value="" title="Move to another day" aria-label={label} onClick={(ev) => ev.stopPropagation()}
      onChange={(ev) => { const v = ev.target.value; if (v === '__pool') onPick(null); else if (v) onPick(v); }}>
      <option value="">{label}</option>
      {allowBack && <option value="__pool">↩ Back to ideas</option>}
      {dates.filter((x) => x !== exclude).map((x) => <option key={x} value={x}>{fmtLong(x)}</option>)}
    </select>
  );
}

function InlineLoc({ info, colorOf, onSet, onReset }: { info: DayInfo; colorOf: ColorOf; onSet: (a: string, b: string) => void; onReset: () => void }) {
  const [edit, setEdit] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const open = () => { setA(info.loc?.a.name || ''); setB(info.loc?.b?.name || ''); setEdit(true); };
  const save = () => { if (a.trim()) onSet(a.trim(), b.trim()); else onReset(); setEdit(false); };
  if (edit) {
    return (
      <form className="inline-loc" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <input list="known-locs" value={a} onChange={(e) => setA(e.target.value)} placeholder="Location" autoFocus onKeyDown={(e) => e.key === 'Escape' && setEdit(false)} />
        <span className="arrow">→</span>
        <input list="known-locs" value={b} onChange={(e) => setB(e.target.value)} placeholder="(to, optional)" onKeyDown={(e) => e.key === 'Escape' && setEdit(false)} />
        <button className="btn primary sm" type="submit">Set</button>
        <button className="btn ghost sm" type="button" onClick={() => setEdit(false)}>Cancel</button>
      </form>
    );
  }
  return (
    <span className="loc-edit">
      <LocDisplay loc={info.loc} colorOf={colorOf} size="lg" onClick={open} />
      {info.loc && <span className={'tag ' + (info.loc.manual ? 'manual' : 'auto')} title={info.loc.manual ? 'Set by hand' : 'Worked out from stays and flights'}>{info.loc.manual ? 'manual' : 'auto'}</span>}
      {info.loc?.manual && <button className="link sm" onClick={onReset} title="Go back to the auto location">reset to auto</button>}
      <button className="icon sm" onClick={open} title="Edit location" aria-label="Edit location">✎</button>
    </span>
  );
}

type Ev =
  | { key: string; t: string; kind: 'dep' | 'arr'; f: Flight; order?: number }
  | { key: string; t: string; kind: 'in' | 'out'; s: Stay; order: number }
  | { key: string; t: string; kind: 'item'; e: DayEntry; order: number };

function DayCard({ d, idx, x, colorOf, dates, actions }: { d: string; idx: number; x: DayInfo; colorOf: ColorOf; dates: string[]; actions: DayActions }) {
  const events: Ev[] = [];
  for (const f of x.arr) events.push({ key: 'a' + f.id, t: f.arrTime, kind: 'arr', f });
  for (const f of x.dep) events.push({ key: 'd' + f.id, t: f.depTime, kind: 'dep', f });
  for (const s of x.checkOuts) events.push({ key: 'o' + s.id, t: s.checkOutTime, kind: 'out', s, order: 0 });
  for (const s of x.checkIns) events.push({ key: 'i' + s.id, t: s.checkInTime, kind: 'in', s, order: 3 });
  for (const e of x.entries) events.push({ key: 'it' + e.item.id + '-' + e.pi, t: e.placement.time || '', kind: 'item', e, order: 2 });
  events.sort((p, q) => {
    if (!!p.t !== !!q.t) return p.t ? -1 : 1;
    if (p.t && q.t && p.t !== q.t) return p.t.localeCompare(q.t);
    return (p.order ?? 1) - (q.order ?? 1);
  });
  const c = x.loc ? colorOf(x.loc.a) : null;
  return (
    <section id={'day-' + d} className={'iday' + (x.loc ? '' : ' unplanned')} style={c ? cssVars({ '--c1': c.solid }) : undefined}>
      <header className="iday-h">
        <div className="iday-date">
          <b>{fmt(d, { weekday: 'short' })} {fmt(d, { day: 'numeric', month: 'short' })}</b>
          <span className="muted">Day {idx + 1}</span>
        </div>
        <InlineLoc info={x} colorOf={colorOf} onSet={(a, b) => actions.setDayLoc(d, a, b)} onReset={() => actions.setDayLoc(d, '', '')} />
        <div className="iday-stay">
          {x.night.kind === 'end' ? <span className="night end">Trip ends</span>
            : x.night.kind === 'plane' ? <span className="night plane">✈ Night on plane</span>
            : x.night.kind === 'none' ? <span className="night none clickable" onClick={() => actions.addStay(d)}>NO STAY · add</span>
            : (() => { const stay = x.night.stay; return (
              <span className="staybit" onClick={() => actions.editStay(stay)}>
                🛏 {stay.name || 'Stay'}
                <StatusPill small value={stay.status} onChange={(s) => actions.patchStay(stay.id, { status: s })} />
              </span>
            ); })()}
          <button className="icon sm" title="Day notes & location" aria-label="Day notes and location" onClick={() => actions.editDay(d)}>⋯</button>
        </div>
      </header>
      {x.notes && <p className="iday-notes" onClick={() => actions.editDay(d)}>{x.notes}</p>}
      <ul className="events">
        {events.map((e) => <EventRow key={e.key} e={e} d={d} dates={dates} actions={actions} />)}
      </ul>
      <QuickAdd d={d} onAdd={actions.quickAdd} onMore={() => actions.newItem(d)} />
    </section>
  );
}

function EventRow({ e, d, dates, actions }: { e: Ev; d: string; dates: string[]; actions: DayActions }) {
  if (e.kind === 'dep' || e.kind === 'arr') {
    const f = e.f;
    const overnight = f.arrDate && f.depDate && f.arrDate !== f.depDate;
    return (
      <li className="ev flight" onClick={() => actions.editFlight(f)}>
        <span className="ev-t">{e.t || '—'}</span>
        <span className="ev-i">✈</span>
        <span className="ev-main">
          <b>{flightLabel(f)} {f.from || '?'} → {f.to || '?'}</b>
          <span className="muted">
            {e.kind === 'dep'
              ? <> dep {f.depTime || '?'} · arr {f.arrTime || '?'}{overnight ? ` (${fmtShort(f.arrDate)})` : ''}</>
              : <> arrives {f.to} {f.arrTime || ''} · departed {fmtShort(f.depDate)} {f.depTime}</>}
            {f.conf ? ` · ${f.conf}` : ''}
          </span>
        </span>
        <StatusPill small value={f.status} onChange={(s) => actions.patchFlight(f.id, { status: s })} />
      </li>
    );
  }
  if (e.kind === 'in' || e.kind === 'out') {
    const s = e.s;
    return (
      <li className="ev stay" onClick={() => actions.editStay(s)}>
        <span className="ev-t">{e.t || ''}</span>
        <span className="ev-i">🛏</span>
        <span className="ev-main"><b>{e.kind === 'in' ? 'Check in' : 'Check out'}: {s.name || 'Stay'}</b>{s.address && <span className="muted"> · {s.address}</span>}</span>
        <StatusPill small value={s.status} onChange={(st: Status) => actions.patchStay(s.id, { status: st })} />
      </li>
    );
  }
  if (e.kind !== 'item') return null;
  const { item: it, placement: p, pi } = e.e;
  const lane = p.meal ? MEAL_LABEL[p.meal] : p.slot ? SLOT_LABEL[p.slot] : '';
  return (
    <li className={'ev item' + (it.done ? ' done' : '')} onClick={() => actions.editItem(it, pi)}>
      <span className="ev-t">{p.time || ''}</span>
      <span className="ev-i" title={it.kind === 'restaurant' ? 'Place to eat' : CATEGORIES[it.category || 'other'].label}>{itemIcon(it)}</span>
      <span className="ev-main">
        <b>{it.title || 'Untitled'}</b>
        {lane && <span className="tag lane">{lane}</span>}
        {it.place?.name && <span className="muted"> · {it.place.name}</span>}
        {it.link && <a href={it.link} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} className="lnk">link ↗</a>}
        {it.notes && <span className="ev-notes">{it.notes}</span>}
      </span>
      <MoveSelect label="Move…" dates={dates} exclude={d} allowBack onPick={(to) => actions.movePlacement(it.id, pi, to)} />
      <StatusPill small value={it.status} onChange={(s) => actions.patchItem(it.id, { status: s })} />
    </li>
  );
}

function QuickAdd({ d, onAdd, onMore }: { d: string; onAdd: DayActions['quickAdd']; onMore: () => void }) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState<QuickType>('activity');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ date: d, title: title.trim(), time, type });
    setTitle(''); setTime('');
  };
  return (
    <form className={'quick' + (title ? ' has' : '')} onSubmit={submit}>
      <input className="q-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="+ Add to this day…" aria-label="Add to this day" />
      <span className="q-extra">
        <input className="q-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
        <select value={type} onChange={(e) => setType(e.target.value as QuickType)} aria-label="Type">
          {(Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).map((k) => <option key={k} value={k}>{CATEGORIES[k].icon} {CATEGORIES[k].label}</option>)}
          <option value="restaurant">{RESTAURANT_ICON} Place to eat</option>
        </select>
        <button className="btn sm" type="submit" disabled={!title.trim()}>Add</button>
        <button className="link sm" type="button" onClick={onMore}>more…</button>
      </span>
    </form>
  );
}
