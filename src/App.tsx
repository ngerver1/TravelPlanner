import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, diffDays, fmtLong, fmtShort, range, todayStr } from './domain/dates';
import { uid } from './domain/ids';
import { UNASSIGNED, mealFromTime, slotFromTime } from './domain/constants';
import { derive, locationOn } from './domain/derive';
import { ensureLocation, locationName } from './domain/locations';
import { fits, moveToDate, placeAt, setChosen, swap, unplace, type Lane, type Ref } from './domain/plan';
import type { Flight, Item, ItemKind, ItemSize, Place, Placement, Stay, TripDoc } from './domain/types';
import { parseMapsUrl } from './domain/maps';
import { useTripStore } from './store';
import { useRoute, type PlanView, type Route } from './router';
import { Modal } from './components/ui';
import { DayForm, FlightForm, ItemForm, RangeLocForm, StayForm, type FlightDraft, type ItemDraft, type RangeDraft, type StayDraft } from './components/forms';
import { FlightsPanel, StaysPanel, type PanelActions } from './components/panels';
import { MoveSheet } from './components/MoveSheet';
import { TripSettings } from './components/TripSettings';
import { SyncChip } from './components/SyncChip';
import { useSync } from './sync/useSync';
import { downloadJson, exportName } from './views/Settings';
import { LocationNames } from './components/LocationSelect';
import { applyTheme, loadTheme, type Theme } from './theme';
import { OverviewView, Legend, Summary } from './views/Overview';
import { MonthView } from './views/Month';
import { DayView, type DropTarget, type PlanActions } from './views/DayView';
import { LocationPage, LocationsList, type LocationActions } from './views/Locations';
import { SettingsPage } from './views/Settings';

type ModalState =
  | { type: 'flight'; v: FlightDraft }
  | { type: 'stay'; v: StayDraft }
  | { type: 'item'; v: ItemDraft }
  | { type: 'range'; v: RangeDraft }
  | { type: 'day'; date: string }
  | { type: 'outday'; date: string }
  | { type: 'move'; itemId: string; pi: number; date?: string }
  | { type: 'relocate'; itemId: string; ids: string[] }
  | null;

/** The location an item added on this day belongs to: the day's (first) location record, else Unassigned. */
function dayLocationId(x: TripDoc, date: string): string {
  const loc = date ? locationOn(x, date) : null;
  return loc?.a.id ?? loc?.b?.id ?? ensureLocation(x, UNASSIGNED)!;
}

/** Place from the editor's fields; coordinates come from a pasted Maps link, or are kept if the link didn't change. */
function buildPlace(prev: Place | undefined, name: string, address: string, mapsUrl: string): Place | undefined {
  const url = mapsUrl.trim();
  const parsed = url ? parseMapsUrl(url) : null;
  const p: Place = { name };
  if (address.trim()) p.address = address.trim();
  if (parsed) {
    p.mapsUrl = parsed.mapsUrl;
    const same = prev?.mapsUrl === parsed.mapsUrl;
    const lat = parsed.lat ?? (same ? prev?.lat : undefined), lng = parsed.lng ?? (same ? prev?.lng : undefined);
    if (lat != null && lng != null) { p.lat = lat; p.lng = lng; }
    const id = parsed.googlePlaceId ?? (same ? prev?.googlePlaceId : undefined);
    if (id) p.googlePlaceId = id;
  } else if (url) p.mapsUrl = url;
  return name || p.address || p.mapsUrl ? p : undefined;
}

const placementLabel = (p: Placement) => `${fmtLong(p.date)}${p.meal ? ' ' + p.meal : ''}`;

