import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, diffDays, fmtLong, fmtShort, range } from './domain/dates';
import { uid } from './domain/ids';
import { UNASSIGNED, mealFromTime, slotFromTime } from './domain/constants';
import { derive, locationOn } from './domain/derive';
import { ensureLocation, locationName } from './domain/locations';
import type { Flight, Item, Placement, Stay, TripDoc } from './domain/types';
import { useTripStore } from './store';
import { Modal, Seg } from './components/ui';
import { DayForm, FlightForm, ItemForm, RangeLocForm, StayForm, type FlightDraft, type ItemDraft, type RangeDraft, type StayDraft } from './components/forms';
import { FlightsPanel, StaysPanel } from './components/panels';
import { BackupDialog } from './components/BackupDialog';
import { TripSettings } from './components/TripSettings';
import { CalendarView, Legend, Summary } from './views/Calendar';
import { MonthView } from './views/Month';
import { DaysView, type DayActions, type QuickType } from './views/Days';

type Tab = 'calendar' | 'days';
const tabFromHash = (): Tab => (location.hash === '#days' || location.hash === '#itinerary' ? 'days' : 'calendar');

type ModalState =
  | { type: 'flight'; v: FlightDraft }
  | { type: 'stay'; v: StayDraft }
  | { type: 'item'; v: ItemDraft }
  | { type: 'range'; v: RangeDraft }
  | { type: 'day'; date: string }
  | { type: 'outday'; date: string }
  | { type: 'backup' }
  | null;

/** The location an item added on this day belongs to: the day's (first) location record, else Unassigned. */
function dayLocationId(x: TripDoc, date: string): string {
  const loc = date ? locationOn(x, date) : null;
  return loc?.a.id ?? loc?.b?.id ?? ensureLocation(x, UNASSIGNED)!;
}

/** Next order number at the end of a lane (same date and slot/meal). */
function nextOrder(x: TripDoc, p: Pick<Placement, 'date' | 'slot' | 'meal'>): number {
  let max = -1;
  for (const i of x.items) for (const q of i.placements)
    if (q.date === p.date && q.slot === p.slot && q.meal === p.meal) max = Math.max(max, q.order);
  return max + 1;
}

function itemDraft(doc: TripDoc, it: Item, pi: number): ItemDraft {
  const p = pi >= 0 ? it.placements[pi] : undefined;
  return {
    id: it.id, kind: it.kind, title: it.title, locationName: locationName(doc, it.locationId),
    category: it.category || 'other', status: it.status, placeName: it.place?.name || '', link: it.link || '', notes: it.notes || '',
    pi: p ? pi : -1, date: p?.date || '', time: p?.time || '', meal: p?.meal || mealFromTime(p?.time),
  };
}

