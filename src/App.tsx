import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './components/Icons';
import { addDays, diffDays, fmtLong, fmtShort, range, todayStr } from './domain/dates';
import { uid } from './domain/ids';
import { UNASSIGNED, mealFromTime, slotFromTime } from './domain/constants';
import { derive, locationOn } from './domain/derive';
import { ensureLocation, locationName } from './domain/locations';
import { fits, moveToDate, placeAt, setChosen, swap, unplace, type Lane, type Ref } from './domain/plan';
import type { Flight, Item, Place, Placement, Stay, TransportLeg, TripDoc } from './domain/types';
import { parseMapsUrl } from './domain/maps';
import { CostContext, fromMoney, toMoney } from './components/MoneyField';
import { usedCurrencies } from './domain/money';
import { useTripStore } from './store';
import { parseRoute, routeHash, useRoute, type PlanView, type Route } from './router';
import { Modal } from './components/ui';
import { DayForm, FlightForm, ItemForm, RangeLocForm, StayForm, type FlightDraft, type ItemDraft, type RangeDraft, type StayDraft } from './components/forms';
import { StaysPanel, type PanelActions } from './components/panels';
import { MoveSheet } from './components/MoveSheet';
import { ItemView } from './components/ItemView';
import { LocalCardProvider } from './components/LocalCard';
import { setTripGoogleKey } from './sync/google';
import { NavIcon } from './components/NavIcons';
import { TodayPage } from './views/Today';
import { exportJson } from './domain/normalize';
import { FlightView, StayView, TransportView } from './components/BookingViews';
import { TransportForm, type LegDraft } from './components/TransportForm';
import { TravelPage } from './views/Travel';
import { MapView } from './views/MapView';
import { useAppUpdate } from './pwa';
import type { MapPoint } from './domain/geo';
import { TripSettings } from './components/TripSettings';
import { SyncChip } from './components/SyncChip';
import { useSync } from './sync/useSync';
import { downloadJson, exportName } from './views/Settings';
import { LocationNames } from './components/LocationSelect';
import { cleanPhone, toLocal } from './domain/local';
import { applyTheme, loadTheme, type Theme } from './theme';
import { OverviewView, Legend, Summary } from './views/Overview';
import { MonthView } from './views/Month';
import { DayView, type DropTarget, type PlanActions } from './views/DayView';
import { LocationPage, LocationsList, type LocationActions } from './views/Locations';
import { SettingsPage } from './views/Settings';
import { CostsPage } from './views/Costs';
import { InboxPage, type InboxActions } from './views/Inbox';
import type { Booking, BookingType } from './domain/inbox';

type ModalState =
  | { type: 'flight'; v: FlightDraft }
  | { type: 'stay'; v: StayDraft }
  | { type: 'item'; v: ItemDraft }
  | { type: 'range'; v: RangeDraft }
  | { type: 'day'; date: string }
  | { type: 'outday'; date: string }
  | { type: 'move'; itemId: string; pi: number; date?: string }
  | { type: 'view'; itemId: string; pi: number }
  | { type: 'viewStay'; id: string }
  | { type: 'viewFlight'; id: string }
  | { type: 'leg'; v: LegDraft }
  | { type: 'viewLeg'; id: string }
  | { type: 'relocate'; itemId: string; ids: string[] }
  | null;

/** The location an item added on this day belongs to: the day's (first) location record, else Unassigned. */
function dayLocationId(x: TripDoc, date: string): string {
  const loc = date ? locationOn(x, date) : null;
  return loc?.a.id ?? loc?.b?.id ?? ensureLocation(x, UNASSIGNED)!;
}

/** Place from the editor's fields; coordinates come from a pasted Maps link, or are kept if the link didn't change. */
function buildPlace(prev: Place | undefined, name: string, address: string, mapsUrl: string, pos?: { lat: number; lng: number; placeId?: string } | null): Place | undefined {
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
  if (pos !== undefined) {
    if (pos) { p.lat = pos.lat; p.lng = pos.lng; if (pos.placeId) p.googlePlaceId = pos.placeId; }
    else { delete p.lat; delete p.lng; }
  }
  return name || p.address || p.mapsUrl || p.lat != null ? p : undefined;
}

const placementLabel = (p: Placement) => `${fmtLong(p.date)}${p.meal ? ' ' + p.meal : ''}`;

