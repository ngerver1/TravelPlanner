import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from '../domain/dates';
import { CURRENCIES, KIND_LABEL, costReport, costsCsv, fmtMoney, fmtPrice, usedCurrencies, type CostKind, type CostLine } from '../domain/money';
import { STATUS_LABEL } from '../domain/constants';
import type { Derived } from '../domain/derive';
import type { Rates, Status, TripDoc } from '../domain/types';
import type { Update } from '../store';
import { fetchRates } from '../sync/rates';
import { downloadJson } from './Settings';
import { LocChip } from '../components/ui';

export function CostsPage({ doc, dv, update, onOpen }: { doc: TripDoc; dv: Derived; update: Update; onOpen: (ref: CostLine['ref']) => void }) {
  const r = useMemo(() => costReport(doc), [doc]);
  const home = r.home;
  const used = useMemo(() => usedCurrencies(doc), [doc]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const rates = doc.rates?.base === home ? doc.rates : undefined;
  const missingRates = used.filter((c) => !rates?.rates[c]);

  const refresh = async () => {
    setBusy(true); setErr('');
    try {
      const fresh = await fetchRates(home);
      update((x) => {
        const keep = x.rates?.base === home ? x.rates : undefined;
        const merged: Rates = { ...fresh, rates: { ...fresh.rates } };
        for (const c of keep?.manual ?? []) if (keep?.rates[c]) merged.rates[c] = keep.rates[c]; // manual rates win
        if (keep?.manual?.length) merged.manual = keep.manual;
        x.rates = merged;
      });
    } catch (e) {
      setErr(`Couldn’t get exchange rates (${e instanceof Error ? e.message : 'offline'}). You can type rates in below.`);
    } finally { setBusy(false); }
  };
  // Fetch automatically once if a currency has no rate yet.
  const tried = useRef(false);
  useEffect(() => { if (missingRates.length && !tried.current && navigator.onLine) { tried.current = true; refresh(); } }, [missingRates.length]); // eslint-disable-line

  const setRate = (c: string, v: string) => {
    const n = Number(v);
    update((x) => {
      const base = x.rates?.base === home ? x.rates : { base: home, date: '', rates: {} };
      const next: Rates = { ...base, rates: { ...base.rates }, manual: [...new Set([...(base.manual ?? []), c])] };
      if (v.trim() && isFinite(n) && n > 0) next.rates[c] = n; else { delete next.rates[c]; next.manual = next.manual!.filter((m) => m !== c); }
      x.rates = next;
    });
  };
  const locName = (id?: string) => (id ? dv.locById.get(id)?.name || '' : '');
  const pct = (n: number) => (r.total ? Math.round((n / r.total) * 100) : 0);
  const money = (n: number) => fmtMoney(n, home, { round: true });
  const kinds = (Object.keys(KIND_LABEL) as CostKind[]).filter((k) => r.byKind[k] > 0);
  const locs = [...r.byLocation.entries()].sort((a, b) => b[1] - a[1]);
  const ideasTotal = r.ideas.reduce((n, l) => n + (l.home ?? 0), 0);

  return (
    <div className="page costs">
      <h2 className="page-h">Costs</h2>

      <section className="cost-settings">
        <label className="field"><span>Home currency</span>
          <select value={home} onChange={(e) => update((x) => { x.trip.currency = e.target.value; })}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field"><span>Travellers</span>
          <input type="number" min={1} max={50} inputMode="numeric" value={doc.trip.people || 1}
            onChange={(e) => { const n = Math.max(1, Math.min(50, Math.floor(Number(e.target.value) || 1))); update((x) => { x.trip.people = n; }); }} />
        </label>
        <p className="muted small grow">“Per person” prices are multiplied by the number of travellers.</p>
      </section>

      {used.length > 0 && (
        <section className="rates">
          <div className="row between wrap">
            <b className="small">Exchange rates</b>
            <span className="row gap">
              <span className="muted small">{rates?.date ? `ECB rates of ${fmt(rates.date, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No rates yet'}</span>
              <button className="btn sm" disabled={busy} onClick={refresh}>{busy ? 'Updating…' : 'Update rates'}</button>
            </span>
          </div>
          <div className="rate-list">
            {used.map((c) => (
              <label key={c} className="rate">
                <span className="muted small">1 {home} =</span>
                <input inputMode="decimal" defaultValue={rates?.rates[c] ? +rates.rates[c].toFixed(4) : ''} key={c + (rates?.rates[c] ?? '')} placeholder="rate"
                  onBlur={(e) => setRate(c, e.target.value)} className={!rates?.rates[c] ? 'bad' : ''} />
                <span className="small">{c}{rates?.manual?.includes(c) ? <span className="muted"> (yours)</span> : null}</span>
              </label>
            ))}
          </div>
          {err && <p className="alert warn small">{err}</p>}
        </section>
      )}

      <section className="cost-total">
        <div className="ct-main"><span className="muted small">Trip total</span><b>{money(r.total)}</b><span className="muted small">for {r.people} traveller{r.people > 1 ? 's' : ''}{r.people > 1 ? ` · ${money(r.total / r.people)} each` : ''}</span></div>
        <div className="ct-split">
          {(['booked', 'planned', 'idea'] as Status[]).map((s) => (
            <div key={s} className={`ct-part st-${s}`}><span className="dot" />{STATUS_LABEL[s]}<b>{money(r.byStatus[s])}</b></div>
          ))}
        </div>
        <div className="ct-bar">{(['booked', 'planned', 'idea'] as Status[]).map((s) => <i key={s} className={`st-${s}`} style={{ width: pct(r.byStatus[s]) + '%' }} />)}</div>
        {r.unconverted.length > 0 && <p className="alert warn small">Not in the total yet: amounts in {r.unconverted.join(', ')}. Add a rate above.</p>}
      </section>

      <div className="cost-grid">
        <section className="cost-box">
          <h3>By type</h3>
          {kinds.length ? kinds.map((k) => <Row key={k} label={KIND_LABEL[k]} value={money(r.byKind[k])} pct={pct(r.byKind[k])} />) : <p className="muted small">Nothing costed yet.</p>}
        </section>
        <section className="cost-box">
          <h3>By location</h3>
          {locs.length ? locs.map(([id, v]) => {
            const l = id ? dv.locById.get(id) : undefined;
            return <Row key={id || 'none'} label={l ? <LocChip loc={{ id: l.id, name: l.name }} colorOf={dv.colorOf} size="sm" /> : <span className="muted">Travel (flights, transport)</span>} value={money(v)} pct={pct(v)} color={l ? dv.colorOf(l).solid : undefined} />;
          }) : <p className="muted small">Nothing costed yet.</p>}
        </section>
      </div>

      <section className="cost-box">
        <div className="row between wrap">
          <h3>Everything in the total ({r.lines.length})</h3>
          <button className="btn sm" disabled={!r.lines.length} onClick={() => downloadJson(`${(doc.trip.name || 'trip').replace(/[^\w-]+/g, '-').toLowerCase()}-costs.csv`, costsCsv(r, locName), 'text/csv')}>Download CSV</button>
        </div>
        <ul className="cost-lines">
          {r.lines.map((l) => <Line key={l.kind + l.id} l={l} home={home} locName={locName} onOpen={onOpen} />)}
        </ul>
        {!r.lines.length && <p className="muted small">Add a price to stays and flights, and a cost to things to do and places to eat (in their editors).</p>}
      </section>

      {r.missing.length > 0 && (
        <section className="cost-box">
          <h3>No cost yet ({r.missing.length})</h3>
          <div className="row gap wrap">
            {r.missing.map((m, i) => <button key={i} className="btn sm" onClick={() => onOpen(m.ref)}>{KIND_LABEL[m.kind].replace(/s$/, '')}: {m.title || 'Untitled'}</button>)}
          </div>
        </section>
      )}

      {r.ideas.length > 0 && (
        <section className="cost-box">
          <h3>Ideas not on a day ({r.ideas.length}) · not in the total</h3>
          <p className="muted small">If you did all of these: {money(ideasTotal)}</p>
          <ul className="cost-lines">{r.ideas.map((l) => <Line key={l.id} l={l} home={home} locName={locName} onOpen={onOpen} />)}</ul>
        </section>
      )}
      <p className="muted small">Counted: stays, flights, things to do that are on a day, and places to eat on days they’re the pick (or the only option for that meal).</p>
    </div>
  );
}

function Row({ label, value, pct, color }: { label: React.ReactNode; value: string; pct: number; color?: string }) {
  return (
    <div className="cost-row">
      <span className="cr-l">{label}</span><span className="cr-v">{value}</span>
      <span className="cr-bar"><i style={{ width: pct + '%', background: color }} /></span>
    </div>
  );
}

function Line({ l, home, locName, onOpen }: { l: CostLine; home: string; locName: (id?: string) => string; onOpen: (ref: CostLine['ref']) => void }) {
  return (
    <li onClick={() => onOpen(l.ref)}>
      <span className="cl-date muted small">{l.date ? fmt(l.date, { day: 'numeric', month: 'short' }) : '—'}</span>
      <span className="cl-main"><b>{l.title || 'Untitled'}</b><span className="muted small"> {KIND_LABEL[l.kind]}{locName(l.locationId) ? ' · ' + locName(l.locationId) : ''}{l.times > 1 ? ` · ×${l.times}` : ''}</span></span>
      <span className={`pill sm st-${l.status}`}>{STATUS_LABEL[l.status]}</span>
      <span className="cl-amt"><b>{l.home == null ? '—' : fmtMoney(l.home, home, { round: true })}</b>{l.price.currency !== home || l.price.perPerson ? <span className="muted small">{fmtPrice(l.price)}</span> : null}</span>
    </li>
  );
}