export default function App() {
  const { doc, update, replace, storageOk } = useTripStore();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [calView, setCalView] = useState<'month' | 'weeks'>(() => { try { return localStorage.getItem('tripPlanner.calView') === 'weeks' ? 'weeks' : 'month'; } catch { return 'month'; } });
  const pickCalView = (v: 'month' | 'weeks') => { setCalView(v); try { localStorage.setItem('tripPlanner.calView', v); } catch { /* ignore */ } };
  const [panel, setPanel] = useState<'stays' | 'flights' | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [focus, setFocus] = useState<{ date: string; t: number } | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const toastT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((m: string) => { setToastMsg(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(''), 2600); }, []);

  useEffect(() => {
    const h = () => setTab(tabFromHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const goTab = (t: Tab) => { setTab(t); try { history.replaceState(null, '', '#' + t); } catch { location.hash = t; } };

  const dv = useMemo(() => derive(doc), [doc]);
  const close = useCallback(() => setModal(null), []);
  const firstUncovered = dv.uncovered[0]?.from || doc.trip.start;

  const setDayLoc = useCallback((d: string, a: string, b: string) => update((x) => {
    const e = { ...(x.days[d] || {}) };
    const ai = ensureLocation(x, a);
    if (ai) { e.locationId = ai; const bi = ensureLocation(x, b); if (bi && bi !== ai) e.toLocationId = bi; else delete e.toLocationId; }
    else { delete e.locationId; delete e.toLocationId; }
    if (Object.keys(e).length) x.days[d] = e; else delete x.days[d];
  }), [update]);

  const actions: DayActions = useMemo(() => ({
    setDayLoc,
    editDay: (d) => setModal({ type: 'day', date: d }),
    addStay: (from, to) => setModal({ type: 'stay', v: { _new: true, id: uid(), name: '', locationName: '', address: '', checkIn: from || '', checkOut: to || (from ? addDays(from, 1) : ''), checkInTime: '', checkOutTime: '', status: 'planned', conf: '', cost: '', link: '', notes: '' } }),
    editStay: (s) => { const { locationId, ...rest } = s; setModal({ type: 'stay', v: { ...rest, locationName: locationName(doc, locationId) } }); },
    patchStay: (id, p) => update((x) => { x.stays = x.stays.map((s) => (s.id === id ? { ...s, ...p } : s)); }),
    editFlight: (f) => setModal({ type: 'flight', v: { ...f } }),
    patchFlight: (id, p) => update((x) => { x.flights = x.flights.map((f) => (f.id === id ? { ...f, ...p } : f)); }),
    editItem: (it, pi) => setModal({ type: 'item', v: itemDraft(doc, it, pi) }),
    newItem: (d) => setModal({ type: 'item', v: {
      _new: true, id: uid(), kind: 'activity', title: '', locationName: dv.info[d]?.loc?.a.id ? dv.info[d].loc!.a.name : dv.info[d]?.loc?.b?.id ? dv.info[d].loc!.b!.name : '',
      category: 'activity', status: 'idea', placeName: '', link: '', notes: '', pi: -1, date: d, time: '', meal: 'lunch',
    } }),
    patchItem: (id, p) => update((x) => { x.items = x.items.map((i) => (i.id === id ? { ...i, ...p } : i)); }),
    movePlacement: (id, pi, date) => update((x) => {
      const it = x.items.find((i) => i.id === id);
      if (!it) return;
      if (date === null) { it.placements.splice(pi, 1); return; }
      if (pi < 0) {
        const p: Placement = it.kind === 'restaurant' ? { date, meal: 'lunch', order: 0 } : { date, order: 0 };
        p.order = nextOrder(x, p);
        if (it.kind === 'activity') it.placements = [p]; else it.placements.push(p);
        return;
      }
      const p = it.placements[pi];
      if (!p) return;
      p.order = nextOrder(x, { ...p, date });
      p.date = date;
    }),
    quickAdd: ({ date, title, time, type }: { date: string; title: string; time: string; type: QuickType }) => update((x) => {
      const base = { id: uid(), locationId: dayLocationId(x, date), title, status: 'idea' as const };
      const t = time ? { time } : {};
      if (type === 'restaurant') {
        const p: Placement = { date, meal: mealFromTime(time), order: 0, ...t };
        p.order = nextOrder(x, p);
        x.items.push({ ...base, kind: 'restaurant', placements: [p] });
      } else {
        const slot = slotFromTime(time);
        const p: Placement = { date, ...(slot ? { slot } : {}), order: 0, ...t };
        p.order = nextOrder(x, p);
        x.items.push({ ...base, kind: 'activity', category: type, size: 'quick', placements: [p] });
      }
    }),
  }), [update, setDayLoc, doc, dv]);

  const panelActions = {
    addStay: actions.addStay, editStay: actions.editStay, patchStay: actions.patchStay,
    addFlight: (d?: string) => setModal({ type: 'flight', v: { _new: true, id: uid(), airline: '', flightNo: '', from: '', to: '', depDate: d || '', depTime: '', arrDate: d || '', arrTime: '', status: 'planned', conf: '', notes: '' } }),
    editFlight: actions.editFlight, patchFlight: actions.patchFlight,
  };

  const saveFlight = (v: FlightDraft) => {
    const { _new, ...f } = v;
    update((x) => { const i = x.flights.findIndex((e) => e.id === f.id); if (i >= 0) x.flights[i] = f as Flight; else x.flights.push(f as Flight); });
    close();
  };
  const saveStay = (v: StayDraft) => {
    const { _new, locationName: ln, ...rest } = v;
    update((x) => {
      const s: Stay = { ...rest };
      const lid = ensureLocation(x, ln);
      if (lid) s.locationId = lid;
      const prev = x.stays.find((e) => e.id === s.id);
      if (prev?.place) s.place = prev.place;
      const i = x.stays.findIndex((e) => e.id === s.id);
      if (i >= 0) x.stays[i] = s; else x.stays.push(s);
    });
    close();
  };
  const saveItem = (f: ItemDraft) => {
    update((x) => {
      const prev = x.items.find((i) => i.id === f.id);
      const it: Item = prev ? structuredClone(prev) : { id: f.id, locationId: '', kind: f.kind, title: '', status: 'idea', placements: [] };
      it.title = f.title.trim();
      it.status = f.status;
      it.locationId = ensureLocation(x, f.locationName) ?? (prev?.locationId || dayLocationId(x, f.date));
      if (f.placeName.trim()) it.place = it.place && it.place.name === f.placeName.trim() ? it.place : { name: f.placeName.trim() };
      else delete it.place;
      if (f.link.trim()) it.link = f.link.trim(); else delete it.link;
      if (f.notes.trim()) it.notes = f.notes; else delete it.notes;

      // Kind and its fields
      if (f.kind === 'activity') {
        it.category = f.category;
        it.size ??= 'quick';
        delete it.meals; delete it.cuisine; delete it.booking;
      } else {
        delete it.category; delete it.size; delete it.includesEvening;
      }
      const kindChanged = it.kind !== f.kind;
      it.kind = f.kind;

      // The placement being edited
      let ps = it.placements;
      let target = f.pi >= 0 ? ps[f.pi] : undefined;
      if (target && !f.date) { ps.splice(f.pi, 1); target = undefined; }
      else if (f.date) {
        if (!target) { target = { date: f.date, order: 0 }; if (f.kind === 'activity') ps = [target]; else ps.push(target); }
        const moved = target.date !== f.date;
        target.date = f.date;
        if (f.time) target.time = f.time; else delete target.time;
        if (f.kind === 'restaurant') { target.meal = f.meal; delete target.slot; }
        else { delete target.meal; delete target.chosen; const s = slotFromTime(f.time); if (s) target.slot = s; else if (kindChanged) delete target.slot; }
        if (moved || kindChanged || f.pi < 0) target.order = nextOrder({ ...x, items: x.items.filter((i) => i.id !== it.id) }, target);
      }
      // Other placements follow the kind
      for (const p of ps) {
        if (p === target) continue;
        if (f.kind === 'restaurant') { p.meal ??= mealFromTime(p.time); delete p.slot; }
        else { delete p.meal; delete p.chosen; }
      }
      if (f.kind === 'activity' && ps.length > 1) ps = [target ?? ps[0]];
      it.placements = ps;

      const i = x.items.findIndex((e) => e.id === it.id);
      if (i >= 0) x.items[i] = it; else x.items.push(it);
    });
    close();
  };
  const delEntity = (key: 'flights' | 'stays' | 'items', id: string) => {
    update((x) => { (x[key] as { id: string }[]) = (x[key] as { id: string }[]).filter((e) => e.id !== id); });
    close();
    toast('Deleted');
  };

  const openOutside = (o: (typeof dv.outside)[number]) => {
    if (o.kind === 'flight') { const f = doc.flights.find((e) => e.id === o.id); if (f) actions.editFlight(f); }
    else if (o.kind === 'stay') { const s = doc.stays.find((e) => e.id === o.id); if (s) actions.editStay(s); }
    else if (o.kind === 'item') { const it = doc.items.find((e) => e.id === o.id); if (it) actions.editItem(it, it.placements.findIndex((p) => p.date === o.date)); }
    else if (o.kind === 'day' && o.date) setModal({ type: 'outday', date: o.date });
  };

  const openDay = (d: string) => { goTab('days'); setFocus({ date: d, t: Date.now() }); };
  const hasDates = dv.dates.length > 0;
  const isEmpty = !doc.flights.length && !doc.stays.length && !doc.items.length && !Object.keys(doc.days).length;
  const syncText = storageOk ? 'Saved on this device' : 'Couldn’t save: storage full or blocked. Download a backup';

  return (
    <div className={'app' + (panel ? ' with-panel' : '')}>
      <datalist id="known-locs">{dv.known.map((k) => <option key={k} value={k} />)}</datalist>
      <header className="top">
        <div className="top-row">
          <TripSettings trip={doc.trip} onChange={(p) => update((x) => { x.trip = { ...x.trip, ...p }; })} />
          <div className="top-actions">
            <span className={'sync ' + (storageOk ? 'muted' : 'bad')} title="Every change is saved in this browser straight away">{syncText}</span>
            <button className={'btn' + (panel === 'stays' ? ' on' : '')} onClick={() => setPanel(panel === 'stays' ? null : 'stays')}>🛏 Stays{dv.stats.none ? <em className="badge bad">{dv.stats.none}</em> : null}</button>
            <button className={'btn' + (panel === 'flights' ? ' on' : '')} onClick={() => setPanel(panel === 'flights' ? null : 'flights')}>✈ Flights</button>
            <button className="btn" disabled={!hasDates} onClick={() => setModal({ type: 'range', v: { from: firstUncovered, to: firstUncovered, loc: '', loc2: '' } })}>📍 Set locations</button>
            <button className="btn ghost" onClick={() => setModal({ type: 'backup' })} title="Download / import JSON">⇅ Backup</button>
          </div>
        </div>
        <nav className="tabs">
          <button className={tab === 'calendar' ? 'on' : ''} onClick={() => goTab('calendar')}>Calendar</button>
          <button className={tab === 'days' ? 'on' : ''} onClick={() => goTab('days')}>Days</button>
        </nav>
      </header>

      <main>
        {dv.outside.length > 0 && (
          <div className="alert warn">
            <div className="row between wrap">
              <b>⚠ {dv.outside.length} thing{dv.outside.length > 1 ? 's are' : ' is'} outside the trip dates: kept, not deleted</b>
              {dv.fit && <button className="btn sm" onClick={() => update((x) => { x.trip.start = dv.fit!.start; x.trip.end = dv.fit!.end; })}>Extend trip to {fmtShort(dv.fit.start)} – {fmtShort(dv.fit.end)}</button>}
            </div>
            <ul className="outside">{dv.outside.map((o, i) => <li key={i}><button className="link" onClick={() => openOutside(o)}>{o.label}</button></li>)}</ul>
          </div>
        )}
        {dv.overlaps.length > 0 && (
          <div className="alert bad">
            <b>Overlapping stays: </b>
            {dv.overlaps.map(([a, b], i) => <span key={i}>{i ? '; ' : ''}<button className="link" onClick={() => actions.editStay(a)}>{a.name || 'Untitled'}</button> & <button className="link" onClick={() => actions.editStay(b)}>{b.name || 'Untitled'}</button></span>)}
          </div>
        )}
        {!hasDates && (
          <div className="welcome">
            <h2>Start a new trip</h2>
            <p>Give your trip a name and choose its first and last day at the top. The calendar and day list appear once the dates are set.</p>
            <p className="muted small">Moving over from the old trip planner? Use <button className="link" onClick={() => setModal({ type: 'backup' })}>⇅ Backup → Import</button> with your v1 JSON export; it is converted automatically.</p>
          </div>
        )}
        {hasDates && isEmpty && (
          <div className="welcome">
            <h2>Empty trip: let’s fill it in</h2>
            <p>Add flights and stays and each day’s location fills itself in (where you sleep, or “BNE → HKG” on travel days). You can override any day by hand, or set a whole run of days at once.</p>
            <div className="row gap wrap">
              <button className="btn primary" onClick={() => panelActions.addFlight(doc.trip.start)}>+ Add a flight</button>
              <button className="btn primary" onClick={() => actions.addStay(doc.trip.start)}>+ Add a stay</button>
              <button className="btn" onClick={() => setModal({ type: 'range', v: { from: doc.trip.start, to: doc.trip.start, loc: '', loc2: '' } })}>📍 Set locations for some days</button>
            </div>
            <p className="muted small">Everything saves in this browser automatically. Use ⇅ Backup to download or restore a JSON copy.</p>
          </div>
        )}

        {hasDates && (tab === 'calendar' ? (
          <>
            <div className="cal-bar">
              <Summary s={dv.stats} />
              <Seg value={calView} onChange={pickCalView} options={[['month', 'Month'], ['weeks', 'Weeks']]} />
            </div>
            {calView === 'month' ? (
              <MonthView dv={dv} onDay={openDay} onStay={actions.editStay} onFlight={actions.editFlight}
                onAddStay={(from, to) => actions.addStay(from, addDays(to, 1))} />
            ) : (
              <>
                <CalendarView dv={dv} onDay={openDay} onAddStay={(d) => actions.addStay(d)} />
                <Legend />
              </>
            )}
          </>
        ) : (
          <DaysView dv={dv} doc={doc} focus={focus} actions={actions} />
        ))}
      </main>

      {panel && (
        <aside className="panel">
          <div className="panel-h">
            <div className="seg">
              <button className={panel === 'stays' ? 'on' : ''} onClick={() => setPanel('stays')}>Stays</button>
              <button className={panel === 'flights' ? 'on' : ''} onClick={() => setPanel('flights')}>Flights</button>
            </div>
            <button className="icon" onClick={() => setPanel(null)} aria-label="Close panel">✕</button>
          </div>
          {panel === 'stays' ? <StaysPanel dv={dv} actions={panelActions} /> : <FlightsPanel dv={dv} actions={panelActions} />}
        </aside>
      )}

      {modal?.type === 'flight' && <FlightForm initial={modal.v} onClose={close} onSave={saveFlight} onDelete={() => delEntity('flights', modal.v.id)} />}
      {modal?.type === 'stay' && <StayForm initial={modal.v} onClose={close} onSave={saveStay} onDelete={() => delEntity('stays', modal.v.id)} />}
      {modal?.type === 'item' && <ItemForm initial={modal.v} trip={doc.trip} onClose={close} onSave={saveItem} onDelete={() => delEntity('items', modal.v.id)} />}
      {modal?.type === 'range' && (
        <RangeLocForm initial={modal.v} trip={doc.trip} onClose={close} onApply={(f) => {
          update((x) => {
            const a = f.clear ? undefined : ensureLocation(x, f.loc);
            const b = f.clear ? undefined : ensureLocation(x, f.loc2);
            for (const d of range(f.from, f.to)) {
              const e = { ...(x.days[d] || {}) };
              if (!a) { delete e.locationId; delete e.toLocationId; }
              else { e.locationId = a; if (b && b !== a) e.toLocationId = b; else delete e.toLocationId; }
              if (Object.keys(e).length) x.days[d] = e; else delete x.days[d];
            }
          });
          close();
          toast(f.clear ? 'Range reset to auto' : `Location set for ${diffDays(f.from, f.to) + 1} day(s)`);
        }} />
      )}
      {modal?.type === 'day' && dv.info[modal.date] && (
        <DayForm date={modal.date} info={dv.info[modal.date]} colorOf={dv.colorOf} onClose={close}
          onReset={() => { setDayLoc(modal.date, '', ''); close(); }}
          onSave={(f) => {
            update((x) => {
              const e: TripDoc['days'][string] = {};
              const a = ensureLocation(x, f.loc);
              if (a) { e.locationId = a; const b = ensureLocation(x, f.loc2); if (b && b !== a) e.toLocationId = b; }
              if (f.notes.trim()) e.notes = f.notes;
              if (Object.keys(e).length) x.days[modal.date] = e; else delete x.days[modal.date];
            });
            close();
          }} />
      )}
      {modal?.type === 'outday' && (() => {
        const v = doc.days[modal.date] || {};
        return (
          <Modal title={`${fmtLong(modal.date)} (outside trip)`} onClose={close}
            footer={<><button className="btn danger ghost" onClick={() => { update((x) => { delete x.days[modal.date]; }); close(); }}>Clear this day’s data</button><span className="grow" /><button className="btn" onClick={close}>Close</button></>}>
            <p>Location: <b>{locationName(doc, v.locationId) || '—'}{v.toLocationId ? ' → ' + locationName(doc, v.toLocationId) : ''}</b></p>
            {v.notes && <p className="pre">{v.notes}</p>}
            <p className="muted small">This day is outside the trip dates. Extend the trip to bring it back, or clear it if you no longer need it.</p>
          </Modal>
        );
      })()}
      {modal?.type === 'backup' && <BackupDialog doc={doc} toast={toast} onClose={close} onImport={(d) => { replace(d); toast('Trip imported'); }} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}
