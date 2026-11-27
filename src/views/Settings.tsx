import { useMemo, useRef, useState } from 'react';
import { fmtShort, todayStr } from '../domain/dates';
import { readTripFile, type FileKind } from '../domain/migrate';
import type { TripDoc } from '../domain/types';
import type { Theme } from '../theme';
import { Seg } from '../components/ui';
import { SyncSettings } from './SyncSettings';
import { loadLandscape, saveLandscape } from '../components/LocalCard';
import { getGoogleKey, setGoogleKey, testGoogleKey } from '../sync/google';
import type { Sync } from '../sync/useSync';

export function downloadJson(filename: string, json: string, type = 'application/json') {
  const blob = new Blob([json], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const exportName = (doc: TripDoc, suffix = '') =>
  `${(doc.trip.name || 'trip').replace(/[^\w-]+/g, '-').toLowerCase()}${suffix}-${todayStr()}.json`;

export function SettingsPage({ doc, onImport, toast, status, statusOk, theme, onTheme, sync }: {
  doc: TripDoc; onImport: (d: TripDoc) => void; toast: (m: string) => void; status: string; statusOk: boolean; theme: Theme; onTheme: (t: Theme) => void; sync: Sync;
}) {
  const json = useMemo(() => JSON.stringify(doc, null, 2), [doc]);
  const [paste, setPaste] = useState('');
  const [pending, setPending] = useState<{ doc: TripDoc; from: FileKind } | null>(null);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [landscape, setLandscape] = useState(loadLandscape);
  const placed = doc.items.filter((i) => i.placements.length).length;

  const copy = async () => {
    try { await navigator.clipboard.writeText(json); toast('JSON copied'); }
    catch { setErr('Couldn’t copy automatically. Open “Show JSON”, select the text and copy it.'); }
  };
  const parse = (text: string) => {
    setErr('');
    setPending(null);
    try { setPending(readTripFile(JSON.parse(text))); }
    catch (e) { setErr('Couldn’t read that: ' + (e instanceof Error ? e.message : String(e))); }
  };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(parse);
    e.target.value = '';
  };
  const p = pending?.doc;
  return (
    <div className="page settings-page">
      <h2 className="page-h">Settings</h2>
      <h4>Appearance</h4>
      <Seg value={theme} onChange={onTheme} options={[['system', 'Match my phone'], ['light', 'Light'], ['dark', 'Dark']]} />
      <label className="check switch-row">
        <input type="checkbox" checked={landscape} onChange={(e) => { setLandscape(e.target.checked); saveLandscape(e.target.checked); }} />
        <span><b>Open local card in landscape</b><br /><span className="muted small">With the phone upright, the 文 card is drawn sideways: turn the phone to read it. Your phone’s rotation setting isn’t changed. Saved on this device only.</span></span>
      </label>
      <h4>Google Maps</h4>
      <GoogleKey />
      <h4>Sync between devices</h4>
      <SyncSettings sync={sync} doc={doc} />
      {!statusOk && <p className="alert bad small">{status}</p>}
      <h4>Back up (export)</h4>
      <div className="row gap wrap">
        <button className="btn primary" onClick={() => { downloadJson(exportName(doc), json); toast('Exported'); }}>Download JSON</button>
        <button className="btn" onClick={copy}>Copy JSON</button>
        <span className="muted small">{doc.flights.length} flights · {doc.stays.length} stays · {doc.items.length} items ({placed} on a day)</span>
      </div>
      <details className="small"><summary>Show JSON</summary><textarea className="mono" rows={8} readOnly value={json} onFocus={(e) => e.target.select()} /></details>
      <h4>Restore (import)</h4>
      <p className="muted small">Accepts files exported from this app or from the old (v1) trip planner. v1 files are converted automatically.</p>
      <div className="row gap">
        <button className="btn" onClick={() => fileRef.current?.click()}>Choose JSON file…</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} />
      </div>
      <textarea className="mono" rows={4} placeholder="…or paste exported JSON here" value={paste} onChange={(e) => setPaste(e.target.value)} />
      <div className="row gap"><button className="btn" disabled={!paste.trim()} onClick={() => parse(paste)}>Import pasted JSON</button></div>
      {err && <div className="alert bad">{err}</div>}
      {p && (
        <div className="alert warn">
          <b>Replace the current trip?</b>
          <div>
            {pending.from === 'v1' && <>Old v1 file, will be converted. </>}
            “{p.trip.name}” · {p.trip.start ? `${fmtShort(p.trip.start)} – ${fmtShort(p.trip.end)}` : 'no dates'} · {p.flights.length} flights, {p.stays.length} stays, {p.items.length} items, {p.locations.length} locations.
            {' '}Your current trip on this device will be overwritten. Download it first if you want to keep it.
          </div>
          <div className="row gap"><button className="btn danger" onClick={() => { onImport(p); setPending(null); setPaste(''); }}>Replace trip</button><button className="btn ghost" onClick={() => setPending(null)}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}

/** Your own Google Maps key: kept in this browser only (each device needs it once), never synced or published. */
function GoogleKey() {
  const saved = getGoogleKey();
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // The Maps script can only load once per page, so a new key takes effect after a reload.
  const save = (k: string) => { setGoogleKey(k); location.reload(); };
  if (saved) return (
    <div className="gkey">
      <p className="small">Using your Google Maps key on this device (…{saved.slice(-4)}): the Map, Find on map and Get local name use Google.</p>
      <div className="row gap wrap">
        <button className="btn" disabled={busy} onClick={async () => { setBusy(true); setMsg(''); try { setMsg(await testGoogleKey()); } catch (e) { setMsg(e instanceof Error ? e.message : 'Didn’t work'); } finally { setBusy(false); } }}>{busy ? 'Testing…' : 'Test key'}</button>
        <button className="btn ghost danger" onClick={() => save('')}>Remove key</button>
      </div>
      {msg && <p className="small">{msg}</p>}
    </div>
  );
  return (
    <div className="gkey">
      <p className="muted small">Paste your Google Maps key to use Google for the Map, Find on map and Get local name (OpenStreetMap is used until then). It stays in this browser only: add it once on each device. See the README for how to make a free, capped key.</p>
      <div className="row gap">
        <input className="grow" type="password" autoComplete="off" spellCheck={false} placeholder="AIza…" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Google Maps key" />
        <button className="btn primary" disabled={!/^AIza[\w-]{20,}$/.test(key.trim())} onClick={() => save(key)}>Save</button>
      </div>
    </div>
  );
}
