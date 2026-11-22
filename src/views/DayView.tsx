import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useDroppable,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { addDays, fmt, fmtShort } from '../domain/dates';
import { CATEGORIES, MEALS, MEAL_LABEL, SLOTS, SLOT_LABEL } from '../domain/constants';
import { flightLabel, type DayInfo, type Derived } from '../domain/derive';
import { fits, laneEntries, laneKey, overCapacity, parseLaneKey, slotLoad, swappable, type Entry, type Lane, type Ref } from '../domain/plan';
import type { ActivityCategory, Flight, Item, ItemKind, ItemSize, Meal, Status, Stay, TripDoc } from '../domain/types';
import { InlineLoc } from '../components/InlineLoc';
import { ItemCard, itemIcon } from '../components/ItemCard';
import { LocChip, Modal, StatusPill, cssVars } from '../components/ui';

export type DropTarget = { type: 'lane'; lane: Lane; index?: number } | { type: 'pool' } | { type: 'date'; date: string } | { type: 'swap'; with: Ref };

export interface PlanActions {
  goDay: (d: string) => void;
  setDayLoc: (d: string, a: string, b: string) => void;
  editDay: (d: string) => void;
  addStay: (from?: string, to?: string, locationName?: string) => void;
  editStay: (s: Stay) => void;
  patchStay: (id: string, p: Partial<Stay>) => void;
  editFlight: (f: Flight) => void;
  patchFlight: (id: string, p: Partial<Flight>) => void;
  editItem: (it: Item, pi: number) => void;
  newIdea: (p: { locationId?: string; kind: ItemKind; date?: string }) => void;
  quickIdea: (p: { locationId: string; kind: ItemKind; title: string; lane?: Lane; size?: ItemSize }) => void;
  patchItem: (id: string, p: Partial<Item>) => void;
  moveMenu: (it: Item, pi: number, date?: string) => void;
  drop: (ref: Ref, target: DropTarget) => void;
  setChosen: (ref: Ref, chosen: boolean) => void;
}

const refId = (r: Ref) => (r.pi < 0 ? `pool:${r.itemId}` : `pl:${r.itemId}:${r.pi}`);
function parseRef(id: string): Ref | null {
  const [t, itemId, pi] = id.split(':');
  if (t === 'pool') return { itemId, pi: -1 };
  if (t === 'pl' || t === 'card') return { itemId, pi: Number(pi) };
  return null;
}

// Prefer the most specific target under the pointer: a card, then a date, then a lane, then the ideas list.
const RANK = (id: string) => (id.startsWith('card:') ? 0 : id.startsWith('date:') ? 1 : id.startsWith('lane:') ? 2 : 3);
const collide: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const list = hits.length ? hits : rectIntersection(args);
  const self = 'card:' + String(args.active.id).replace(/^pl:/, '');
  return list.filter((c) => c.id !== self).sort((a, b) => RANK(String(a.id)) - RANK(String(b.id)));
};

