// "Today": the day in time order, tonight's hotel, and anything still to sort out, with a switch to see
// tomorrow. Before the trip: a countdown, what's still to book, and day 1. After: a short summary.
import { useEffect, useState, type ReactNode } from 'react';
import { addDays, fmt, fmtLong, todayStr } from '../domain/dates';
import type { Derived } from '../domain/derive';
import { flightLabel } from '../domain/derive';
import { cardFor } from '../domain/local';
import { mapsLink } from '../domain/maps';
import { MEAL_LABEL, MODE_LABEL, SLOT_LABEL } from '../domain/constants';
import { agenda, nextDay, phase, problems, rowMinutes, stillToBook, summary, type AgendaRow, type Problem } from '../domain/today';
import type { Flight, Stay, TransportLeg, TripDoc } from '../domain/types';
import { Conf, legTitle } from '../components/BookingViews';
import { Icon, ItemIcon, ModeIcon } from '../components/Icons';
import { LocalButton } from '../components/LocalCard';
import { LocDisplay, StatusPill } from '../components/ui';
import type { PlanActions } from './DayView';
import { TaskList } from '../components/Tasks';
import { DayWeather } from '../components/Weather';

const nowHM = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export function TodayPage({ doc, dv, which, onWhich, actions }: {
  doc: TripDoc; dv: Derived; which: 'today' | 'tomorrow'; onWhich: (w: 'today' | 'tomorrow') => void; actions: PlanActions;
}) {
  // Re-draw every minute so "now" moves through the day.
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);
  const today = todayStr();
  const ph = phase(dv, today);

  if (ph.kind === 'none') return <div className="page today"><p className="empty">Set the trip dates at the top to see each day here.</p></div>;
  if (ph.kind === 'after') {
    const s = summary(doc, dv);
    return (
      <div className="page today">
        <section className="t-card t-hero"><h2>{doc.trip.name} is over</h2>
          <p>{s.days} days · {s.places.join(', ')}</p>
          <p className="muted small">{s.stays} stays · {s.flights} flights · {s.plans} plans</p>
          <button className="btn" onClick={() => actions.goDay(dv.dates[0])}>Look back through the days</button>
        </section>
      </div>
    );
  }
  // Before the trip, "today" is day 1 and "tomorrow" day 2.
  const base = ph.kind === 'before' ? dv.dates[0] : today;
  const date = which === 'tomorrow' ? nextDay(dv, base) ?? base : base;
  const isToday = ph.kind === 'during' && date === today;
  const label = ph.kind === 'before' ? (date === base ? 'Day 1' : 'Day 2') : date === today ? 'Today' : 'Tomorrow';
  const x = dv.info[date];
  const rows = agenda(doc, dv, date);
  const now = nowHM();
  const firstUpcoming = isToday ? rows.findIndex((r) => r.approx || rowMinutes(r) >= now) : -1;
  const after = nextDay(dv, date);
  const heads = [...problems(dv, date), ...(after ? problems(dv, after) : [])];
  const leftover = doc.tasks.filter((t) => !t.date && !t.done);

  return (
    <div className="page today">
      {ph.kind === 'before' && <Countdown doc={doc} dv={dv} days={ph.days} actions={actions} />}
      <header className="t-head">
        <div className="grow">
          <h2>{fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <div className="row gap wrap small muted">
            <span>Day {dv.dates.indexOf(date) + 1} of {dv.dates.length}</span>
            <LocDisplay loc={x.loc} colorOf={dv.colorOf} size="sm" />
          </div>
        </div>
        <div className="seg">
          <button className={which === 'today' ? 'on' : ''} onClick={() => onWhich('today')}>{ph.kind === 'before' ? 'Day 1' : 'Today'}</button>
          <button className={which === 'tomorrow' ? 'on' : ''} disabled={!nextDay(dv, base)} onClick={() => onWhich('tomorrow')}>{ph.kind === 'before' ? 'Day 2' : 'Tomorrow'}</button>
        </div>
      </header>

      <section className="t-card t-wx"><DayWeather doc={doc} dv={dv} date={date} hourly /></section>

      <section className="t-card">
        <div className="t-h"><h3>{label}’s plan</h3><button className="btn sm" onClick={() => actions.goDay(date)}>Route &amp; map · Day view</button></div>
        {rows.length === 0 && <p className="muted small">Nothing planned yet. <button className="link" onClick={() => actions.goDay(date)}>Plan this day</button></p>}
        <ol className="agenda">
          {rows.map((r, i) => (<AgendaLine key={i} r={r} dv={dv} actions={actions} past={isToday && (firstUpcoming === -1 || i < firstUpcoming)} now={i === firstUpcoming} />))}
        </ol>
      </section>

      <section className="t-card">
        <div className="t-h"><h3>To do {label === 'Today' || label === 'Tomorrow' ? label.toLowerCase() : `on ${label}`}</h3></div>
        <TaskList tasks={doc.tasks.filter((t) => t.date === date)} actions={actions.tasks} date={date} placeholder={`Add a to-do for ${label === 'Today' || label === 'Tomorrow' ? label.toLowerCase() : label}`} />
      </section>

      <Tonight date={date} dv={dv} actions={actions} label={label} />

      {ph.kind === 'during' && leftover.length > 0 && (
        <section className="t-card">
          <details>
            <summary className="t-h"><h3>Before you go: {leftover.length} not ticked</h3></summary>
            <TaskList tasks={leftover} actions={actions.tasks} withBy placeholder="Add a to-do" />
          </details>
        </section>
      )}
      {(heads.length > 0 || (which === 'today' && after)) && (
        <section className="t-card">
          <div className="t-h"><h3>Heads up</h3></div>
          {heads.length === 0 && <p className="muted small">Nothing to sort out for {label.toLowerCase()} or the day after.</p>}
          <ul className="t-problems">{heads.map((p, i) => <ProblemLine key={i} p={p} dv={dv} base={date} actions={actions} />)}</ul>
          {which === 'today' && after && <TomorrowFirst doc={doc} dv={dv} date={after} name={ph.kind === 'before' ? 'Day 2' : 'Tomorrow'} onSee={() => onWhich('tomorrow')} />}
        </section>
      )}
    </div>
  );
}

