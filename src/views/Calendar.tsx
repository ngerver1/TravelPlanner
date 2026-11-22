import { addDays, diffDays, dow, fmt, range, todayStr } from '../domain/dates';
import { flightLabel, type Derived } from '../domain/derive';
import type { Flight } from '../domain/types';
import { LocDisplay, NightBadge, cssVars } from '../components/ui';

export const flightChipText = (f: Flight, d: string) => {
  if (f.depDate === d) return `${f.flightNo || flightLabel(f)} ${f.from || '?'}→${f.to || '?'}${f.depTime ? ' ' + f.depTime : ''}`;
  return `${f.flightNo || flightLabel(f)} →${f.to || '?'} arr ${f.arrTime || ''}`.trim();
};

export function CalendarView({ dv, onDay, onAddStay }: { dv: Derived; onDay: (d: string) => void; onAddStay: (d: string) => void }) {
  const { dates, info, colorOf } = dv;
  if (!dates.length) return null;
  const start = dates[0];
  const first = addDays(start, -((dow(start) + 6) % 7));
  const weeks: string[][] = [];
  for (let w = first; w <= dates[dates.length - 1]; w = addDays(w, 7)) weeks.push(range(w, addDays(w, 6)));
  const inTrip = new Set(dates);
  const t = todayStr();
  return (
    <div className="cal">
      <div className="cal-head">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d}>{d}</div>)}</div>
      {weeks.map((wk) => (
        <div className="cal-week" key={wk[0]}>
          {wk.map((d) => {
            if (!inTrip.has(d)) return <div key={d} className="cal-pad" />;
            const x = info[d];
            const c1 = x.loc ? colorOf(x.loc.a) : null;
            const c2 = x.loc?.b ? colorOf(x.loc.b) : c1;
            const showMonth = d === start || d.endsWith('-01');
            const flights = [...x.arr, ...x.dep];
            return (
              <div key={d} className={'cal-day' + (x.loc ? '' : ' unplanned') + (d === t ? ' today' : '')}
                style={c1 ? cssVars({ '--c1': c1.solid, '--c2': c2!.solid, '--cbg': c1.bg }) : undefined}
                onClick={() => onDay(d)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onDay(d)}>
                <div className="cd-top">
                  <span className="cd-date"><span className="cd-dow">{fmt(d, { weekday: 'short' })}</span> {fmt(d, { day: 'numeric' })}{showMonth && <span className="cd-month"> {fmt(d, { month: 'short' })}</span>}</span>
                  <span className="cd-dayno">Day {diffDays(start, d) + 1}</span>
                </div>
                <div className="cd-loc">
                  {x.loc ? <LocDisplay loc={x.loc} colorOf={colorOf} size="sm" /> : <span className="loc unplanned sm">No location</span>}
                  {x.loc?.manual && <span className="tag manual tiny" title="Set by hand">M</span>}
                </div>
                {flights.length > 0 && (
                  <div className="cd-flights">
                    {flights.map((f) => <span key={f.id + (f.depDate === d ? 'd' : 'a')} className={`fchip st-${f.status}`}>✈ {flightChipText(f, d)}</span>)}
                  </div>
                )}
                <div className="cd-bottom">
                  <NightBadge night={x.night} onClick={x.night.kind === 'none' ? (e) => { e.stopPropagation(); onAddStay(d); } : undefined} />
                  {x.entries.length > 0 && <span className="cd-items">{x.entries.length} item{x.entries.length > 1 ? 's' : ''}</span>}
                  {x.notes && <span className="cd-note" title={x.notes}>✎</span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function Summary({ s }: { s: Derived['stats'] }) {
  const Stat = ({ v, l, tone }: { v: number | string; l: string; tone?: string }) => <div className={'stat ' + (tone || '')}><b>{v}</b><span>{l}</span></div>;
  return (
    <div className="summary">
      <Stat v={s.nights} l="nights" />
      <Stat v={s.booked} l="booked" tone={s.booked ? 'good' : ''} />
      <Stat v={s.unbooked} l="unbooked" tone={s.unbooked ? 'warn' : 'good'} />
      {s.none > 0 && <Stat v={s.none} l="no stay at all" tone="bad" />}
      {s.plane > 0 && <Stat v={s.plane} l="on a plane" />}
      <Stat v={s.noLoc} l={`day${s.noLoc === 1 ? '' : 's'} no location`} tone={s.noLoc ? 'bad' : 'good'} />
      <Stat v={`${s.flightsBooked}/${s.flights}`} l="flights booked" tone={s.flights && s.flightsBooked < s.flights ? 'warn' : s.flights ? 'good' : ''} />
    </div>
  );
}

export function Legend() {
  return (
    <div className="legend small muted">
      <span><i className="dot st-booked" /> booked</span>
      <span><i className="dot st-planned" /> planned</span>
      <span><i className="dot st-idea" /> idea</span>
      <span><i className="dot none" /> no stay</span>
      <span><span className="tag manual tiny">M</span> location set by hand</span>
      <span>Click a day to open it in Days · click a status to change it</span>
    </div>
  );
}
