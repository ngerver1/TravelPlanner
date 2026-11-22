import { DateInput } from './inputs';
import { useEffect, useState } from 'react';
import { MAX_SPAN, diffDays, isDate } from '../domain/dates';
import type { TripDoc } from '../domain/types';

export function TripSettings({ trip, onChange }: { trip: TripDoc['trip']; onChange: (p: Partial<TripDoc['trip']>) => void }) {
  const [s, setS] = useState(trip.start);
  const [e, setE] = useState(trip.end);
  const [name, setName] = useState(trip.name);
  useEffect(() => { setS(trip.start); setE(trip.end); setName(trip.name); }, [trip.start, trip.end, trip.name]);
  const ok = (a: string, b: string) => isDate(a) && isDate(b) && a <= b && diffDays(a, b) <= MAX_SPAN;
  const valid = ok(s, e);
  const apply = (ns: string, ne: string) => { if (ok(ns, ne)) onChange({ start: ns, end: ne }); };
  const n = valid ? diffDays(s, e) : 0;
  const hint = !s && !e ? 'Choose your trip dates' : !isDate(s) || !isDate(e) ? 'Choose start and end' : valid ? `${n + 1} days · ${n} nights` : 'End must be on/after start';
  return (
    <div className="settings">
      <input className="trip-name" value={name} onChange={(ev) => setName(ev.target.value)}
        onBlur={() => name.trim() && name !== trip.name && onChange({ name: name.trim() })}
        onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()} aria-label="Trip name" placeholder="Name your trip" />
      <div className={'dates' + (valid || (!s && !e) ? '' : ' invalid')}>
        <DateInput value={s} onChange={(ev) => {
          const v = ev.target.value;
          setS(v);
          // First time: no end yet, so start with a one-day trip you can then extend.
          if (isDate(v) && !isDate(e)) { setE(v); apply(v, v); } else apply(v, e);
        }} aria-label="Start date" />
        <span className="arrow">→</span>
        <DateInput value={e} min={s || undefined} onChange={(ev) => { setE(ev.target.value); apply(s, ev.target.value); }} aria-label="End date" />
        <span className="muted small nowrap">{hint}</span>
      </div>
    </div>
  );
}