function itemDraft(doc: TripDoc, it: Item, pi: number): ItemDraft {
  const home = doc.trip.currency || 'AUD';
  const p = pi >= 0 ? it.placements[pi] : undefined;
  return {
    id: it.id, kind: it.kind, title: it.title, locationName: locationName(doc, it.locationId),
    category: it.category || 'other', size: it.size || 'half', includesEvening: !!it.includesEvening,
    meals: it.meals || [], cuisine: it.cuisine || '', price: fromMoney(it.price, home), booking: it.booking || '',
    status: it.status, mustDo: !!it.mustDo, done: !!it.done,
    placeName: it.place?.name && it.place.name !== it.title ? it.place.name : '', placeAddress: it.place?.address || '', localName: it.local?.name || '', localAddress: it.local?.address || '', phone: it.phone || '', mapsUrl: it.place?.mapsUrl || '', pos: it.place?.lat != null && it.place.lng != null ? { lat: it.place.lat, lng: it.place.lng, ...(it.place.googlePlaceId ? { placeId: it.place.googlePlaceId } : {}) } : null,
    link: it.link || '', notes: it.notes || '',
    pi: p ? pi : -1, date: p?.date || '', time: p?.time || '', meal: p?.meal || it.meals?.[0] || mealFromTime(p?.time),
    elsewhere: it.kind === 'restaurant' ? it.placements.filter((_, i) => i !== pi).map(placementLabel) : [],
  };
}

type BookingPage = 'stays' | 'flights' | 'costs';
const BOOKING_PAGES: string[] = ['stays', 'flights', 'costs'];
const LAST_PAGE = 'tripPlanner.lastPage';

const PLAN_VIEWS: [PlanView, string][] = [['calendar', 'Calendar'], ['overview', 'Overview'], ['day', 'Day'], ['map', 'Map']];

