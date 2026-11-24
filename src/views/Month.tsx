import { useMemo } from 'react';
import { fmt, todayStr } from '../domain/dates';
import { STATUS_LABEL } from '../domain/constants';
import { flightLabel, type Derived } from '../domain/derive';
import { barsInWeek, monthBars, weeksCovering, type MonthBarItem } from '../domain/month';
import type { Flight, Stay, TransportLeg } from '../domain/types';
import { MODE_ICON } from '../domain/constants';
import { legChipText } from './Overview';
import { cssVars, dayStripe } from '../components/ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MonthView({ dv, onDay, onStay, onFlight, onAddStay, onLeg, onAddLeg }: {
  dv: Derived; onDay: (d: string) => void; onStay: (s: Stay) => void; onFlight: (f: Flight) => void; onAddStay: (from: string, to: string) => void;
  onLeg: (l: TransportLeg) => void; onAddLeg: (d: string) => void;
}) {
  const { dates, colorOf, locById } = dv;
  const start = dates[0], end = dates[dates.length - 1];
  const weeks = useMemo(() => weeksCovering(start, end), [start, end]);
  const bars = useMemo(() => monthBars(dv.stays, dv.uncovered), [dv.stays, dv.uncovered]);
  const lanes = Math.max(1, ...bars.map((b) => b.lane + 1));
  const flightsOn = useMemo(() => {
    const m = new Map<string, { f: Flight; dep: boolean }[]>();
    const add = (d: string, f: Flight, dep: boolean) => { const l = m.get(d) || []; l.push({ f, dep }); m.set(d, l); };
    for (const f of dv.flights) {
      if (f.arrDate && f.arrDate !== f.depDate) add(f.arrDate, f, false);
      if (f.depDate) add(f.depDate, f, true);
    }
    return m;
  }, [dv.flights]);
  const t = todayStr();
  const inTrip = (d: string) => d >= start && d <= end;

  const barText = (it: MonthBarItem) => {
    if (it.kind === 'gap') return 'NO STAY';
    return it.stay.name || 'Stay';
  };

  return (
    <div className="mv">
      <section className="mv-month">
          <div className="mv-head">{WEEKDAYS.map((d) => <div key={d}>{d}</div>)}</div>
          {weeks.map((wk) => {
            const wb = barsInWeek(bars, wk);
            return (
              <div key={wk[0]} className="mv-week" style={{ gridTemplateRows: `auto repeat(${lanes}, var(--lane)) minmax(var(--frow), auto)` }}>
                {wk.map((d, i) => {
                  const other = !inTrip(d);
                  const showMonth = d === start || d.endsWith('-01');
                  const x = dv.info[d];
                  const c = x?.endLoc ? colorOf(x.endLoc) : null;
                  const col = `${2 * i + 1} / span 2`;
                  return [
                    <div key={d} role="button" tabIndex={other || !inTrip(d) ? -1 : 0} aria-label={fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}
                      className={'mv-day' + (other ? ' other' : '') + (inTrip(d) ? ' trip' : ' off')}
                      style={cssVars({ gridColumn: col, '--dc': c?.solid, '--stripe': dayStripe(x, colorOf, 'to right') })}
                      onClick={() => inTrip(d) && onDay(d)} onKeyDown={(e) => e.key === 'Enter' && inTrip(d) && onDay(d)} />,
                    <div key={'l' + d} className={'mv-label' + (other ? ' other' : '') + (inTrip(d) ? ' trip' : ' off') + (d === t ? ' today' : '')} style={{ gridColumn: col }}>
                      <span className="mv-num">{fmt(d, { day: 'numeric' })}{showMonth && <span className="mv-mon"> {fmt(d, { month: 'short' })}</span>}</span>
                      {!other && x?.loc && <span className="mv-loc" style={{ color: c!.fg }}>{x.loc.a.name}{x.loc.b ? ' → ' + x.loc.b.name : ''}</span>}
                    </div>,
                  ];
                })}
                {wb.map((b) => {
                  const it = b.item;
                  const cls = 'mv-bar' + (it.kind === 'gap' ? ' gap' : ` st-${it.stay.status}`) + (b.openLeft ? ' ol' : '') + (b.openRight ? ' or' : '');
                  const where = it.kind === 'stay' && it.stay.locationId ? locById.get(it.stay.locationId)?.name : '';
                  const title = it.kind === 'gap' ? 'No stay booked: click to add one' : `${barText(it)}${where ? ' · ' + where : ''} · ${STATUS_LABEL[it.stay.status]}`;
                  return (
                    <button key={(it.kind === 'gap' ? 'g' + it.from : it.stay.id) + wk[0]} type="button" className={cls} title={title}
                      style={{ gridColumn: `${b.from} / ${b.to}`, gridRow: b.lane + 2 }}
                      onClick={() => (it.kind === 'gap' ? onAddStay(it.from, it.to) : onStay(it.stay))}>
                      {(!b.openLeft || b.to - b.from >= 4) && <span>{barText(it)}</span>}
                    </button>
                  );
                })}
                {wk.map((d, i) => {
                  const fl = flightsOn.get(d) || [];
                  const x = dv.info[d];
                  const legs = x ? [...x.legArr, ...x.legDep] : [];
                  if (!fl.length && !legs.length && !x?.noTransport) return null;
                  return (
                    <div key={'f' + d} className="mv-flights" style={{ gridColumn: `${2 * i + 1} / span 2`, gridRow: lanes + 2 }}>
                      {fl.map(({ f, dep }) => (
                        <button key={f.id + dep} type="button" className={`mv-fl st-${f.status}`} onClick={() => onFlight(f)}
                          title={`${flightLabel(f)} ${f.from}→${f.to} · dep ${f.depTime || '?'} · arr ${f.arrTime || '?'}`}>
                          <span className="long">✈ {f.flightNo || flightLabel(f)} {dep ? `${f.from || '?'}→${f.to || '?'} ${f.depTime}` : `→${f.to || '?'} ${f.arrTime}`}</span>
                          <span className="short">✈{f.to || '?'}</span>
                        </button>
                      ))}
                      {legs.map((l) => (
                        <button key={l.id + (l.date === d)} type="button" className={`mv-fl st-${l.status}`} onClick={() => onLeg(l)} title={`${l.operator || l.mode} ${l.fromName}→${l.toName}`}>
                          <span className="long">{MODE_ICON[l.mode]} {legChipText(l, d, dv)}</span>
                          <span className="short">{MODE_ICON[l.mode]}</span>
                        </button>
                      ))}
                      {x?.noTransport && <button type="button" className="mv-fl notr" onClick={() => onAddLeg(d)} title="Location changes with no flight or transport booked"><span className="long">NO TRANSPORT</span><span className="short">NO TRANSP.</span></button>}
                    </div>
                  );
                })}
              </div>
            );
          })}
      </section>
      <div className="legend small muted">
        <span><i className="mv-key st-booked" /> stay booked</span>
        <span><i className="mv-key st-planned" /> planned</span>
        <span><i className="mv-key st-idea" /> idea</span>
        <span><i className="mv-key gap" /> no stay</span>
        <span>Stripe above each day = its location · tap a bar or flight to edit, a day to open it</span>
      </div>
    </div>
  );
}
