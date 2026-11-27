import { useState } from 'react';
import { Icon } from '../components/Icons';
import { fmt, fmtShort, addDays } from '../domain/dates';
import { MEAL_LABEL, SLOT_LABEL } from '../domain/constants';
import { PICKER, swatchAt } from '../domain/colors';
import type { Derived } from '../domain/derive';
import type { Item, ItemKind, Location, Stay, TripDoc } from '../domain/types';
import { ItemCard, MapLink } from '../components/ItemCard';
import { mapsLink } from '../domain/maps';
import { ConfirmDel, StatusPill, cssVars } from '../components/ui';
import type { PlanActions } from './DayView';

/** Group consecutive dates into runs: "24–26 Jan". */
export function runs(dates: string[]): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const d of dates) {
    const last = out[out.length - 1];
    if (last && addDays(last.to, 1) === d) last.to = d; else out.push({ from: d, to: d });
  }
  return out;
}
export const runLabel = (r: { from: string; to: string }) =>
  r.from === r.to ? fmt(r.from, { weekday: 'short', day: 'numeric', month: 'short' })
    : r.from.slice(0, 7) === r.to.slice(0, 7) ? `${fmt(r.from, { day: 'numeric' })}–${fmtShort(r.to)}` : `${fmtShort(r.from)} – ${fmtShort(r.to)}`;

export interface LocationActions {
  open: (id: string) => void;
  add: (name: string) => void;
  patch: (id: string, p: Partial<Location>) => void;
  remove: (id: string) => void;
  assignDates: (name: string) => void;
}

const counts = (doc: TripDoc, id: string) => {
  const its = doc.items.filter((i) => i.locationId === id);
  return { todo: its.filter((i) => i.kind === 'activity').length, eat: its.filter((i) => i.kind === 'restaurant').length };
};

export function LocationsList({ doc, dv, actions }: { doc: TripDoc; dv: Derived; actions: LocationActions }) {
  const [name, setName] = useState('');
  const shown = dv.locOrder.filter((l) => dv.locDays.has(l.id) || doc.items.some((i) => i.locationId === l.id) || doc.stays.some((s) => s.locationId === l.id) || !l.name.match(/^unassigned$/i));
  return (
    <div className="page">
      <h2 className="page-h">Locations</h2>
      <p className="muted small">The places on this trip, in order. Open one to see its days and collect things to do and places to eat.</p>
      <div className="loc-list">
        {shown.map((l) => {
          const days = dv.locDays.get(l.id) || [];
          const c = dv.colorOf(l);
          const n = counts(doc, l.id);
          return (
            <button key={l.id} className="loc-row" style={cssVars({ '--c1': c.solid, '--cbg': c.wash })} onClick={() => actions.open(l.id)}>
              <span className="lr-name" style={{ color: c.fg }}>{l.name}</span>
              <span className="lr-dates">{days.length ? runs(days).map(runLabel).join(', ') : <span className="muted">No days yet</span>}</span>
              <span className="lr-counts muted small">{n.todo} to do · {n.eat} to eat</span>
              <span className="lr-go" aria-hidden="true">›</span>
            </button>
          );
        })}
        {!shown.length && <p className="empty">No locations yet. Add a stay, set a day’s location, or add one here.</p>}
      </div>
      <form className="row gap loc-new" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { actions.add(name.trim()); setName(''); } }}>
        <input className="grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="+ Add a location (e.g. a city or area)" />
        <button className="btn primary" disabled={!name.trim()}>Add</button>
      </form>
    </div>
  );
}

const placedLabel = (it: Item) => it.placements.map((p) => `${fmt(p.date, { weekday: 'short', day: 'numeric' })}${p.meal ? ' ' + MEAL_LABEL[p.meal].toLowerCase() : p.slot ? ' ' + SLOT_LABEL[p.slot].toLowerCase() : ''}`);

