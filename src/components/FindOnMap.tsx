import { useState } from 'react';
import { geocode, type GeoResult } from '../sync/geocode';
import { Field } from './ui';

export type Pos = { lat: number; lng: number } | null;

/** Shows the saved map position and lets you find one by name (OpenStreetMap search). */
export function FindOnMap({ value, query, onChange }: { value: Pos; query: string; onChange: (p: Pos, r?: GeoResult) => void }) {
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const find = async () => {
    setBusy(true); setErr(''); setResults(null);
    try { const r = await geocode(query); setResults(r); if (!r.length) setErr('Nothing found. Try adding the area or the address.'); }
    catch { setErr('Couldn’t reach the map search. Check your connection.'); }
    finally { setBusy(false); }
  };
  return (
    <Field label="Map position" span hint={value ? undefined : 'Needed for the map. A long Google Maps link sets it too.'}>
      <span className="row gap wrap">
        {value ? <span className="small">📍 {value.lat.toFixed(4)}, {value.lng.toFixed(4)}</span> : <span className="muted small">Not set</span>}
        <button type="button" className="btn sm" disabled={!query.trim() || busy} onClick={find}>{busy ? 'Searching…' : `Find on map${query.trim() ? ': ' + query.slice(0, 30) : ''}`}</button>
        {value && <button type="button" className="link sm" onClick={() => onChange(null)}>clear</button>}
      </span>
      {results && results.length > 0 && (
        <span className="geo-results">
          {results.map((r, i) => (
            <button type="button" key={i} className="pick" onClick={() => { onChange({ lat: r.lat, lng: r.lng }, r); setResults(null); }}>
              <span className="grow"><b>{r.name}</b><br /><span className="muted small">{r.address}</span></span>
            </button>
          ))}
          <span className="muted small">Search by OpenStreetMap</span>
        </span>
      )}
      {err && <span className="small" style={{ color: 'var(--warn)' }}>{err}</span>}
    </Field>
  );
}
