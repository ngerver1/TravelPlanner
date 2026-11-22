// Placing items on days: lanes (slots, meals, unslotted), moves, swaps, ordering and slot capacity.
// All operations mutate the given (draft) document.
import type { Item, Meal, Placement, Slot, TripDoc } from './types';
import { SLOTS } from './constants';

/** A lane on a day: a slot (activities), a meal (restaurants), or neither = "on this day, no slot yet". */
export interface Lane { date: string; slot?: Slot; meal?: Meal }
export interface Ref { itemId: string; pi: number } // pi = -1: not placed (in the ideas list)
export interface Entry { item: Item; pi: number; placement: Placement }

export const laneKey = (l: Lane) => `${l.date}|${l.meal ? 'm:' + l.meal : l.slot ? 's:' + l.slot : 'none'}`;
export function parseLaneKey(k: string): Lane {
  const [date, rest] = k.split('|');
  if (rest.startsWith('m:')) return { date, meal: rest.slice(2) as Meal };
  if (rest.startsWith('s:')) return { date, slot: rest.slice(2) as Slot };
  return { date };
}
export const inLane = (p: Placement, l: Lane) => p.date === l.date && p.meal === l.meal && (l.meal ? true : p.slot === l.slot);
export const laneOf = (p: Placement): Lane => (p.meal ? { date: p.date, meal: p.meal } : p.slot ? { date: p.date, slot: p.slot } : { date: p.date });
export const sameLane = (a: Lane, b: Lane) => laneKey(a) === laneKey(b);

/** Entries in a lane, in order. */
export function laneEntries(doc: TripDoc, lane: Lane): Entry[] {
  const out: Entry[] = [];
  for (const item of doc.items) item.placements.forEach((placement, pi) => { if (inLane(placement, lane)) out.push({ item, pi, placement }); });
  return out.sort((a, b) => a.placement.order - b.placement.order || a.item.title.localeCompare(b.item.title));
}

/** Can this item go in this lane? Restaurants go in meals; activities in slots or the unslotted strip. */
export function fits(item: Item, lane: Lane): boolean {
  return item.kind === 'restaurant' ? !!lane.meal : !lane.meal;
}

function renumber(list: Placement[]) { list.forEach((p, i) => { p.order = i; }); }

/** Put a placement into a lane at an index (default: end), renumbering the lane. */
function insertAt(doc: TripDoc, target: Placement, lane: Lane, index?: number) {
  const others = laneEntries(doc, lane).map((e) => e.placement).filter((p) => p !== target);
  target.date = lane.date;
  if (lane.meal) { target.meal = lane.meal; delete target.slot; }
  else { delete target.meal; delete target.chosen; if (lane.slot) target.slot = lane.slot; else delete target.slot; }
  const i = index == null || index < 0 || index > others.length ? others.length : index;
  others.splice(i, 0, target);
  renumber(others);
}

const find = (doc: TripDoc, id: string) => doc.items.find((i) => i.id === id);
/** Full-day activities always sit in the morning lane and span the day. */
const normLane = (item: Item, lane: Lane): Lane => (item.kind === 'activity' && item.size === 'full' && lane.slot ? { date: lane.date, slot: 'morning' } : lane);

/**
 * Place or move an item into a lane. For a ref with pi = -1 (from the ideas list): activities get
 * their single placement; restaurants gain an extra option. Returns the placement index, or -1 if
 * the item doesn't fit the lane.
 */
export function placeAt(doc: TripDoc, ref: Ref, rawLane: Lane, index?: number): number {
  const item = find(doc, ref.itemId);
  if (!item || !fits(item, rawLane)) return -1;
  const lane = normLane(item, rawLane);
  let pi = ref.pi;
  if (item.kind === 'activity') {
    const old = item.placements[0];
    const oldLane = old ? laneOf(old) : null;
    const p: Placement = old ?? { date: lane.date, order: 0 };
    item.placements = [p];
    pi = 0;
    insertAt(doc, p, lane, index);
    if (oldLane && !sameLane(oldLane, lane)) renumber(laneEntries(doc, oldLane).map((e) => e.placement));
    return pi;
  }
  // Restaurant
  const existing = item.placements.findIndex((p, i) => i !== pi && inLane(p, lane));
  if (pi < 0) {
    if (existing >= 0) { insertAt(doc, item.placements[existing], lane, index); return existing; }
    const p: Placement = { date: lane.date, meal: lane.meal, order: 0 };
    item.placements.push(p);
    insertAt(doc, p, lane, index);
    return item.placements.length - 1;
  }
  const p = item.placements[pi];
  if (!p) return -1;
  const oldLane = laneOf(p);
  if (existing >= 0) { // already an option in that meal: drop the duplicate
    item.placements.splice(pi, 1);
    renumber(laneEntries(doc, oldLane).map((e) => e.placement));
    insertAt(doc, item.placements[existing > pi ? existing - 1 : existing], lane, index);
    return existing > pi ? existing - 1 : existing;
  }
  insertAt(doc, p, lane, index);
  if (!sameLane(oldLane, lane)) renumber(laneEntries(doc, oldLane).map((e) => e.placement));
  return pi;
}