export function DayView({ doc, dv, date, actions }: { doc: TripDoc; dv: Derived; date: string; actions: PlanActions }) {
  const x = dv.info[date];
  const idx = dv.dates.indexOf(date);
  const [poolOpen, setPoolOpen] = useState(false);
  const [dragging, setDragging] = useState<{ item: Item; pi: number } | null>(null);
  const [picker, setPicker] = useState<Lane | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const dayLocIds = [x?.loc?.a.id, x?.loc?.b?.id].filter((v): v is string => !!v);

  const onStart = (e: DragStartEvent) => {
    const r = parseRef(String(e.active.id));
    const it = r && doc.items.find((i) => i.id === r.itemId);
    if (it && r) setDragging({ item: it, pi: r.pi });
    navigator.vibrate?.(15);
  };
  const onEnd = (e: DragEndEvent) => {
    setDragging(null);
    const ref = parseRef(String(e.active.id));
    const over = e.over ? String(e.over.id) : '';
    if (!ref || !over) return;
    if (over === 'pool') { if (ref.pi >= 0) actions.drop(ref, { type: 'pool' }); return; }
    if (over.startsWith('date:')) { actions.drop(ref, { type: 'date', date: over.slice(5) }); return; }
    if (over.startsWith('lane:')) { actions.drop(ref, { type: 'lane', lane: parseLaneKey(over.slice(5)) }); return; }
    if (over.startsWith('card:')) {
      const target = parseRef(over)!;
      const ti = doc.items.find((i) => i.id === target.itemId);
      const di = doc.items.find((i) => i.id === ref.itemId);
      const tp = ti?.placements[target.pi];
      if (!ti || !di || !tp) return;
      if (swappable(di, ti)) { actions.drop(ref, { type: 'swap', with: target }); return; }
      const lane: Lane = tp.meal ? { date: tp.date, meal: tp.meal } : tp.slot ? { date: tp.date, slot: tp.slot } : { date: tp.date };
      const list = laneEntries(doc, lane);
      const ti2 = list.findIndex((en) => en.item.id === target.itemId && en.pi === target.pi);

      const index = ti2; // among the others: before the target, or after it when moving down the same lane
      actions.drop(ref, { type: 'lane', lane, index });
    }
  };

  // Swipe left/right on the day to change day (phone).
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; },
    onTouchEnd: (e: React.TouchEvent) => {
      const t = touch.current; touch.current = null;
      if (!t || dragging) return;
      const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 40) {
        const n = dv.dates[idx + (dx < 0 ? 1 : -1)];
        if (n) actions.goDay(n);
      }
    },
  };

  if (!x) return <div className="empty">That day isn’t in the trip. <button className="link" onClick={() => actions.goDay(dv.dates[0])}>Go to day 1</button></div>;

  return (
    <DndContext sensors={sensors} collisionDetection={collide} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDragging(null)}>
      <div className={'dayview' + (poolOpen ? ' pool-open' : '') + (dragging ? ' is-dragging' : '')}>
        <DateStrip dv={dv} current={date} onPick={actions.goDay} />
        <div className="dv-body">
          <aside className="pool" aria-label="Ideas">
            <Pool doc={doc} dv={dv} date={date} locIds={dayLocIds} actions={actions} onClose={() => setPoolOpen(false)} />
          </aside>
          <section className="dv-day" {...swipe}>
            <DayHeader x={x} dv={dv} date={date} idx={idx} actions={actions} />
            <DayTimeline x={x} actions={actions} />
            <LaneBox lane={{ date }} label="On this day" hint="slot not decided yet" doc={doc} actions={actions} onAdd={setPicker} compact />
            <h4 className="dv-h">Things to do</h4>
            <SlotLanes doc={doc} date={date} actions={actions} onAdd={setPicker} />
            <h4 className="dv-h">Meals</h4>
            {MEALS.map((m) => <LaneBox key={m} lane={{ date, meal: m }} label={MEAL_LABEL[m]} doc={doc} actions={actions} onAdd={setPicker} />)}
          </section>
        </div>
        <button type="button" className="pool-fab" onClick={() => setPoolOpen(!poolOpen)}>💡 Ideas</button>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && <div className="icard overlay-card"><span className="ic-i">{itemIcon(dragging.item)}</span><span className="ic-main"><span className="ic-title">{dragging.item.title}</span></span></div>}
      </DragOverlay>
      {picker && <LanePicker doc={doc} dv={dv} lane={picker} locIds={dayLocIds} actions={actions} onClose={() => setPicker(null)} />}
    </DndContext>
  );
}

// ---------- pieces ----------