export function LocationPage({ doc, dv, id, actions, plan, onBack }: {
  doc: TripDoc; dv: Derived; id: string; actions: LocationActions; plan: PlanActions; onBack: () => void;
}) {
  const loc = dv.locById.get(id);
  const [name, setName] = useState(loc?.name || '');
  if (!loc) return <div className="page"><button className="link" onClick={onBack}>‹ Locations</button><p className="empty">That location no longer exists.</p></div>;
  const c = dv.colorOf(loc);
  const days = dv.locDays.get(id) || [];
  const stays = doc.stays.filter((s) => s.locationId === id);
  const items = doc.items.filter((i) => i.locationId === id);
  const used = items.length || stays.length || Object.values(doc.days).some((v) => v.locationId === id || v.toLocationId === id);
  return (
    <div className="page locpage" style={cssVars({ '--c1': c.solid, '--cbg': c.wash })}>
      <button className="link back" onClick={onBack}>‹ Locations</button>
      <div className="lp-head">
        <input className="lp-name" style={{ color: c.fg }} value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== loc.name && actions.patch(id, { name: name.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Location name" />
        <div className="swatches" role="group" aria-label="Colour">
          {PICKER.map((i) => <button key={i} type="button" className={'sw' + (loc.colorIndex === i ? ' on' : '')} style={{ background: swatchAt(i).solid }} onClick={() => actions.patch(id, { colorIndex: i })} aria-label={`Colour ${i + 1}`} />)}
          {loc.colorIndex != null && <button type="button" className="link sm" onClick={() => actions.patch(id, { colorIndex: undefined })}>auto</button>}
        </div>
      </div>

      <section className="lp-sec">
        <h3>Dates</h3>
        {days.length ? (
          <div className="row gap wrap">{runs(days).map((r) => <button key={r.from} className="btn sm" onClick={() => plan.goDay(r.from)}>{runLabel(r)}</button>)}</div>
        ) : <p className="muted small">Not on any day yet.</p>}
        <div className="row gap wrap lp-actions">
          <button className="btn" onClick={() => actions.assignDates(loc.name)}><Icon name="location" /> Assign to dates</button>
          <button className="btn" onClick={() => plan.addStay(days[0], days[0] ? addDays(days[days.length - 1], 1) : undefined, loc.name)}><Icon name="stay" /> Add stay here</button>
          <a className="btn" href={mapsLink(undefined, loc.name)} target="_blank" rel="noreferrer">Open {loc.name} in Google Maps ↗</a>
        </div>
        {stays.map((s: Stay) => (
          <div key={s.id} className="card" onClick={() => plan.openStay(s)}>
            <div className="card-row"><b><Icon name="stay" /> {s.name || 'Untitled stay'}</b><StatusPill small value={s.status} onChange={(st) => plan.patchStay(s.id, { status: st })} /></div>
            <div className="muted small">{fmtShort(s.checkIn)} → {fmtShort(s.checkOut)} <MapLink href={mapsLink(s.place ?? { name: s.name, address: s.address }, s.name, loc.name)} pinned={!!s.place?.mapsUrl} /></div>
          </div>
        ))}
      </section>

      <div className="lp-pools">
        <PoolSection title="Things to do" kind="activity" items={items.filter((i) => i.kind === 'activity')} locId={id} plan={plan} defaultDate={days[0]} area={loc.name} />
        <PoolSection title="Places to eat" kind="restaurant" items={items.filter((i) => i.kind === 'restaurant')} locId={id} plan={plan} defaultDate={days[0]} area={loc.name} />
      </div>

      <section className="lp-sec">
        {used ? <p className="muted small">To delete this location, first move its ideas, stays and days somewhere else.</p>
          : <ConfirmDel label="Delete location" onDelete={() => { actions.remove(id); onBack(); }} />}
      </section>
    </div>
  );
}

function PoolSection({ title, kind, items, locId, plan, defaultDate, area }: { title: string; kind: ItemKind; items: Item[]; locId: string; plan: PlanActions; defaultDate?: string; area: string }) {
  const [t, setT] = useState('');
  const sorted = [...items].sort((a, b) => Number(!!b.mustDo) - Number(!!a.mustDo) || Number(a.placements.length > 0) - Number(b.placements.length > 0));
  return (
    <section className="lp-sec pool-sec">
      <h3>{title} <span className="muted small">({items.length})</span></h3>
      <form className="pool-add" onSubmit={(e) => {
        e.preventDefault();
        plan.newIdea({ locationId: locId, kind, title: t.trim() });
        setT('');
      }}>
        <input value={t} onChange={(e) => setT(e.target.value)} placeholder={kind === 'activity' ? '+ Add a thing to do' : '+ Add a place to eat'} />
        <button className="btn sm primary">Add</button>
      </form>
      <div className="pool-list">
        {sorted.map((i) => {
          const where = placedLabel(i);
          return (
            <ItemCard key={i.id} item={i} area={area} onOpen={() => plan.viewItem(i, -1)} onEdit={() => plan.editItem(i, -1)} onStatus={(s) => plan.patchItem(i.id, { status: s })}
              onMove={() => plan.moveMenu(i, kind === 'activity' && i.placements.length ? 0 : -1, defaultDate)}
              extra={where.length
                ? <button type="button" className="ic-used link" onClick={(e) => { e.stopPropagation(); plan.goDay(i.placements[0].date); }}>{where.join(', ')}</button>
                : <span className="ic-free">not planned</span>} />
          );
        })}
        {!items.length && <p className="muted small">Nothing yet. Add ideas as you find them; put them on days later.</p>}
      </div>
    </section>
  );
}
