import { addDays, diffDays, dow, fmt, range, todayStr } from '../domain/dates';
import { flightLabel, type Derived } from '../domain/derive';
import type { Flight, TripDoc } from '../domain/types';
import { daySummary } from '../domain/plan';
import { MEALS, SLOTS, SLOT_LABEL, MEAL_LABEL } from '../domain/constants';
import { LocDisplay, NightBadge, cssVars, dayStripe } from '../components/ui';

export const flightChipText = (f: Flight, d: string) => {
  if (f.depDate === d) return `${f.flightNo || flightLabel(f)} ${f.from || '?'}→${f.to || '?'}${f.depTime ? ' ' + f.depTime : ''}`;
  return `${f.flightNo || flightLabel(f)} →${f.to || '?'} arr ${f.arrTime || ''}`.trim();
};

export function OverviewView({ doc, dv, onDay, onAddStay }: { doc: TripDoc; dv: Derived; onDay: (d: string) => void; onAddStay: (d: string) => void }) {
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
            const end = x.endLoc ? colorOf(x.endLoc) : null;
            const c1 = x.loc ? colorOf(x.loc.a) : null;
            const showMonth = d === start || d.endsWith('-01');
            const flights = [...x.arr, ...x.dep];
            return (
              <div key={d} className={'cal-day' + (x.loc ? '' : ' unplanned') + (d === t ? ' today' : '')}
                style={c1 ? cssVars({ '--c2': end!.solid, '--cbg': end!.wash, '--stripe': dayStripe(x, colorOf, 'to bottom') }) : undefined}
                onClick={() => onDay(d)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onDay(d)}>
                <div className="cd-top">
                  <span className="cd-date"><span className="cd-dow">{fmt(d, { weekday: 'short' })}</span> {fmt(d, { day: 'numeric' })}{showMonth && <span className="cd-month"> {fmt(d, { month: 'short' })}</span>}</span>
                  <span className="cd-dayno">Day {diffDays(start, d) + 1}</span>
                </div>
                <div className="cd-loc">
                  {x.loc ? <LocDisplay loc={x.loc} colorOf={colorOf} size="sm" /> : <span className="loc unplanned sm">No location</span>}
                </div>
                {flights.length > 0 && (
                  <div className="cd-flights">
                    {flights.map((f) => <span key={f.id + (f.depDate === d ? 'd' : 'a')} className={`fchip st-${f.status}`}>✈ {flightChipText(f, d)}</span>)}
                  </div>
                )}
                <DayMarks doc={doc} d={d} />
                <div className="cd-bottom">
                  <NightBadge night={x.night} onClick={x.night.kind === 'none' ? (e) => { e.stopPropagation(); onAddStay(d); } : undefined} />
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

function DayMarks({ doc, d }: { doc: TripDoc; d: string }) {
  const s = daySummary(doc, d);
  return (
    <div className="cd-marks">
      <span className="slots" title="Morning · afternoon · evening">
        {SLOTS.map((k) => <i key={k} className={(s.slots[k] ? 'on' : '') + (s.load[k] > 1 ? ' over' : '')} title={SLOT_LABEL[k] + (s.slots[k] ? '' : ': free') + (s.load[k] > 1 ? ' (over capacity)' : '')} />)}
      </span>
      <span className="meals" title="Breakfast · lunch · dinner">
        {MEALS.map((m) => <i key={m} className={s.meals[m]} title={`${MEAL_LABEL[m]}: ${s.meals[m] === 'chosen' ? 'picked' : s.meals[m] === 'options' ? 'options, none picked' : 'nothing yet'}`} />)}
      </span>
      {s.unslotted > 0 && <span className="cd-items">+{s.unslotted}</span>}
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
      <span className="slots-key"><i className="on" /><i /><i /> morning · afternoon · evening filled</span>
      <span className="meals-key"><i className="chosen" /><i className="options" /><i /> meal picked · options · nothing</span>
      <span>Tap a day to plan it</span>
    </div>
  );
}