function DateStrip({ dv, current, onPick }: { dv: Derived; current: string; onPick: (d: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [current]);
  return (
    <div className="dstrip" ref={ref}>
      {dv.dates.map((d) => <DateChip key={d} d={d} on={d === current} dv={dv} onPick={onPick} />)}
    </div>
  );
}
function DateChip({ d, on, dv, onPick }: { d: string; on: boolean; dv: Derived; onPick: (d: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'date:' + d });
  const loc = dv.info[d].loc;
  const c = loc ? dv.colorOf(loc.a) : null;
  const c2 = loc?.b ? dv.colorOf(loc.b) : c;
  return (
    <button ref={setNodeRef} type="button" className={'dchip' + (on ? ' on' : '') + (isOver ? ' over' : '') + (loc ? '' : ' unplanned')}
      style={c ? cssVars({ '--c1': c.solid, '--c2': c2!.solid }) : undefined} onClick={() => onPick(d)} title={loc ? loc.a.name + (loc.b ? ' → ' + loc.b.name : '') : 'No location'}>
      <span>{fmt(d, { weekday: 'short' })}</span><b>{fmt(d, { day: 'numeric' })}</b>
    </button>
  );
}

function DayHeader({ x, dv, date, idx, actions }: { x: DayInfo; dv: Derived; date: string; idx: number; actions: PlanActions }) {
  const prev = dv.dates[idx - 1], next = dv.dates[idx + 1];
  const n = x.night;
  return (
    <header className="dv-head">
      <div className="dv-nav">
        <button className="icon nav" disabled={!prev} onClick={() => prev && actions.goDay(prev)} aria-label="Previous day">‹</button>
        <div className="dv-date"><b>{fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}</b><span className="muted small">Day {idx + 1} of {dv.dates.length}</span></div>
        <button className="icon nav" disabled={!next} onClick={() => next && actions.goDay(next)} aria-label="Next day">›</button>
      </div>
      <div className="dv-meta">
        <InlineLoc info={x} colorOf={dv.colorOf} onSet={(a, b) => actions.setDayLoc(date, a, b)} onReset={() => actions.setDayLoc(date, '', '')} />
        <span className="dv-stay">
          {n.kind === 'end' ? <span className="night end">Trip ends</span>
            : n.kind === 'plane' ? <span className="night plane">✈ Night on plane</span>
            : n.kind === 'none' ? <button className="night none" onClick={() => actions.addStay(date, addDays(date, 1), x.loc?.b?.id ? x.loc.b.name : x.loc?.a.id ? x.loc.a.name : '')}>NO STAY · add</button>
            : <span className="staybit" onClick={() => actions.editStay(n.stay)}>🛏 {n.stay.name || 'Stay'} <StatusPill small value={n.stay.status} onChange={(s) => actions.patchStay(n.stay.id, { status: s })} /></span>}
          <button className="icon sm" title="Day notes & location" aria-label="Day notes and location" onClick={() => actions.editDay(date)}>⋯</button>
        </span>
      </div>
      {x.notes && <p className="iday-notes" onClick={() => actions.editDay(date)}>{x.notes}</p>}
    </header>
  );
}

function DayTimeline({ x, actions }: { x: DayInfo; actions: PlanActions }) {
  const rows: { key: string; t: string; node: ReactNode; onClick: () => void; status: Status; set: (s: Status) => void }[] = [];
  for (const f of x.arr) rows.push({ key: 'a' + f.id, t: f.arrTime, node: <>✈ <b>{flightLabel(f)}</b> arrives {f.to} <span className="muted">· from {f.from}, left {fmtShort(f.depDate)} {f.depTime}</span></>, onClick: () => actions.editFlight(f), status: f.status, set: (s) => actions.patchFlight(f.id, { status: s }) });
  for (const s of x.checkOuts) rows.push({ key: 'o' + s.id, t: s.checkOutTime, node: <>🛏 Check out: <b>{s.name || 'Stay'}</b></>, onClick: () => actions.editStay(s), status: s.status, set: (st) => actions.patchStay(s.id, { status: st }) });
  for (const s of x.checkIns) rows.push({ key: 'i' + s.id, t: s.checkInTime, node: <>🛏 Check in: <b>{s.name || 'Stay'}</b>{s.address && <span className="muted"> · {s.address}</span>}</>, onClick: () => actions.editStay(s), status: s.status, set: (st) => actions.patchStay(s.id, { status: st }) });
  for (const f of x.dep) rows.push({ key: 'd' + f.id, t: f.depTime, node: <>✈ <b>{flightLabel(f)} {f.from || '?'} → {f.to || '?'}</b> <span className="muted">dep {f.depTime || '?'} · arr {f.arrTime || '?'}{f.arrDate !== f.depDate ? ` (${fmtShort(f.arrDate)})` : ''}{f.conf ? ` · ${f.conf}` : ''}</span></>, onClick: () => actions.editFlight(f), status: f.status, set: (s) => actions.patchFlight(f.id, { status: s }) });
  if (!rows.length) return null;
  rows.sort((p, q) => (p.t || '99').localeCompare(q.t || '99'));
  return (
    <ul className="timeline">
      {rows.map((r) => (
        <li key={r.key} onClick={r.onClick}><span className="ev-t">{r.t || ''}</span><span className="tl-main">{r.node}</span><StatusPill small value={r.status} onChange={r.set} /></li>
      ))}
    </ul>
  );
}

function SlotLanes({ doc, date, actions, onAdd }: { doc: TripDoc; date: string; actions: PlanActions; onAdd: (l: Lane) => void }) {
  const load = slotLoad(doc, date);
  const over = overCapacity(load);
  const fulls = laneEntries(doc, { date, slot: 'morning' }).filter((e) => e.item.size === 'full');
  return (
    <>
      {SLOTS.map((s) => {
        const ghosts = s === 'morning' ? [] : fulls.filter((e) => s === 'afternoon' || e.item.includesEvening);
        return <LaneBox key={s} lane={{ date, slot: s }} label={SLOT_LABEL[s]} doc={doc} actions={actions} onAdd={onAdd} warn={over.includes(s)} ghosts={ghosts} />;
      })}
    </>
  );
}

function LaneBox({ lane, label, hint, doc, actions, onAdd, warn, ghosts, compact }: {
  lane: Lane; label: string; hint?: string; doc: TripDoc; actions: PlanActions; onAdd: (l: Lane) => void; warn?: boolean; ghosts?: Entry[]; compact?: boolean;
}) {
  const key = laneKey(lane);
  const { setNodeRef, isOver } = useDroppable({ id: 'lane:' + key });
  const entries = laneEntries(doc, lane);
  const anyChosen = entries.some((e) => e.placement.chosen);
  return (
    <div ref={setNodeRef} className={'lane' + (lane.meal ? ' meal' : '') + (compact ? ' compact' : '') + (isOver ? ' over' : '') + (warn ? ' warn' : '')}>
      <div className="lane-h">
        <span className="lane-l">{label}{hint && <span className="muted small"> · {hint}</span>}</span>
        {warn && <span className="cap-warn" title="More than one half-day item in this slot">Over capacity</span>}
        <button type="button" className="lane-add" onClick={() => onAdd(lane)} aria-label={`Add to ${label}`}>+</button>
      </div>
      <div className="lane-items">
        {ghosts?.map((g) => <div key={'g' + g.item.id} className="icard ghost" onClick={() => actions.editItem(g.item, g.pi)}>↑ {g.item.title} <span className="muted">(full day)</span></div>)}
        {entries.map((e) => (
          <DnDCard key={e.item.id + ':' + e.pi} entry={e} actions={actions} dim={anyChosen && !e.placement.chosen} />
        ))}
        {!entries.length && !ghosts?.length && <div className="lane-empty">{compact ? 'Drop here if you’re not sure when' : 'Drop an idea here'}</div>}
      </div>
    </div>
  );
}

function DnDCard({ entry, actions, dim }: { entry: Entry; actions: PlanActions; dim?: boolean }) {
  const ref: Ref = { itemId: entry.item.id, pi: entry.pi };
  const drag = useDraggable({ id: refId(ref) });
  const drop = useDroppable({ id: `card:${ref.itemId}:${ref.pi}` });
  const setRef = (el: HTMLElement | null) => { drag.setNodeRef(el); drop.setNodeRef(el); };
  return (
    <div ref={setRef} {...drag.attributes} {...drag.listeners} className={'dnd' + (drag.isDragging ? ' dragging' : '') + (drop.isOver ? ' over' : '')}>
      <ItemCard item={entry.item} placement={entry.placement} className={entry.item.size === 'full' ? 'full' : ''} dim={dim}
        onOpen={() => actions.editItem(entry.item, entry.pi)} onStatus={(s) => actions.patchItem(entry.item.id, { status: s })}
        onMenu={() => actions.moveMenu(entry.item, entry.pi)}
        onChosen={entry.placement.meal ? () => actions.setChosen(ref, !entry.placement.chosen) : undefined} />
    </div>
  );
}

function PoolCard({ item, extra, actions, date }: { item: Item; extra?: ReactNode; actions: PlanActions; date: string }) {
  const drag = useDraggable({ id: `pool:${item.id}` });
  return (
    <div ref={drag.setNodeRef} {...drag.attributes} {...drag.listeners} className={'dnd' + (drag.isDragging ? ' dragging' : '')}>
      <ItemCard item={item} extra={extra} onOpen={() => actions.editItem(item, -1)} onStatus={(s) => actions.patchItem(item.id, { status: s })}
        onMenu={() => actions.moveMenu(item, -1, date)} />
    </div>
  );
}

// ---------- ideas list (pool) ----------
type Kind = 'all' | 'activity' | 'restaurant';

function Pool({ doc, dv, date, locIds, actions, onClose }: { doc: TripDoc; dv: Derived; date: string; locIds: string[]; actions: PlanActions; onClose: () => void }) {
  const [tabPick, setTab] = useState<string | null>(null);
  const tab = tabPick && locIds.includes(tabPick) ? tabPick : locIds[0];
  const [kind, setKind] = useState<Kind>('all');
  const [cat, setCat] = useState<ActivityCategory | ''>('');
  const [meal, setMeal] = useState<Meal | ''>('');
  const [title, setTitle] = useState('');
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' });
  const items = useMemo(() => doc.items
    .filter((i) => i.locationId === tab)
    .filter((i) => (i.kind === 'activity' ? i.placements.length === 0 : true))
    .filter((i) => kind === 'all' || i.kind === kind)
    .filter((i) => !cat || (i.kind === 'activity' && i.category === cat))
    .filter((i) => !meal || (i.kind === 'restaurant' && (!i.meals?.length || i.meals.includes(meal))))
    .sort((a, b) => Number(!!b.mustDo) - Number(!!a.mustDo)), [doc.items, tab, kind, cat, meal]);
  const loc = tab ? dv.locById.get(tab) : undefined;
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !tab) return;
    actions.quickIdea({ locationId: tab, kind: kind === 'restaurant' ? 'restaurant' : 'activity', title: title.trim() });
    setTitle('');
  };
  return (
    <div ref={setNodeRef} className={'pool-in' + (isOver ? ' over' : '')}>
      <div className="pool-h">
        <b>Ideas</b>
        {locIds.length > 1 ? (
          <div className="seg sm">{locIds.map((id) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{dv.locById.get(id)?.name}</button>)}</div>
        ) : loc ? <LocChip loc={{ id: loc.id, name: loc.name }} colorOf={dv.colorOf} size="sm" /> : null}
        <button className="icon pool-x" onClick={onClose} aria-label="Close ideas">✕</button>
      </div>
      {!tab ? (
        <p className="muted small pool-empty">This day has no location yet. Set one above (or add a stay) to see that place’s ideas here.</p>
      ) : (<>
        <div className="pool-filters">
          <div className="seg sm">
            {([['all', 'All'], ['activity', 'To do'], ['restaurant', 'Eat']] as [Kind, string][]).map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setCat(''); setMeal(''); }}>{l}</button>)}
          </div>
          {kind === 'activity' && (
            <select value={cat} onChange={(e) => setCat(e.target.value as ActivityCategory | '')} aria-label="Category">
              <option value="">Any kind</option>
              {(Object.keys(CATEGORIES) as ActivityCategory[]).map((k) => <option key={k} value={k}>{CATEGORIES[k].icon} {CATEGORIES[k].label}</option>)}
            </select>
          )}
          {kind === 'restaurant' && (
            <select value={meal} onChange={(e) => setMeal(e.target.value as Meal | '')} aria-label="Meal">
              <option value="">Any meal</option>
              {MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
            </select>
          )}
        </div>
        <form className="pool-add" onSubmit={add}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'restaurant' ? `+ Place to eat in ${loc?.name}` : `+ Thing to do in ${loc?.name}`} />
          {title.trim() && <button className="btn sm primary" type="submit">Add</button>}
        </form>
        <div className="pool-list">
          {items.map((i) => (
            <PoolCard key={i.id} item={i} actions={actions} date={date}
              extra={i.kind === 'restaurant' && i.placements.length ? <span className="ic-used">{i.placements.length} day{i.placements.length > 1 ? 's' : ''}</span> : undefined} />
          ))}
          {!items.length && <p className="muted small pool-empty">{kind === 'all' && !cat && !meal ? `Nothing left in ${loc?.name}’s list. Add ideas above or on the location’s page.` : 'Nothing matches this filter.'}</p>}
        </div>
        <p className="muted small pool-tip">Drag onto a slot or meal (long-press on a phone), or use ⋯. Drop a planned item here to take it off the day.</p>
      </>)}
    </div>
  );
}