export default function App() {
  const { doc, update, replace, undo, load, setRev, storageOk } = useTripStore();
  const sync = useSync({ doc, load, setRev });
  const appUpdate = useAppUpdate();
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
  const [lastBooking, setLastBooking] = useState<BookingPage>(BOOKING_PAGES.includes(route.page) ? route.page as BookingPage : 'stays');
  useEffect(() => { if (BOOKING_PAGES.includes(route.page)) setLastBooking(route.page as BookingPage); }, [route.page]);
  // Opening the app: Today while you're on the trip, otherwise the page you were on last time.
  useLayoutEffect(() => {
    if (location.hash) return;
    const t = todayStr();
    if (doc.trip.start && doc.trip.start <= t && t <= doc.trip.end) { go({ page: 'today' }, true); return; }
    try { const last = localStorage.getItem(LAST_PAGE); if (last && last !== '#') go(parseRoute(last), true); } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(LAST_PAGE, routeHash(route)); } catch { /* ignore */ } }, [route]);
  const [lastDay, setLastDay] = useState<string>('');

  const dv = useMemo(() => derive(doc), [doc]);
  setTripGoogleKey(doc.settings?.googleMapsKey); // read by the map and search buttons below
  const setGoogleKey = (key: string | undefined) => update((x) => {
    if (key) x.settings = { ...(x.settings || {}), googleMapsKey: key };
    else if (x.settings) { delete x.settings.googleMapsKey; if (!Object.keys(x.settings).length) delete x.settings; }
  });
  const home = doc.trip.currency || 'AUD';
  const costCtx = useMemo(() => ({ home, used: usedCurrencies(doc) }), [home, doc]);
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

  const newFlight = (d?: string) => setModal({ type: 'flight', v: { _new: true, priceDraft: fromMoney(undefined, home), id: uid(), airline: '', flightNo: '', from: '', to: '', depDate: d || '', depTime: '', arrDate: d || '', arrTime: '', status: 'planned', conf: '', notes: '' } });
  const addStay = (from?: string, to?: string, locName = '') => setModal({ type: 'stay', v: { _new: true, priceDraft: fromMoney(undefined, home), id: uid(), name: '', locationName: locName, address: '', checkIn: from || '', checkOut: to || (from ? addDays(from, 1) : ''), checkInTime: '', checkOutTime: '', status: 'planned', conf: '', cost: '', link: '', notes: '', mapsUrl: '', pos: null, localName: '', localAddress: '', phone: '' } });
  const editStay = (s: Stay) => { const { locationId, place, price, local, phone, ...rest } = s; setModal({ type: 'stay', v: { ...rest, localName: local?.name || '', localAddress: local?.address || '', phone: phone || '', priceDraft: fromMoney(price, home), mapsUrl: place?.mapsUrl || '', pos: place?.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng, ...(place.googlePlaceId ? { placeId: place.googlePlaceId } : {}) } : null, locationName: locationName(doc, locationId) } }); };
  const patchStay = (id: string, p: Partial<Stay>) => update((x) => { x.stays = x.stays.map((s) => (s.id === id ? { ...s, ...p } : s)); });
  const openStay = (s: Stay) => setModal({ type: 'viewStay', id: s.id });
  const openFlight = (f: Flight) => setModal({ type: 'viewFlight', id: f.id });
  const editFlight = (f: Flight) => setModal({ type: 'flight', v: { ...f, priceDraft: fromMoney(f.price, home) } });
  const locNameOf = (id?: string) => (id ? dv.locById.get(id)?.name || '' : '');
  const openLeg = (l: TransportLeg) => setModal({ type: 'viewLeg', id: l.id });
  const legDraft = (l: TransportLeg): LegDraft => {
    const { fromLocationId, toLocationId, price, itemId, itemRole, fromLocal, toLocal, ...rest } = l;
    return { ...rest, fromLocalName: fromLocal?.name || '', fromLocalAddress: fromLocal?.address || '', toLocalName: toLocal?.name || '', toLocalAddress: toLocal?.address || '', fromLoc: locNameOf(fromLocationId), toLoc: locNameOf(toLocationId), priceDraft: fromMoney(price, home), itemId: itemId || '', itemRole: itemRole || 'to' };
  };
  const editLeg = (l: TransportLeg) => setModal({ type: 'leg', v: legDraft(l) });
  const addLeg = (p: { date?: string; fromLoc?: string; toLoc?: string; itemId?: string; itemRole?: 'to' | 'from' }) => setModal({ type: 'leg', v: {
    _new: true, id: uid(), mode: 'train', operator: '', fromName: '', toName: '', date: p.date || '', depTime: '', arrDate: '', arrTime: '', duration: '',
    status: 'planned', conf: '', cost: '', link: '', notes: '', fromLoc: p.fromLoc || '', toLoc: p.toLoc || '', priceDraft: fromMoney(undefined, home),
    itemId: p.itemId || '', itemRole: p.itemRole || 'to', fromLocalName: '', fromLocalAddress: '', toLocalName: '', toLocalAddress: '',
  } });
  /** Prefill a new booking for a day that needs transport. */
  const gapPrefill = (d: string) => { const l = dv.info[d]?.loc; const prev = dv.info[addDays(d, -1)]?.endLoc; return { date: d, fromLoc: l?.b ? l.a.name : prev?.id ? prev.name : '', toLoc: (l?.b ?? l?.a)?.name }; };
  const patchLeg = (id: string, p: Partial<TransportLeg>) => update((x) => { x.legs = x.legs.map((l) => (l.id === id ? { ...l, ...p } : l)); });
  const saveLeg = (v: LegDraft) => {
    doneInbox();
    const { _new, fromLoc, toLoc, priceDraft, itemId, itemRole, fromLocalName, fromLocalAddress, toLocalName, toLocalAddress, ...rest } = v;
    update((x) => {
      const l: TransportLeg = { ...rest, fromName: rest.fromName.trim(), toName: rest.toName.trim(), operator: rest.operator.trim() };
      const fl = toLocal(fromLocalName, fromLocalAddress), tl = toLocal(toLocalName, toLocalAddress);
      if (fl) l.fromLocal = fl;
      if (tl) l.toLocal = tl;
      const a = ensureLocation(x, fromLoc), b = ensureLocation(x, toLoc);
      if (a) l.fromLocationId = a;
      if (b) l.toLocationId = b;
      const price = toMoney(priceDraft);
      if (price) { l.price = price; l.cost = ''; }
      if (itemId) { l.itemId = itemId; l.itemRole = itemRole; }
      const i = x.legs.findIndex((e) => e.id === l.id);
      if (i >= 0) x.legs[i] = l; else x.legs.push(l);
    });
    close();
  };
  const openPoint = useCallback((p: MapPoint) => { if (p.ref.type === 'stay') setModal({ type: 'viewStay', id: p.ref.stay.id }); else setModal({ type: 'view', itemId: p.ref.item.id, pi: p.ref.pi }); }, []);
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

  // ---------- Inbox (bookings from forwarded emails) ----------
  // When an editor is opened from the inbox, saving it marks that booking (or the whole email) as done.
  const pendingInbox = useRef<{ entryId: string; index?: number } | null>(null);
  useEffect(() => { if (!modal) pendingInbox.current = null; }, [modal]);
  const removeFromInbox = (entryId: string, index?: number) => sync.changeInbox((list) => list
    .map((e) => (e.id === entryId && index != null ? { ...e, bookings: e.bookings.filter((_, i) => i !== index) } : e))
    .filter((e) => e.id !== entryId || (index != null && e.bookings.length > 0)));
  const doneInbox = () => { const p = pendingInbox.current; pendingInbox.current = null; if (p) removeFromInbox(p.entryId, p.index); };
  const guessLoc = (text?: string) => {
    const t = (text || '').toLowerCase();
    return t ? [...doc.locations].sort((a, b) => b.name.length - a.name.length).find((l) => t.includes(l.name.toLowerCase()))?.name || '' : '';
  };
  const defined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>;
  /** Fill an editor's draft from an email booking; only fields the email has are changed. */
  const patchModal = (b: Booking) => setModal((m) => {
    if (!m) return m;
    const price = b.price ? { priceDraft: fromMoney(b.price, home) } : {};
    const withNote = (notes: string) => (b.cancelBy && !notes.includes(b.cancelBy) ? { notes: [notes, b.cancelBy].filter(Boolean).join('\n') } : {});
    if (m.type === 'flight') return { ...m, v: { ...m.v, status: 'booked', ...price, ...defined({ airline: b.airline, flightNo: b.flightNo, from: b.from, to: b.to, depDate: b.depDate, depTime: b.depTime, arrDate: b.arrDate || b.depDate, arrTime: b.arrTime, conf: b.conf, link: b.link }), ...withNote(m.v.notes) } };
    if (m.type === 'stay') return { ...m, v: { ...m.v, status: 'booked', ...price, ...defined({ name: b.name, address: b.address, checkIn: b.checkIn, checkOut: b.checkOut, checkInTime: b.checkInTime, checkOutTime: b.checkOutTime, conf: b.conf, link: b.link, mapsUrl: b.mapsUrl, localName: b.localName, localAddress: b.localAddress, phone: b.phone, locationName: m.v.locationName || guessLoc(`${b.city || ''} ${b.address || ''}`) || b.city }), ...withNote(m.v.notes) } };
    if (m.type === 'leg') return { ...m, v: { ...m.v, status: 'booked', ...price, ...defined({ mode: b.mode, operator: b.operator, fromName: b.fromName, toName: b.toName, date: b.date, depTime: b.depTime, arrDate: b.arrDate, arrTime: b.arrTime, conf: b.conf, link: b.link, fromLoc: m.v.fromLoc || guessLoc(b.fromName), toLoc: m.v.toLoc || guessLoc(b.toName) }), ...withNote(m.v.notes) } };
    if (m.type === 'item') {
      const ref = [b.conf && `Ref ${b.conf}`, b.partySize && `${b.partySize} people`, b.cancelBy].filter(Boolean).join(' · ');
      const loc = m.v.locationName || guessLoc(`${b.city || ''} ${b.address || ''}`) || b.city || (b.date ? dv.info[b.date]?.endLoc?.name : '') || '';
      return { ...m, v: { ...m.v, status: 'booked', ...defined({ title: m.v.title || b.name, placeAddress: b.address, date: b.date, time: b.time, locationName: loc, link: b.link, mapsUrl: b.mapsUrl, localName: b.localName, localAddress: b.localAddress, phone: b.phone }),
        ...(b.time ? { meal: mealFromTime(b.time) } : {}), ...(b.price ? { price: fromMoney(b.price, home) } : {}),
        ...(ref ? (m.v.kind === 'restaurant' ? { booking: [m.v.booking, ref].filter(Boolean).join(' · ') } : { notes: [m.v.notes, ref].filter(Boolean).join('\n') }) : {}) } };
    }
    return m;
  });
  const openNew = (type: BookingType, date?: string) => {
    if (type === 'flight') newFlight(date);
    else if (type === 'stay') addStay(date);
    else if (type === 'transport') addLeg({ date });
    else plan.newIdea({ kind: type === 'restaurant' ? 'restaurant' : 'activity' });
  };
  const inboxActions: InboxActions = {
    add: (entryId, index, b) => { openNew(b.type, b.depDate || b.checkIn || b.date); pendingInbox.current = { entryId, index }; patchModal(b); },
    update: (entryId, index, b, m) => {
      if (m.type === 'flight') { const f = doc.flights.find((x) => x.id === m.id); if (f) editFlight(f); }
      else if (m.type === 'stay') { const x = doc.stays.find((y) => y.id === m.id); if (x) editStay(x); }
      else if (m.type === 'leg') { const x = doc.legs.find((y) => y.id === m.id); if (x) editLeg(x); }
      else { const it = doc.items.find((y) => y.id === m.id); if (it) plan.editItem(it, it.placements.length ? 0 : -1); }
      pendingInbox.current = { entryId, index };
      patchModal(b);
    },
    addManual: (entryId, type) => { openNew(type); pendingInbox.current = { entryId }; },
    dismissBooking: (entryId, index) => { removeFromInbox(entryId, index); toast('Dismissed'); },
    dismissEntry: (entryId) => { removeFromInbox(entryId); toast('Email dismissed'); },
  };

  const plan: PlanActions = {
    goDay, setDayLoc,
    editDay: (d) => setModal({ type: 'day', date: d }),
    addStay, openStay, patchStay, openFlight, patchFlight, openLeg, patchLeg, addLeg,
    editItem: (it, pi) => setModal({ type: 'item', v: itemDraft(doc, it, pi) }),
    viewItem: (it, pi) => setModal({ type: 'view', itemId: it.id, pi }),
    // New ideas always open the full editor (prefilled); nothing is added until Save.
    newIdea: ({ locationId, kind, title, lane }) => setModal({ type: 'item', v: {
      _new: true, id: uid(), kind, title: title || '', locationName: locationName(doc, locationId), category: 'activity', size: 'half', includesEvening: false,
      meals: [], cuisine: '', price: fromMoney(undefined, home), booking: '', status: 'idea', mustDo: false, done: false, placeName: '', placeAddress: '', localName: '', localAddress: '', phone: '', mapsUrl: '', pos: null, link: '', notes: '',
      pi: -1, date: lane?.date || '', time: '', meal: lane?.meal || 'lunch', slot: lane?.slot, elsewhere: [],
    } }),
    patchItem: (id, p) => update((x) => { x.items = x.items.map((i) => (i.id === id ? { ...i, ...p } : i)); }),
    moveMenu: (it, pi, date) => setModal({ type: 'move', itemId: it.id, pi, date }),
    drop,
    setChosen: (ref, chosen) => update((x) => setChosen(x, ref, chosen)),
  };

  const panelActions: PanelActions = { addStay: (f, t) => addStay(f, t), openStay, patchStay, addFlight: newFlight, openFlight, patchFlight };

  const locActions: LocationActions = {
    open: (id) => go({ page: 'location', id }),
    add: (name) => { update((x) => { ensureLocation(x, name); }); toast(`Added ${name}`); },
    patch: (id, p) => update((x) => { x.locations = x.locations.map((l) => { if (l.id !== id) return l; const n = { ...l, ...p }; if (p.colorIndex === undefined && 'colorIndex' in p) delete n.colorIndex; return n; }); }),
    remove: (id) => update((x) => { x.locations = x.locations.filter((l) => l.id !== id); }),
    assignDates: (name) => setModal({ type: 'range', v: { from: firstUncovered, to: firstUncovered, loc: name, loc2: '' } }),
  };

  // ---------- saving forms ----------
  const saveFlight = (v: FlightDraft) => {
    doneInbox();
    const { _new, priceDraft, ...rest } = v;
    const f: Flight = { ...rest };
    const price = toMoney(priceDraft);
    if (price) f.price = price; else delete f.price;
    update((x) => { const i = x.flights.findIndex((e) => e.id === f.id); if (i >= 0) x.flights[i] = f as Flight; else x.flights.push(f as Flight); });
    close();
  };
  const saveStay = (v: StayDraft) => {
    doneInbox();
    const { _new, locationName: ln, mapsUrl, pos, priceDraft, localName, localAddress, phone, ...rest } = v;
    update((x) => {
      const s: Stay = { ...rest };
      const local = toLocal(localName, localAddress), ph = cleanPhone(phone);
      if (local) s.local = local;
      if (ph) s.phone = ph;
      const price = toMoney(priceDraft);
      if (price) { s.price = price; s.cost = ''; }
      const lid = ensureLocation(x, ln);
      if (lid) s.locationId = lid;
      const prev = x.stays.find((e) => e.id === s.id);
      const place = buildPlace(prev?.place, s.name, s.address, mapsUrl, pos);
      if (place && (mapsUrl.trim() || prev?.place || pos)) s.place = place;
      const i = x.stays.findIndex((e) => e.id === s.id);
      if (i >= 0) x.stays[i] = s; else x.stays.push(s);
    });
    close();
  };
  const saveItem = (f: ItemDraft) => {
    doneInbox();
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
      const place = buildPlace(it.place, f.placeName.trim() || it.title, f.placeAddress, f.mapsUrl, f.pos);
      if (place && (f.placeName.trim() || f.placeAddress.trim() || f.mapsUrl.trim() || f.pos)) it.place = place; else delete it.place;
      const local = toLocal(f.localName, f.localAddress), ph = cleanPhone(f.phone);
      if (local) it.local = local; else delete it.local;
      if (ph) it.phone = ph; else delete it.phone;
      if (f.link.trim()) it.link = f.link.trim(); else delete it.link;
      if (f.notes.trim()) it.notes = f.notes; else delete it.notes;
      const price = toMoney(f.price);
      if (price) it.price = price; else delete it.price;

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
        const slot = f.time ? slotFromTime(f.time) : (p?.slot ?? f.slot);
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
    else if (o.kind === 'leg') { const l = doc.legs.find((e) => e.id === o.id); if (l) editLeg(l); }
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
          <b><Icon name="warn" /> {dv.outside.length} thing{dv.outside.length > 1 ? 's are' : ' is'} outside the trip dates: kept, not deleted</b>
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
        <p className="muted small">Moving over from the old trip planner? Use <button className="link" onClick={() => navTo({ page: 'settings' })}>Settings → Restore</button> with your v1 JSON export; it is converted automatically.</p>
      </div>
    );
    const view = route.page === 'plan' ? route.view : 'calendar';
    return (<>
      <div className="plan-bar">
        <nav className="vtabs" aria-label="Plan view">
          {PLAN_VIEWS.map(([v, l]) => <button key={v} className={view === v ? 'on' : ''} onClick={() => goPlan(v)}>{l}</button>)}
        </nav>
      </div>
      {view !== 'day' && view !== 'map' && warnings}
      {isEmpty && (
        <div className="welcome">
          <h2>Empty trip: let’s fill it in</h2>
          <p>Add flights and stays and each day’s location fills itself in. Then open <b>Locations</b> to collect things to do and places to eat, and drag them onto days.</p>
          <div className="row gap wrap">
            <button className="btn primary" onClick={() => newFlight(doc.trip.start)}>+ Add a flight</button>
            <button className="btn primary" onClick={() => addStay(doc.trip.start)}>+ Add a stay</button>
            <button className="btn" onClick={() => setModal({ type: 'range', v: { from: doc.trip.start, to: doc.trip.start, loc: '', loc2: '' } })}><Icon name="location" /> Set locations for some days</button>
          </div>
        </div>
      )}
      {view === 'calendar' && (<>
        <Summary s={dv.stats} />
        <MonthView dv={dv} onDay={goDay} onStay={openStay} onFlight={openFlight} onLeg={openLeg} onAddLeg={(d) => addLeg(gapPrefill(d))} onAddStay={(from, to) => addStay(from, addDays(to, 1))} />
      </>)}
      {view === 'overview' && (<>
        <Summary s={dv.stats} />
        <OverviewView doc={doc} dv={dv} onDay={goDay} onAddStay={(d) => addStay(d)} onAddLeg={(d) => addLeg(gapPrefill(d))} />
        <Legend />
      </>)}
      {view === 'map' && <MapView doc={doc} dv={dv} onOpen={openPoint} />}
      {view === 'day' && <DayView doc={doc} dv={dv} date={dayDate} actions={plan} />}
    </>);
  };

  const moveItem = modal?.type === 'move' ? doc.items.find((i) => i.id === modal.itemId) : undefined;

  return (
    <LocationNames.Provider value={dv.known}>
    <CostContext.Provider value={costCtx}>
    <LocalCardProvider>
    <div className={'app page-' + page + (page === 'plan' ? ' view-' + route.view : '')}>
      <header className="top" ref={headerRef}>
        <TripSettings trip={doc.trip} onChange={(p) => update((x) => { x.trip = { ...x.trip, ...p }; })} />
        {sync.inbox.length > 0 && <button type="button" className="inbox-chip" onClick={() => navTo({ page: 'inbox' })} title="Bookings from email to review"><Icon name="inbox" /> {sync.inbox.length}</button>}
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
        {page === 'plan' && sync.inbox.length > 0 && (
          <div className="sync-banner inbox-banner">
            <span><Icon name="inbox" /> {sync.inbox.length} email{sync.inbox.length > 1 ? 's' : ''} with bookings to review.</span>
            <button className="btn sm primary" onClick={() => navTo({ page: 'inbox' })}>Review</button>
          </div>
        )}
        {page === 'plan' && planPage()}
        {page === 'locations' && <LocationsList doc={doc} dv={dv} actions={locActions} />}
        {page === 'location' && <LocationPage key={route.id} doc={doc} dv={dv} id={route.id} actions={locActions} plan={plan} onBack={() => navTo({ page: 'locations' })} />}
        {page === 'today' && <TodayPage doc={doc} dv={dv} which={route.which ?? 'today'} onWhich={(w) => go(w === 'tomorrow' ? { page: 'today', which: 'tomorrow' } : { page: 'today' }, true)} actions={plan} />}
        {BOOKING_PAGES.includes(page) && (
          <nav className="vtabs book-tabs" aria-label="Bookings">
            {([['stays', 'Stays', dv.stats.none], ['flights', 'Travel', dv.stats.noTransport], ['costs', 'Costs', 0]] as const).map(([pg, l, n]) => (
              <button key={pg} className={page === pg ? 'on' : ''} onClick={() => navTo({ page: pg })}>{l}{n ? <em className="badge bad">{n}</em> : null}</button>
            ))}
          </nav>
        )}
        {page === 'stays' && <div className="page"><h2 className="page-h">Stays</h2>{dv.overlaps.length > 0 && warnings}<StaysPanel dv={dv} actions={panelActions} /></div>}
        {page === 'flights' && <TravelPage dv={dv} actions={{ addFlight: newFlight, openFlight, patchFlight, addLeg, openLeg, patchLeg }} />}
        {page === 'costs' && <CostsPage doc={doc} dv={dv} update={update} onOpen={(ref) => {
          if (ref.type === 'stay') openStay(ref.stay); else if (ref.type === 'flight') openFlight(ref.flight); else if (ref.type === 'leg') openLeg(ref.leg); else plan.viewItem(ref.item, ref.pi);
        }} />}
        {page === 'inbox' && <InboxPage entries={sync.inbox} doc={doc} actions={inboxActions} syncing={!!sync.gistId} />}
        {page === 'settings' && sync.inbox.length > 0 && (
          <button className="more-inbox" onClick={() => navTo({ page: 'inbox' })}><Icon name="inbox" /> <b>Inbox</b> · {sync.inbox.length} email{sync.inbox.length > 1 ? 's' : ''} with bookings to review <span className="grow" />›</button>
        )}
        {page === 'settings' && <SettingsPage doc={doc} toast={toast} onGoogleKey={setGoogleKey} onCheckUpdate={appUpdate.check} theme={theme} onTheme={setTheme} sync={sync} status={syncText} statusOk={storageOk} onImport={(d) => { replace(d); toast('Trip imported', true); }} />}
      </main>

      <nav className="bottombar" aria-label="Menu">
        <button className={page === 'today' ? 'on' : ''} onClick={() => navTo({ page: 'today' })}><span className="bi"><NavIcon name="today" /></span><span>Today</span></button>
        <button className={page === 'plan' ? 'on' : ''} onClick={() => goPlan(lastPlan)}><span className="bi"><NavIcon name="plan" /></span><span>Plan</span></button>
        <button className={BOOKING_PAGES.includes(page) ? 'on' : ''} onClick={() => navTo({ page: lastBooking })}>
          <span className="bi"><NavIcon name="bookings" />{dv.stats.none + dv.stats.noTransport ? <em className="badge bad">{dv.stats.none + dv.stats.noTransport}</em> : null}</span><span>Bookings</span>
        </button>
        <button className={page === 'locations' || page === 'location' ? 'on' : ''} onClick={() => navTo({ page: 'locations' })}><span className="bi"><NavIcon name="location" /></span><span>Places</span></button>
        <button className={page === 'settings' || page === 'inbox' ? 'on' : ''} onClick={() => navTo({ page: 'settings' })}>
          <span className="bi"><NavIcon name="more" />{sync.inbox.length ? <em className="badge">{sync.inbox.length}</em> : null}</span><span>More</span>
        </button>
      </nav>

      {modal?.type === 'flight' && <FlightForm initial={modal.v} onClose={close} onSave={saveFlight} onDelete={() => delEntity('flights', modal.v.id)} />}
      {modal?.type === 'stay' && <StayForm initial={modal.v} onClose={close} onSave={saveStay} onDelete={() => delEntity('stays', modal.v.id)} />}
      {modal?.type === 'item' && <ItemForm initial={modal.v} trip={doc.trip} onClose={close} onSave={saveItem} onDelete={() => delEntity('items', modal.v.id)}
        onMove={() => setModal({ type: 'move', itemId: modal.v.id, pi: modal.v.pi, date: modal.v.date || undefined })} />}
      {modal?.type === 'move' && moveItem && (
        <MoveSheet item={moveItem} pi={modal.pi} dates={dv.dates} defaultDate={modal.date || dayDate} onClose={close}
          onEdit={() => setModal({ type: 'item', v: itemDraft(doc, moveItem, modal.pi) })}
          onUnplace={() => { close(); drop({ itemId: moveItem.id, pi: modal.pi }, { type: 'pool' }); }}
          onMove={(lane) => { close(); drop({ itemId: moveItem.id, pi: modal.pi }, { type: 'lane', lane }); }} />
      )}
      {modal?.type === 'view' && (() => {
        const it = doc.items.find((i) => i.id === modal.itemId);
        if (!it) return null;
        const l = dv.locById.get(it.locationId);
        return (
          <ItemView item={it} legs={doc.legs.filter((l) => l.itemId === it.id)} onOpenLeg={openLeg}
            onAddLeg={(role) => { const pl = it.placements[modal.pi] ?? it.placements[0]; addLeg({ date: pl?.date, itemId: it.id, itemRole: role, ...(role === 'to' ? { toLoc: locNameOf(it.locationId) } : { fromLoc: locNameOf(it.locationId) }) }); }}
            otherOptions={(date, meal) => doc.items.filter((o) => o.id !== it.id && o.placements.some((q) => q.date === date && q.meal === meal)).length} location={l ? { id: l.id, name: l.name } : undefined} colorOf={dv.colorOf} onClose={close}
            onEdit={() => setModal({ type: 'item', v: itemDraft(doc, it, modal.pi) })}
            onMove={() => setModal({ type: 'move', itemId: it.id, pi: modal.pi })}
            onStatus={(s) => plan.patchItem(it.id, { status: s })}
            onGoDay={(d) => { close(); goDay(d); }} />
        );
      })()}
      {modal?.type === 'viewStay' && (() => {
        const s = doc.stays.find((x) => x.id === modal.id);
        if (!s) return null;
        const l = s.locationId ? dv.locById.get(s.locationId) : undefined;
        return <StayView stay={s} location={l ? { id: l.id, name: l.name } : undefined} colorOf={dv.colorOf} onClose={close}
          onEdit={() => editStay(s)} onStatus={(st) => patchStay(s.id, { status: st })} onGoDay={(d) => { close(); if (dv.info[d]) goDay(d); }} />;
      })()}
      {modal?.type === 'viewFlight' && (() => {
        const f = doc.flights.find((x) => x.id === modal.id);
        if (!f) return null;
        return <FlightView flight={f} onClose={close} onEdit={() => editFlight(f)} onStatus={(st) => patchFlight(f.id, { status: st })}
          onGoDay={(d) => { close(); if (dv.info[d]) goDay(d); }} />;
      })()}
      {modal?.type === 'leg' && <TransportForm initial={modal.v} items={doc.items} onClose={close} onSave={saveLeg} onDelete={() => { update((x) => { x.legs = x.legs.filter((l) => l.id !== modal.v.id); }); close(); toast('Deleted', true); }} />}
      {modal?.type === 'viewLeg' && (() => {
        const l = doc.legs.find((x) => x.id === modal.id);
        if (!l) return null;
        return <TransportView leg={l} locName={locNameOf} item={l.itemId ? doc.items.find((i) => i.id === l.itemId) : undefined} onClose={close}
          onEdit={() => editLeg(l)} onStatus={(st) => patchLeg(l.id, { status: st })} onGoDay={(d) => { close(); if (dv.info[d]) goDay(d); }}
          onOpenItem={(it) => setModal({ type: 'view', itemId: it.id, pi: it.placements.findIndex((p) => p.date === l.date) })} />;
      })()}
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
              <button className="btn ghost" onClick={() => { downloadJson(exportName(doc, '-this-device'), exportJson(doc)); downloadJson(exportName(r, '-other-device'), exportJson(r)); }}>Download both</button>
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
      {appUpdate.updateAvailable && (
        <div className="update-bar" role="status">
          <button className="update-go" onClick={appUpdate.update}>Update available, tap to refresh</button>
          <button className="icon sm" aria-label="Later" onClick={appUpdate.dismiss}>✕</button>
        </div>
      )}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg.msg}
          {toastMsg.undo && <button className="toast-undo" onClick={() => { undo(); setToastMsg(null); }}>Undo</button>}
        </div>
      )}
    </div>
    </LocalCardProvider>
    </CostContext.Provider>
    </LocationNames.Provider>
  );
}
