// Layout for the month view: full calendar months covering the trip, with stays as bars
// (check-in midday → check-out midday) packed into lanes, and uncovered trip nights as gap bars.
import { addDays, dow, isDate, range } from './dates';
import type { Stay } from './types';

export interface BarSpan<T> { item: T; start: string; end: string; lane: number } // start/end are the days the bar's ends sit on
export interface WeekBar<T> { item: T; lane: number; from: number; to: number; openLeft: boolean; openRight: boolean } // grid lines 1..15
export interface MonthBlock { key: string; first: string; weeks: string[][] }

/** Calendar months (Monday-start weeks) covering a..b. */
export function monthsCovering(a: string, b: string): MonthBlock[] {
  if (!isDate(a) || !isDate(b) || a > b) return [];
  const out: MonthBlock[] = [];
  for (let m = a.slice(0, 7) + '-01'; m <= b; ) {
    const next = addMonth(m);
    const last = addDays(next, -1);
    const weeks: string[][] = [];
    for (let w = addDays(m, -((dow(m) + 6) % 7)); w <= last; w = addDays(w, 7)) weeks.push(range(w, addDays(w, 6)));
    out.push({ key: m.slice(0, 7), first: m, weeks });
    m = next;
  }
  return out;
}
const addMonth = (m: string) => {
  const y = +m.slice(0, 4), mo = +m.slice(5, 7);
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
};

/** Greedy lane packing. Bars touching at the same day (check-out/check-in) share a lane. */
export function packLanes<T>(spans: { item: T; start: string; end: string }[]): BarSpan<T>[] {
  const sorted = [...spans].sort((p, q) => p.start.localeCompare(q.start) || q.end.localeCompare(p.end));
  const laneEnds: string[] = [];
  return sorted.map((s) => {
    let lane = laneEnds.findIndex((e) => e <= s.start);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(s.end); } else laneEnds[lane] = s.end;
    return { ...s, lane };
  });
}

/** Where each bar sits in one week row (14 half-day columns → grid lines 1..15). */
export function barsInWeek<T>(bars: BarSpan<T>[], week: string[]): WeekBar<T>[] {
  const w0 = week[0], w6 = week[6];
  const out: WeekBar<T>[] = [];
  for (const b of bars) {
    if (b.start > w6 || b.end < w0) continue;
    const openLeft = b.start < w0, openRight = b.end > w6;
    const from = openLeft ? 1 : 2 * week.indexOf(b.start) + 2;
    const to = openRight ? 15 : 2 * week.indexOf(b.end) + 2;
    if (from < to) out.push({ item: b.item, lane: b.lane, from, to, openLeft, openRight });
  }
  return out;
}

export type MonthBarItem = { kind: 'stay'; stay: Stay } | { kind: 'gap'; from: string; to: string };

export function monthBars(stays: Stay[], uncovered: { from: string; to: string }[]): BarSpan<MonthBarItem>[] {
  const spans: { item: MonthBarItem; start: string; end: string }[] = [];
  for (const s of stays)
    if (isDate(s.checkIn) && isDate(s.checkOut) && s.checkIn < s.checkOut) spans.push({ item: { kind: 'stay', stay: s }, start: s.checkIn, end: s.checkOut });
  for (const u of uncovered) spans.push({ item: { kind: 'gap', ...u }, start: u.from, end: addDays(u.to, 1) });
  return packLanes(spans);
}