function Countdown({ doc, dv, days, actions }: { doc: TripDoc; dv: Derived; days: number; actions: PlanActions }) {
  const list = stillToBook(doc, dv);
  const before = doc.tasks.filter((t) => !t.date);
  return (
    <section className="t-card t-hero">
      <h2>{days} day{days === 1 ? '' : 's'} to go</h2>
      <p className="muted small">{doc.trip.name} starts {fmtLong(dv.dates[0])}. Below is day 1 as it stands.</p>
      {list.length > 0 && (<>
        <h4>Still to book ({list.length})</h4>
        <ul className="t-problems">{list.slice(0, 8).map((p, i) => <ProblemLine key={i} p={p} dv={dv} actions={actions} withDate />)}</ul>
        {list.length > 8 && <p className="muted small">and {list.length - 8} more: see Bookings.</p>}
      </>)}
      <h4>Before you go{before.length ? ` (${before.filter((t) => !t.done).length} to do)` : ''}</h4>
      <TaskList tasks={before} actions={actions.tasks} withBy placeholder="Add something to do before the trip" />
    </section>
  );
}

const time = (r: AgendaRow) => (r.approx ? <span className="t-approx" title="No time set: usual time for this part of the day">~{r.time || '—'}</span> : r.time);

function AgendaLine({ r, dv, actions, past, now }: { r: AgendaRow; dv: Derived; actions: PlanActions; past: boolean; now: boolean }) {
  const area = (id?: string) => (id ? dv.locById.get(id)?.name : undefined);
  let icon: ReactNode, title: ReactNode, sub: ReactNode = null, local = undefined as ReturnType<typeof cardFor>, open: () => void, status = null as ReactNode;
  if (r.kind === 'flight') {
    const f = r.flight;
    icon = <Icon name="flight" />;
    title = r.at === 'dep' ? <>{flightLabel(f)} {f.from || '?'} → {f.to || '?'}</> : <>{flightLabel(f)} lands at {f.to || '?'}</>;
    sub = [r.at === 'dep' ? `arrives ${f.arrTime || '?'}${f.arrDate && f.arrDate !== f.depDate ? ` (${fmtLong(f.arrDate)})` : ''}` : `left ${f.from || '?'} ${fmtLong(f.depDate)} ${f.depTime}`, f.conf && `Ref ${f.conf}`].filter(Boolean).join(' · ');
    open = () => actions.openFlight(f);
    status = <StatusPill small value={f.status} onChange={(s) => actions.patchFlight(f.id, { status: s })} />;
  } else if (r.kind === 'leg') {
    const l = r.leg, from = l.fromName || area(l.fromLocationId), to = l.toName || area(l.toLocationId);
    icon = <ModeIcon mode={l.mode} />;
    title = r.at === 'dep' ? <>{legTitle(l)}{from || to ? ` · ${from || '?'} → ${to || '?'}` : ''}</> : <>{legTitle(l)} arrives {to || ''}</>;
    sub = [r.at === 'dep' && l.arrTime && `until ${l.arrTime}${l.arrDate ? ` (${fmtLong(l.arrDate)})` : ''}`, l.conf && `Ref ${l.conf}`, !l.operator && MODE_LABEL[l.mode]].filter(Boolean).join(' · ');
    local = r.at === 'dep' ? cardFor(from || 'From', l.fromLocal) ?? cardFor(to || 'To', l.toLocal) : cardFor(to || 'To', l.toLocal);
    open = () => actions.openLeg(l);
    status = <StatusPill small value={l.status} onChange={(s) => actions.patchLeg(l.id, { status: s })} />;
  } else if (r.kind === 'stay') {
    const s = r.stay;
    icon = <Icon name="stay" />;
    title = <>{r.at === 'in' ? 'Check in' : 'Check out'}: {s.name || 'Stay'}</>;
    sub = [s.address, r.at === 'in' && s.conf && `Ref ${s.conf}`].filter(Boolean).join(' · ');
    local = r.at === 'in' ? stayCard(s, dv) : undefined;
    open = () => actions.openStay(s);
    status = <StatusPill small value={s.status} onChange={(st) => actions.patchStay(s.id, { status: st })} />;
  } else {
    const it = r.item, p = r.placement;
    icon = <ItemIcon item={it} />;
    title = <>{it.mustDo && <span className="ic-star">★</span>}{it.title || 'Untitled'}</>;
    sub = [p.meal ? MEAL_LABEL[p.meal] : p.slot ? SLOT_LABEL[p.slot] : 'Any time', it.place?.name && it.place.name !== it.title ? it.place.name : '', it.booking].filter(Boolean).join(' · ');
    local = cardFor(it.place?.name || it.title, it.local, { phone: it.phone, pos: it.place?.lat != null ? { lat: it.place.lat, lng: it.place.lng! } : null, context: area(it.locationId) });
    open = () => actions.viewItem(it, r.pi);
    status = <StatusPill small value={it.status} onChange={(s) => actions.patchItem(it.id, { status: s })} />;
  }
  return (
    <>
      {now && <li className="t-now" aria-label="Now"><span>Now</span></li>}
      <li className={'t-row' + (past ? ' past' : '')} onClick={open} role="button">
        <span className="t-time">{time(r)}</span>
        <span className="t-ico">{icon}</span>
        <span className="t-main"><b>{title}</b>{sub && <span className="muted small">{sub}</span>}</span>
        <span className="t-acts" onClick={(e) => e.stopPropagation()}><LocalButton className="sm" data={local} />{status}</span>
      </li>
    </>
  );
}