// ---------- tap "+" on a lane: pick from ideas without dragging ----------
function LanePicker({ doc, dv, lane, locIds, actions, onClose }: { doc: TripDoc; dv: Derived; lane: Lane; locIds: string[]; actions: PlanActions; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const kind: ItemKind = lane.meal ? 'restaurant' : 'activity';
  const cands = doc.items
    .filter((i) => locIds.includes(i.locationId) && fits(i, lane))
    .filter((i) => (i.kind === 'activity' ? i.placements.length === 0 : !i.placements.some((p) => p.date === lane.date && p.meal === lane.meal)))
    .sort((a, b) => Number(!!b.mustDo) - Number(!!a.mustDo));
  const label = lane.meal ? MEAL_LABEL[lane.meal] : lane.slot ? SLOT_LABEL[lane.slot] : 'this day';
  return (
    <Modal title={`Add to ${label}, ${fmt(lane.date, { weekday: 'short', day: 'numeric', month: 'short' })}`} onClose={onClose}>
      {locIds[0] && (
        <form className="row gap" onSubmit={(e) => { e.preventDefault(); if (title.trim()) { actions.quickIdea({ locationId: locIds[0], kind, title: title.trim(), lane }); onClose(); } }}>
          <input className="grow" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`New ${kind === 'restaurant' ? 'place to eat' : 'thing to do'}…`} autoFocus />
          <button className="btn primary" disabled={!title.trim()}>Add</button>
        </form>
      )}
      <h4>From your ideas</h4>
      {!cands.length && <p className="muted small">{locIds.length ? 'No matching ideas for this day’s location.' : 'This day has no location yet.'}</p>}
      <div className="pick-list">
        {cands.map((i) => (
          <button key={i.id} className="pick" onClick={() => { actions.drop({ itemId: i.id, pi: -1 }, { type: 'lane', lane }); onClose(); }}>
            <span>{itemIcon(i)}</span><span className="grow">{i.mustDo && '★ '}{i.title}</span>
            {locIds.length > 1 && <span className="muted small">{dv.locById.get(i.locationId)?.name}</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}