function itemDraft(doc: TripDoc, it: Item, pi: number): ItemDraft {
  const p = pi >= 0 ? it.placements[pi] : undefined;
  return {
    id: it.id, kind: it.kind, title: it.title, locationName: locationName(doc, it.locationId),
    category: it.category || 'other', size: it.size || 'half', includesEvening: !!it.includesEvening,
    meals: it.meals || [], cuisine: it.cuisine || '', booking: it.booking || '',
    status: it.status, mustDo: !!it.mustDo, done: !!it.done,
    placeName: it.place?.name && it.place.name !== it.title ? it.place.name : '', placeAddress: it.place?.address || '', mapsUrl: it.place?.mapsUrl || '',
    link: it.link || '', notes: it.notes || '',
    pi: p ? pi : -1, date: p?.date || '', time: p?.time || '', meal: p?.meal || it.meals?.[0] || mealFromTime(p?.time),
    elsewhere: it.kind === 'restaurant' ? it.placements.filter((_, i) => i !== pi).map(placementLabel) : [],
  };
}

const PLAN_VIEWS: [PlanView, string][] = [['calendar', 'Calendar'], ['overview', 'Overview'], ['day', 'Day']];

export default function App() {
  const { doc, update, replace, undo, load, setRev, storageOk } = useTripStore();
  const sync = useSync({ doc, load, setRev });
  const [bannerHidden, setBannerHidden] = useState(() => { try { return localStorage.getItem('tripPlanner.syncBannerHidden') === '1'; } catch { return false; } });
  const [route, go] = useRoute();
  const [modal, setModal] = useState<ModalState>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; undo?: boolean } | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((msg: string, canUndo = false) => {
    setToastMsg({ msg, undo: canUndo });
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastMsg(null), canUndo ? 5000 : 2600);
  }, []);
  const [lastPlan, setLastPlan] = useState<PlanView>(route.page === 'plan' ? route.view : 'calendar');
  const [lastDay, setLastDay] = useState<string>('');

  const dv = useMemo(() => derive(doc), [doc]);
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const setTheme = (t: Theme) => { setThemeState(t); applyTheme(t); };
  // Expose the sticky header's height so the day strip can stick just below it.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--hdr', el.offsetHeight + 'px');
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const close = useCallback(() => setModal(null), []);
  const hasDates = dv.dates.length > 0;
  const firstUncovered = dv.uncovered[0]?.from || doc.trip.start;

  // Day view date: the route's, else the last one viewed, else today (if in the trip), else day 1.
  const dayDate = (route.page === 'plan' && route.view === 'day' && route.date && dv.info[route.date] ? route.date : '')
    || (dv.info[lastDay] ? lastDay : '') || (dv.info[todayStr()] ? todayStr() : '') || dv.dates[0] || '';

  const goPlan = (view: PlanView, date?: string) => {
    setLastPlan(view);
    if (view === 'day') { const d = date || dayDate; setLastDay(d); go({ page: 'plan', view, date: d }); }
    else go({ page: 'plan', view });
  };
  const goDay = (d: string) => { setLastPlan('day'); setLastDay(d); go({ page: 'plan', view: 'day', date: d }, route.page === 'plan' && route.view === 'day'); };

  const setDayLoc = useCallback((d: string, a: string, b: string) => update((x) => {
    const e = { ...(x.days[d] || {}) };
    const ai = ensureLocation(x, a);
    if (ai) { e.locationId = ai; const bi = ensureLocation(x, b); if (bi && bi !== ai) e.toLocationId = bi; else delete e.toLocationId; }
    else { delete e.locationId; delete e.toLocationId; }
    if (Object.keys(e).length) x.days[d] = e; else delete x.days[d];
  }), [update]);

  const newFlight = (d?: string) => setModal({ type: 'flight', v: { _new: true, id: uid(), airline: '', flightNo: '', from: '', to: '', depDate: d || '', depTime: '', arrDate: d || '', arrTime: '', status: 'planned', conf: '', notes: '' } });
  const addStay = (from?: string, to?: string, locName = '') => setModal({ type: 'stay', v: { _new: true, id: uid(), name: '', locationName: locName, address: '', checkIn: from || '', checkOut: to || (from ? addDays(from, 1) : ''), checkInTime: '', checkOutTime: '', status: 'planned', conf: '', cost: '', link: '', notes: '', mapsUrl: '' } });
  const editStay = (s: Stay) => { const { locationId, place, ...rest } = s; setModal({ type: 'stay', v: { ...rest, mapsUrl: place?.mapsUrl || '', locationName: locationName(doc, locationId) } }); };
  const patchStay = (id: string, p: Partial<Stay>) => update((x) => { x.stays = x.stays.map((s) => (s.id === id ? { ...s, ...p } : s)); });
  const editFlight = (f: Flight) => setModal({ type: 'flight', v: { ...f } });
  const patchFlight = (id: string, p: Partial<Flight>) => update((x) => { x.flights = x.flights.map((f) => (f.id === id ? { ...f, ...p } : f)); });

  /** After putting an item on a day in another place, offer to move it to that place's list. */
  const checkLocation = (itemId: string, date: string | undefined) => {
    const it = doc.items.find((i) => i.id === itemId);
    const loc = date ? dv.info[date]?.loc : null;
    const ids = [loc?.a.id, loc?.b?.id].filter((v): v is string => !!v);
    if (it && ids.length && !ids.includes(it.locationId)) setModal({ type: 'relocate', itemId, ids });
  };

  const drop = (ref: Ref, t: DropTarget) => {
    const it = doc.items.find((i) => i.id === ref.itemId);
    if (!it) return;
    const name = `“${it.title || 'Untitled'}”`;
    if (t.type === 'pool') {
      if (ref.pi < 0) return;
      update((x) => unplace(x, ref));
      toast(`${name} is back in the ideas list`, true);
      return;
    }
    let date: string | undefined;
    if (t.type === 'date') {
      update((x) => { moveToDate(x, ref, t.date); });
      date = t.date;
      toast(`${name} moved to ${fmtLong(t.date)}`, true);
    } else if (t.type === 'lane') {
      if (!fits(it, t.lane)) { toast(it.kind === 'restaurant' ? 'Places to eat go in breakfast, lunch or dinner' : 'Things to do go in a slot (morning, afternoon, evening)'); return; }
      const p = ref.pi >= 0 ? it.placements[ref.pi] : undefined;
      update((x) => { placeAt(x, ref, t.lane, t.index); });
      date = t.lane.date;
      toast(p && p.date === t.lane.date ? `${name} moved` : `${name} added to ${fmtLong(t.lane.date)}`, true);
    } else {
      const other = doc.items.find((i) => i.id === t.with.itemId);
      date = other?.placements[t.with.pi]?.date;
      update((x) => swap(x, ref, t.with));
      toast(ref.pi < 0 ? `${name} swapped in; “${other?.title}” is back in ideas` : `Swapped ${name} and “${other?.title}”`, true);
    }
    checkLocation(it.id, date);
  };

  const quickIdea = ({ locationId, kind, title, lane, size }: { locationId: string; kind: ItemKind; title: string; lane?: Lane; size?: ItemSize }) => {
    const id = uid();
    update((x) => {
      x.items.push(kind === 'restaurant'
        ? { id, locationId, kind, title, status: 'idea', placements: [] }
        : { id, locationId, kind, title, status: 'idea', category: 'activity', size: size || 'half', placements: [] });
      if (lane) placeAt(x, { itemId: id, pi: -1 }, lane);
    });
    toast(`Added “${title}”${lane ? ' to ' + fmtLong(lane.date) : ''}`, true);
  };

  const plan: PlanActions = {
    goDay, setDayLoc,
    editDay: (d) => setModal({ type: 'day', date: d }),
    addStay, editStay, patchStay, editFlight, patchFlight,
    editItem: (it, pi) => setModal({ type: 'item', v: itemDraft(doc, it, pi) }),
    newIdea: ({ locationId, kind, date }) => setModal({ type: 'item', v: {
      _new: true, id: uid(), kind, title: '', locationName: locationName(doc, locationId), category: 'other', size: 'half', includesEvening: false,
      meals: [], cuisine: '', booking: '', status: 'idea', mustDo: false, done: false, placeName: '', placeAddress: '', mapsUrl: '', link: '', notes: '',
      pi: -1, date: date || '', time: '', meal: 'lunch', elsewhere: [],
    } }),
    quickIdea,
    patchItem: (id, p) => update((x) => { x.items = x.items.map((i) => (i.id === id ? { ...i, ...p } : i)); }),
    moveMenu: (it, pi, date) => setModal({ type: 'move', itemId: it.id, pi, date }),
    drop,
    setChosen: (ref, chosen) => update((x) => setChosen(x, ref, chosen)),
  };

  const panelActions: PanelActions = { addStay: (f, t) => addStay(f, t), editStay, patchStay, addFlight: newFlight, editFlight, patchFlight };

  const locActions: LocationActions = {
    open: (id) => go({ page: 'location', id }),
    add: (name) => { update((x) => { ensureLocation(x, name); }); toast(`Added ${name}`); },
    patch: (id, p) => update((x) => { x.locations = x.locations.map((l) => { if (l.id !== id) return l; const n = { ...l, ...p }; if (p.colorIndex === undefined && 'colorIndex' in p) delete n.colorIndex; return n; }); }),
    remove: (id) => update((x) => { x.locations = x.locations.filter((l) => l.id !== id); }),
    assignDates: (name) => setModal({ type: 'range', v: { from: firstUncovered, to: firstUncovered, loc: name, loc2: '' } }),
  };

  // ---------- saving forms ----------
  const saveFlight = (v: FlightDraft) => {
    const { _new, ...f } = v;
    update((x) => { const i = x.flights.findIndex((e) => e.id === f.id); if (i >= 0) x.flights[i] = f as Flight; else x.flights.push(f as Flight); });
    close();
  };
  const saveStay = (v: StayDraft) => {
    const { _new, locationName: ln, mapsUrl, ...rest } = v;
    update((x) => {
      const s: Stay = { ...rest };
      const lid = ensureLocation(x, ln);
      if (lid) s.locationId = lid;
      const prev = x.stays.find((e) => e.id === s.id);
      const place = buildPlace(prev?.place, s.name, s.address, mapsUrl);
      if (place && (mapsUrl.trim() || prev?.place)) s.place = place;
      const i = x.stays.findIndex((e) => e.id === s.id);
      if (i >= 0) x.stays[i] = s; else x.stays.push(s);
    });
    close();
  };
  const saveItem = (f: ItemDraft) => {
    let placedOn: string | undefined;
    update((x) => {
      const prev = x.items.find((i) => i.id === f.id);
      const it: Item = prev ?? { id: f.id, locationId: '', kind: f.kind, title: '', status: 'idea', placements: [] };
      if (!prev) x.items.push(it);
      it.title = f.title.trim();
      it.status = f.status;
      it.locationId = ensureLocation(x, f.locationName) ?? (prev?.locationId || dayLocationId(x, f.date));
      if (f.mustDo) it.mustDo = true; else delete it.mustDo;
      if (f.done) it.done = true; else delete it.done;
      const place = buildPlace(it.place, f.placeName.trim() || it.title, f.placeAddress, f.mapsUrl);
      if (place && (f.placeName.trim() || f.placeAddress.trim() || f.mapsUrl.trim() || it.place?.lat != null)) it.place = place; else delete it.place;
      if (f.link.trim()) it.link = f.link.trim(); else delete it.link;
      if (f.notes.trim()) it.notes = f.notes; else delete it.notes;

      // Kind change: convert placements (activities keep only the one being edited, or the first).
      if (it.kind !== f.kind) {
        if (f.kind === 'restaurant') it.placements = it.placements.map((p) => ({ date: p.date, meal: mealFromTime(p.time), order: p.order, ...(p.time ? { time: p.time } : {}) }));
        else {
          const keep = it.placements[f.pi >= 0 ? f.pi : 0];
          const slot = keep && slotFromTime(keep.time);
          it.placements = keep ? [{ date: keep.date, order: keep.order, ...(slot ? { slot } : {}), ...(keep.time ? { time: keep.time } : {}) }] : [];
          if (f.pi > 0) f.pi = 0;
        }
        it.kind = f.kind;
      }
      if (f.kind === 'activity') {
        it.category = f.category; it.size = f.size;
        if (f.size === 'full' && f.includesEvening) it.includesEvening = true; else delete it.includesEvening;
        delete it.meals; delete it.cuisine; delete it.booking;
        if (f.size === 'full' && it.placements[0]?.slot) it.placements[0].slot = 'morning';
      } else {
        delete it.category; delete it.size; delete it.includesEvening;
        if (f.meals.length) it.meals = f.meals; else delete it.meals;
        if (f.cuisine.trim()) it.cuisine = f.cuisine.trim(); else delete it.cuisine;
        if (f.booking.trim()) it.booking = f.booking.trim(); else delete it.booking;
      }

      // The placement being edited
      const ref: Ref = { itemId: it.id, pi: f.pi < it.placements.length ? f.pi : -1 };
      const p = ref.pi >= 0 ? it.placements[ref.pi] : undefined;
      if (p && !f.date) { unplace(x, ref); return; }
      if (!f.date) return;
      let lane: Lane;
      if (f.kind === 'restaurant') lane = { date: f.date, meal: f.meal };
      else {
        const slot = f.time ? slotFromTime(f.time) : p?.slot;
        lane = slot ? { date: f.date, slot } : { date: f.date };
      }
      const changed = !p || p.date !== lane.date || p.meal !== lane.meal || p.slot !== lane.slot;
      const pi = changed ? placeAt(x, ref, lane) : ref.pi;
      const q = it.placements[pi];
      if (q) { if (f.time) q.time = f.time; else delete q.time; }
      if (changed) placedOn = f.date;
    });
    close();
    if (placedOn) checkLocation(f.id, placedOn);
  };
  const delEntity = (key: 'flights' | 'stays' | 'items', id: string) => {
    update((x) => { (x[key] as { id: string }[]) = (x[key] as { id: string }[]).filter((e) => e.id !== id); });
    close();
    toast('Deleted', true);
  };

  const openOutside = (o: (typeof dv.outside)[number]) => {
    if (o.kind === 'flight') { const f = doc.flights.find((e) => e.id === o.id); if (f) editFlight(f); }
    else if (o.kind === 'stay') { const s = doc.stays.find((e) => e.id === o.id); if (s) editStay(s); }
    else if (o.kind === 'item') { const it = doc.items.find((e) => e.id === o.id); if (it) plan.editItem(it, it.placements.findIndex((p) => p.date === o.date)); }
    else if (o.kind === 'day' && o.date) setModal({ type: 'outday', date: o.date });
  };

  const isEmpty = !doc.flights.length && !doc.stays.length && !doc.items.length && !Object.keys(doc.days).length;
  const syncText = storageOk ? 'Saved on this device' : 'Couldn’t save: storage full or blocked. Download a backup';
  const navTo = (r: Route) => go(r);
  const page = route.page;

  const warnings = (<>
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
        {dv.overlaps.map(([a, b], i) => <span key={i}>{i ? '; ' : ''}<button className="link" onClick={() => editStay(a)}>{a.name || 'Untitled'}</button> & <button className="link" onClick={() => editStay(b)}>{b.name || 'Untitled'}</button></span>)}
      </div>
    )}
  </>);

  const planPage = () => {
    if (!hasDates) return (
      <div className="welcome">
        <h2>Start a new trip</h2>
        <p>Give your trip a name and choose its first and last day at the top. The calendar appears once the dates are set.</p>
        <p className="muted small">Moving over from the old trip planner? Use <button className="link" onClick={() => navTo({ page: 'settings' })}>⚙ Settings → Restore</button> with your v1 JSON export; it is converted automatically.</p>
      </div>
    );
    const view = route.page === 'plan' ? route.view : 'calendar';
    return (<>
      <div className="plan-bar">
        <nav className="vtabs" aria-label="Plan view">
          {PLAN_VIEWS.map(([v, l]) => <button key={v} className={view === v ? 'on' : ''} onClick={() => goPlan(v)}>{l}</button>)}
        </nav>
      </div>
      {view !== 'day' && warnings}
      {isEmpty && (
        <div className="welcome">
          <h2>Empty trip: let’s fill it in</h2>
          <p>Add flights and stays and each day’s location fills itself in. Then open <b>Locations</b> to collect things to do and places to eat, and drag them onto days.</p>
          <div className="row gap wrap">
            <button className="btn primary" onClick={() => newFlight(doc.trip.start)}>+ Add a flight</button>
            <button className="btn primary" onClick={() => addStay(doc.trip.start)}>+ Add a stay</button>
            <button className="btn" onClick={() => setModal({ type: 'range', v: { from: doc.trip.start, to: doc.trip.start, loc: '', loc2: '' } })}>📍 Set locations for some days</button>
          </div>
        </div>
      )}
      {view === 'calendar' && (<>
        <Summary s={dv.stats} />
        <MonthView dv={dv} onDay={goDay} onStay={editStay} onFlight={editFlight} onAddStay={(from, to) => addStay(from, addDays(to, 1))} />
      </>)}
      {view === 'overview' && (<>
        <Summary s={dv.stats} />
        <OverviewView doc={doc} dv={dv} onDay={goDay} onAddStay={(d) => addStay(d)} />
        <Legend />
      </>)}
      {view === 'day' && <DayView doc={doc} dv={dv} date={dayDate} actions={plan} />}
    </>);
  };

  const moveItem = modal?.type === 'move' ? doc.items.find((i) => i.id === modal.itemId) : undefined;

  return (
    <LocationNames.Provider value={dv.known}>
    <div className={'app page-' + page + (page === 'plan' ? ' view-' + route.view : '')}>
      <header className="top" ref={headerRef}>
        <TripSettings trip={doc.trip} onChange={(p) => update((x) => { x.trip = { ...x.trip, ...p }; })} />
        <SyncChip status={sync.status} onClick={() => navTo({ page: 'settings' })} />
      </header>

      <main>
        {!storageOk && <div className="alert bad"><b>{syncText}</b></div>}
        {sync.status === 'local' && !bannerHidden && page === 'plan' && hasDates && (
          <div className="sync-banner">
            <span>Your trip is only on this device. <button className="link" onClick={() => navTo({ page: 'settings' })}>Set up sync</button> to see it on your phone and laptop.</span>
            <button className="icon sm" aria-label="Hide" onClick={() => { setBannerHidden(true); try { localStorage.setItem('tripPlanner.syncBannerHidden', '1'); } catch { /* ignore */ } }}>✕</button>
          </div>
        )}
        {page === 'plan' && planPage()}
        {page === 'locations' && <LocationsList doc={doc} dv={dv} actions={locActions} />}
        {page === 'location' && <LocationPage key={route.id} doc={doc} dv={dv} id={route.id} actions={locActions} plan={plan} onBack={() => navTo({ page: 'locations' })} />}
        {page === 'stays' && <div className="page"><h2 className="page-h">Stays</h2>{dv.overlaps.length > 0 && warnings}<StaysPanel dv={dv} actions={panelActions} /></div>}
        {page === 'flights' && <div className="page"><h2 className="page-h">Flights</h2><FlightsPanel dv={dv} actions={panelActions} /></div>}
        {page === 'settings' && <SettingsPage doc={doc} toast={toast} theme={theme} onTheme={setTheme} sync={sync} status={syncText} statusOk={storageOk} onImport={(d) => { replace(d); toast('Trip imported', true); }} />}
      </main>

      <nav className="bottombar" aria-label="Menu">
        <button className={page === 'plan' ? 'on' : ''} onClick={() => goPlan(lastPlan)}><span className="bi">🗓</span><span>Plan</span></button>
        <button className={page === 'locations' || page === 'location' ? 'on' : ''} onClick={() => navTo({ page: 'locations' })}><span className="bi">📍</span><span>Locations</span></button>
        <button className={page === 'stays' ? 'on' : ''} onClick={() => navTo({ page: 'stays' })}>
          <span className="bi">🛏{dv.stats.none ? <em className="badge bad">{dv.stats.none}</em> : null}</span><span>Stays</span>
        </button>
        <button className={page === 'flights' ? 'on' : ''} onClick={() => navTo({ page: 'flights' })}><span className="bi">✈</span><span>Flights</span></button>
        <button className={page === 'settings' ? 'on' : ''} onClick={() => navTo({ page: 'settings' })}><span className="bi">⚙</span><span>Settings</span></button>
      </nav>

      {modal?.type === 'flight' && <FlightForm initial={modal.v} onClose={close} onSave={saveFlight} onDelete={() => delEntity('flights', modal.v.id)} />}
      {modal?.type === 'stay' && <StayForm initial={modal.v} onClose={close} onSave={saveStay} onDelete={() => delEntity('stays', modal.v.id)} />}
      {modal?.type === 'item' && <ItemForm initial={modal.v} trip={doc.trip} onClose={close} onSave={saveItem} onDelete={() => delEntity('items', modal.v.id)} />}
      {modal?.type === 'move' && moveItem && (
        <MoveSheet item={moveItem} pi={modal.pi} dates={dv.dates} defaultDate={modal.date || dayDate} onClose={close}
          onEdit={() => setModal({ type: 'item', v: itemDraft(doc, moveItem, modal.pi) })}
          onUnplace={() => { close(); drop({ itemId: moveItem.id, pi: modal.pi }, { type: 'pool' }); }}
          onMove={(lane) => { close(); drop({ itemId: moveItem.id, pi: modal.pi }, { type: 'lane', lane }); }} />
      )}
      {modal?.type === 'relocate' && (() => {
        const it = doc.items.find((i) => i.id === modal.itemId);
        if (!it) return null;
        const from = locationName(doc, it.locationId) || 'another place';
        return (
          <Modal title="Move to this place’s list?" onClose={close}
            footer={<><span className="grow" /><button className="btn ghost" onClick={close}>Keep in {from}</button>
              {modal.ids.map((id) => <button key={id} className="btn primary" onClick={() => { update((x) => { const t = x.items.find((i) => i.id === it.id); if (t) t.locationId = id; }); close(); }}>Move to {locationName(doc, id)}</button>)}</>}>
            <p>“{it.title}” is in <b>{from}</b>’s ideas, but you’ve put it on a day in <b>{modal.ids.map((id) => locationName(doc, id)).join(' / ')}</b>.</p>
          </Modal>
        );
      })()}
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
          toast(f.clear ? 'Range reset to auto' : `Location set for ${diffDays(f.from, f.to) + 1} day(s)`, true);
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
      {sync.conflict && (() => {
        const r = sync.conflict.remote;
        const when = (t: number) => (t ? new Date(t).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown');
        const sum = (d: TripDoc) => `${d.stays.length} stays · ${d.flights.length} flights · ${d.items.length} ideas`;
        return (
          <Modal title="Changed on two devices" onClose={() => undefined}
            footer={<>
              <button className="btn ghost" onClick={() => { downloadJson(exportName(doc, '-this-device'), JSON.stringify(doc, null, 2)); downloadJson(exportName(r, '-other-device'), JSON.stringify(r, null, 2)); }}>Download both</button>
              <span className="grow" />
              <button className="btn" onClick={() => sync.resolve('theirs')}>Use the other device’s</button>
              <button className="btn primary" onClick={() => sync.resolve('mine')}>Keep this device’s</button>
            </>}>
            <p>This trip was changed on another device while this one also had unsaved changes. Nothing has been overwritten yet: choose which version to keep.</p>
            <div className="conflict-cmp">
              <div><b>This device</b><span className="muted small">Last change {when(doc.updatedAt)}</span><span className="small">{sum(doc)}</span></div>
              <div><b>Other device</b><span className="muted small">Saved {when(r.updatedAt)}</span><span className="small">{sum(r)}</span></div>
            </div>
            <p className="muted small">The version you don’t keep is replaced. To keep both, download both first; either file can be imported later from Settings.</p>
          </Modal>
        );
      })()}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg.msg}
          {toastMsg.undo && <button className="toast-undo" onClick={() => { undo(); setToastMsg(null); }}>Undo</button>}
        </div>
      )}
    </div>
    </LocationNames.Provider>
  );
}