const stayCard = (s: Stay, dv: Derived) => cardFor(s.name || 'Hotel', s.local, { phone: s.phone, pos: s.place?.lat != null ? { lat: s.place.lat, lng: s.place.lng! } : null, context: `${s.address} ${dv.locById.get(s.locationId || '')?.name || ''}` });

function Tonight({ date, dv, actions, label }: { date: string; dv: Derived; actions: PlanActions; label: string }) {
  const x = dv.info[date], n = x.night;
  const title = label === 'Today' ? 'Tonight' : label === 'Tomorrow' ? 'Tomorrow night' : `${label}: night`;
  if (n.kind === 'end') return <section className="t-card"><div className="t-h"><h3>{title}</h3></div><p className="muted small">Last day of the trip: no hotel tonight.</p></section>;
  if (n.kind === 'plane' || n.kind === 'transit') return <section className="t-card"><div className="t-h"><h3>{title}</h3></div><p><Icon name={n.kind === 'plane' ? 'flight' : 'leg'} /> {n.kind === 'plane' ? 'Night on the plane' : 'Night on the way'}</p></section>;
  if (n.kind === 'none') return (
    <section className="t-card t-warn"><div className="t-h"><h3>{title}</h3></div>
      <p><b>No stay booked.</b></p>
      <button className="btn primary sm" onClick={() => actions.addStay(date, addDays(date, 1), (x.loc?.b ?? x.loc?.a)?.name || '')}>Add a stay</button>
    </section>
  );
  const s = n.stay, checkingIn = x.checkIns.some((c) => c.id === s.id);
  return (
    <section className="t-card">
      <div className="t-h"><h3>{title}</h3><StatusPill small value={s.status} onChange={(st) => actions.patchStay(s.id, { status: st })} /></div>
      <p className="t-hotel" onClick={() => actions.openStay(s)} role="button"><Icon name="stay" /> <b>{s.name || 'Stay'}</b>{s.address && <span className="muted small"> · {s.address}</span>}</p>
      <div className="t-facts small">
        {checkingIn && <span>Check in {s.checkInTime ? `from ${s.checkInTime}` : 'today'}</span>}
        {s.checkOut && <span>Check out {fmtLong(s.checkOut)}{s.checkOutTime ? ` by ${s.checkOutTime}` : ''}</span>}
        {s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" /> {s.phone}</a>}
      </div>
      {s.conf && <div className="t-conf small"><span className="muted">Confirmation</span> <Conf value={s.conf} /></div>}
      <div className="row gap wrap t-btns">
        <LocalButton label="Take me to my hotel" data={stayCard(s, dv)} />
        <a className="btn" href={mapsLink(s.place ?? { name: s.name, address: s.address }, s.name, dv.locById.get(s.locationId || '')?.name)} target="_blank" rel="noreferrer">Google Maps ↗</a>
      </div>
    </section>
  );
}

function ProblemLine({ p, dv, actions, base, withDate }: { p: Problem; dv: Derived; actions: PlanActions; base?: string; withDate?: boolean }) {
  // Named against the real today: "Tomorrow" only means tomorrow; other days get their date.
  const t = todayStr();
  const when = withDate ? fmtLong(p.date) : p.date === base ? '' : p.date === addDays(t, 1) ? 'Tomorrow' : fmtLong(p.date);
  const go = () => {
    const r = p.ref;
    if (p.kind === 'nostay') { const x = dv.info[p.date]; actions.addStay(p.date, addDays(p.date, 1), (x?.loc?.b ?? x?.loc?.a)?.name || ''); }
    else if (p.kind === 'notransport') actions.goDay(p.date);
    else if (r && 'checkIn' in r) actions.openStay(r as Stay);
    else if (r && 'flightNo' in r) actions.openFlight(r as Flight);
    else if (r) actions.openLeg(r as TransportLeg);
  };
  return (
    <li className={'t-problem ' + p.kind} onClick={go} role="button">
      <Icon name="warn" /> {when && <b>{when}: </b>}{p.kind === 'nostay' && withDate ? `No stay booked` : p.text}{p.kind === 'unbooked' && withDate ? ' · not booked yet' : ''}
    </li>
  );
}

function TomorrowFirst({ doc, dv, date, name, onSee }: { doc: TripDoc; dv: Derived; date: string; name: string; onSee: () => void }) {
  const first = agenda(doc, dv, date)[0];
  const what = !first ? 'nothing planned yet'
    : first.kind === 'item' ? first.item.title : first.kind === 'flight' ? `${flightLabel(first.flight)} ${first.at === 'dep' ? 'departs' : 'lands'}`
    : first.kind === 'leg' ? `${legTitle(first.leg)} ${first.at === 'dep' ? 'departs' : 'arrives'}` : `${first.at === 'in' ? 'Check in' : 'Check out'}: ${first.stay.name}`;
  return (
    <p className="t-next small">{name} starts {first ? <>at <b>{first.approx ? '~' : ''}{first.time || 'any time'}</b> with </> : 'with '}<b>{what}</b>. <button className="link" onClick={onSee}>See {name === 'Tomorrow' ? 'tomorrow' : name} →</button></p>
  );
}