/** Take a placement off its day: the item goes back to (stays in) the ideas list. Never deletes the item. */
export function unplace(doc: TripDoc, ref: Ref) {
  const item = find(doc, ref.itemId);
  const p = item?.placements[ref.pi];
  if (!item || !p) return;
  const lane = laneOf(p);
  item.placements.splice(ref.pi, 1);
  renumber(laneEntries(doc, lane).map((e) => e.placement));
}

/** Move a placement to another day, keeping its slot or meal. Ideas-list items land unslotted (restaurants: their first meal). */
export function moveToDate(doc: TripDoc, ref: Ref, date: string): number {
  const item = find(doc, ref.itemId);
  if (!item) return -1;
  const p = ref.pi >= 0 ? item.placements[ref.pi] : undefined;
  const lane: Lane = p ? { ...laneOf(p), date } : item.kind === 'restaurant' ? { date, meal: item.meals?.[0] ?? 'lunch' } : { date };
  return placeAt(doc, ref, lane);
}

/** Half-day and full-day activities swap when one is dropped on the other. */
export const swappable = (a: Item, b: Item) =>
  a.kind === 'activity' && b.kind === 'activity' && a.id !== b.id && (a.size === 'half' || a.size === 'full') && (b.size === 'half' || b.size === 'full');

/** Swap two activities' places (across days too). If `a` is in the ideas list, `b` goes back there. */
export function swap(doc: TripDoc, a: Ref, b: Ref) {
  const ia = find(doc, a.itemId), ib = find(doc, b.itemId);
  const pb = ib?.placements[b.pi];
  if (!ia || !ib || !pb) return;
  const pa = ia.placements[a.pi];
  const laneB = laneOf(pb), orderB = pb.order;
  if (!pa) {
    ib.placements = [];
    ia.placements = [{ ...laneSlot(laneB), date: laneB.date, order: orderB }];
    return;
  }
  const laneA = laneOf(pa), orderA = pa.order;
  Object.assign(pa, { date: laneB.date, order: orderB }); setSlot(pa, ia.size === 'full' ? (laneB.slot ? 'morning' : undefined) : laneB.slot);
  Object.assign(pb, { date: laneA.date, order: orderA }); setSlot(pb, ib.size === 'full' ? (laneA.slot ? 'morning' : undefined) : laneA.slot);
}
const laneSlot = (l: Lane) => (l.slot ? { slot: l.slot } : {});
function setSlot(p: Placement, s: Slot | undefined) { if (s) p.slot = s; else delete p.slot; }

/** Mark one restaurant option as the pick for its meal (or clear it). Others in that meal stay as backups. */
export function setChosen(doc: TripDoc, ref: Ref, chosen: boolean) {
  const item = find(doc, ref.itemId);
  const p = item?.placements[ref.pi];
  if (!p || !p.meal) return;
  for (const e of laneEntries(doc, laneOf(p))) delete e.placement.chosen;
  if (chosen) p.chosen = true;
}

/** How full each slot is on a day: half = 1 in its slot; full = morning + afternoon (+ evening); quick = 0. */
export function slotLoad(doc: TripDoc, date: string): Record<Slot, number> {
  const load: Record<Slot, number> = { morning: 0, afternoon: 0, evening: 0 };
  for (const item of doc.items) {
    if (item.kind !== 'activity') continue;
    const p = item.placements[0];
    if (!p || p.date !== date || !p.slot) continue;
    if (item.size === 'full') { load.morning++; load.afternoon++; if (item.includesEvening) load.evening++; }
    else if (item.size === 'half') load[p.slot]++;
  }
  return load;
}
export const overCapacity = (load: Record<Slot, number>) => SLOTS.filter((s) => load[s] > 1);

/** What a day holds, for the overview: which slots have something, and each meal's state. */
export function daySummary(doc: TripDoc, date: string) {
  const slots: Record<Slot, boolean> = { morning: false, afternoon: false, evening: false };
  const meals: Record<Meal, 'none' | 'options' | 'chosen'> = { breakfast: 'none', lunch: 'none', dinner: 'none' };
  let unslotted = 0;
  for (const item of doc.items)
    for (const p of item.placements) {
      if (p.date !== date) continue;
      if (p.meal) meals[p.meal] = p.chosen || meals[p.meal] === 'chosen' ? 'chosen' : 'options';
      else if (p.slot) {
        slots[p.slot] = true;
        if (item.size === 'full') { slots.morning = slots.afternoon = true; if (item.includesEvening) slots.evening = true; }
      } else unslotted++;
    }
  return { slots, meals, unslotted, load: slotLoad(doc, date) };
}
