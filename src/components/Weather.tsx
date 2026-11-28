// Weather strips (a day), an hour-by-hour row (today/tomorrow) and a week, from the saved Open-Meteo forecast.
import { addDays, fmt, fmtLong, todayStr } from '../domain/dates';
import { describe, temps, wetness, type Forecast } from '../domain/weather';
import { Icon } from './Icons';

const lastDay = (f: Forecast) => Object.keys(f.daily).sort().pop() || '';
const asOf = (f: Forecast) => new Date(f.fetchedAt).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** One day's weather in one line, or why there isn't any yet. */
export function WxStrip({ f, date, name }: { f?: Forecast; date: string; name?: string }) {
  const w = f?.daily[date];
  if (!w) {
    if (date < todayStr()) return null;
    const msg = !f ? (navigator.onLine ? 'Loading weather…' : 'Weather shows when you’re online')
      : date > lastDay(f) ? `Forecast from ${fmtLong(addDays(date, -15))}` : null;
    return msg ? <div className="wx wx-none small muted">{name && <b>{name}: </b>}{msg}</div> : null;
  }
  const d = describe(w.code), wet = wetness(w);
  const stale = Date.now() - f!.fetchedAt > 12 * 3600 * 1000;
  return (
    <div className="wx" title={`Forecast from Open-Meteo, ${asOf(f!)}`}>
      <span className="wx-ico"><Icon name={d.icon} /></span>
      {name && <b className="wx-name">{name}</b>}
      <span className="wx-temp">{temps(w)}</span>
      <span className="wx-what">{wet && (d.icon === 'rain' || d.icon === 'snow') ? wet : `${d.label}${wet ? ` · ${wet}` : ''}`}</span>
      {stale && <span className="wx-stale small muted">as of {asOf(f!)}</span>}
    </div>
  );
}

/** Hour by hour (every 2 hours; from now on today). */
export function WxHourly({ f, date }: { f?: Forecast; date: string }) {
  const hours = f?.hourly[date];
  if (!hours?.length) return null;
  const now = date === todayStr() ? new Date().getHours() : 6;
  const show = hours.filter((h) => { const hh = +h.time.slice(0, 2); return hh >= now && (hh - now) % 2 === 0; }).slice(0, 10);
  if (!show.length) return null;
  return (
    <div className="wx-hours" role="list" aria-label="Hourly forecast">
      {show.map((h) => (
        <div key={h.time} className="wx-hour" role="listitem">
          <span className="small muted">{h.time.slice(0, 2)}</span>
          <Icon name={describe(h.code).icon} />
          <b>{Math.round(h.temp)}°</b>
          {h.pop != null && h.pop >= 20 && <span className="small wx-pop">{h.pop}%</span>}
        </div>
      ))}
    </div>
  );
}

/** The next 7 days. */
export function WxWeek({ f }: { f?: Forecast }) {
  const t = todayStr();
  const days = f ? Object.keys(f.daily).sort().filter((d) => d >= t).slice(0, 7) : [];
  if (!f) return <p className="small muted">{navigator.onLine ? 'Loading weather…' : 'Weather shows when you’re online.'}</p>;
  if (!days.length) return <p className="small muted">No forecast yet.</p>;
  return (
    <div>
      <ul className="wx-week">
        {days.map((d) => { const w = f.daily[d], k = describe(w.code), wet = wetness(w); return (
          <li key={d}>
            <span className="wx-day">{d === t ? 'Today' : fmt(d, { weekday: 'short', day: 'numeric' })}</span>
            <Icon name={k.icon} />
            <span className="wx-temp">{temps(w)}</span>
            <span className="small muted">{wet && (k.icon === 'rain' || k.icon === 'snow') ? wet : `${k.label}${wet ? ` · ${wet}` : ''}`}</span>
          </li>
        ); })}
      </ul>
      <p className="small muted">Open-Meteo forecast, {asOf(f)}.</p>
    </div>
  );
}

import type { Derived } from '../domain/derive';
import type { TripDoc } from '../domain/types';
import { useWeather } from '../sync/weather';

/** A day's weather for where you are (both places on a travel day); hourly too if asked. */
export function DayWeather({ doc, dv, date, hourly }: { doc: TripDoc; dv: Derived; date: string; hourly?: boolean }) {
  const loc = dv.info[date]?.loc;
  const ids = [loc?.a.id, loc?.b?.id].filter((v): v is string => !!v);
  const wx = useWeather(doc, ids);
  if (!loc || !ids.length) return null;
  const two = ids.length > 1;
  return (
    <div className="wx-day-block">
      {ids.map((id) => <WxStrip key={id} f={wx[id]} date={date} name={two ? dv.locById.get(id)?.name : undefined} />)}
      {hourly && <WxHourly f={wx[ids[ids.length - 1]]} date={date} />}
    </div>
  );
}

/** A place's next 7 days. */
export function PlaceWeather({ doc, id }: { doc: TripDoc; id: string }) {
  const wx = useWeather(doc, [id]);
  return <WxWeek f={wx[id]} />;
}
