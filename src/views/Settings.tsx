import { useMemo, useRef, useState } from 'react';
import { fmtShort, todayStr } from '../domain/dates';
import { readTripFile, type FileKind } from '../domain/migrate';
import type { TripDoc } from '../domain/types';
import type { Theme } from '../theme';
import { Seg } from '../components/ui';
import { SyncSettings } from './SyncSettings';
import { loadLandscape, saveLandscape } from '../components/LocalCard';
import { clearDeviceGoogleKey, deviceGoogleKey, testGoogleKey } from '../sync/google';
import { exportJson, isGoogleKey } from '../domain/normalize';
import { APP_VERSION } from '../pwa';
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

export function SettingsPage({ doc, onImport, toast, status, statusOk, theme, onTheme, sync, onGoogleKey, onCheckUpdate }: {
  doc: TripDoc; onImport: (d: TripDoc) => void; onGoogleKey: (key: string | undefined) => void;
  onCheckUpdate: () => Promise<'found' | 'latest' | 'offline' | 'unsupported'>; toast: (m: string) => void; status: string; statusOk: boolean; theme: Theme; onTheme: (t: Theme) => void; sync: Sync;
}) {
  const hasKey = !!doc.settings?.googleMapsKey;
  const [withKey, setWithKey] = useState(false);
  // Exports leave the Google Maps key out unless you tick the box.
  const json = useMemo(() => exportJson(doc, withKey), [doc, withKey]);
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
      <GoogleKey tripKey={doc.settings?.googleMapsKey || ''} onSave={onGoogleKey} />
      <h4>Sync between devices</h4>
      <SyncSettings sync={sync} doc={doc} />
      {!statusOk && <p className="alert bad small">{status}</p>}
      <h4>Back up (export)</h4>
      <div className="row gap wrap">
        <button className="btn primary" onClick={() => { downloadJson(exportName(doc), json); toast('Exported'); }}>Download JSON</button>
        <button className="btn" onClick={copy}>Copy JSON</button>
        <span className="muted small">{doc.flights.length} flights · {doc.stays.length} stays · {doc.items.length} items ({placed} on a day)</span>
      </div>
      {hasKey && (
        <label className="check small export-key">
          <input type="checkbox" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} /> Include the Google Maps key
          {withKey && <span className="warn-text">This file will contain your Google Maps key: don’t share it.</span>}
        </label>
      )}
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
      <h4>About this app</h4>
      <AppVersion onCheck={onCheckUpdate} />
    </div>
  );
}

function AppVersion({ onCheck }: { onCheck: () => Promise<'found' | 'latest' | 'offline' | 'unsupported'> }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const text = { found: 'A new version is ready: tap “Update available” at the bottom.', latest: 'This is the latest version.', offline: 'You’re offline: try again with a connection.', unsupported: 'Updates are checked when the app opens.' };
  return (
    <div className="app-version">
      <p className="small">Version <b>{APP_VERSION}</b></p>
      <div className="row gap wrap">
        <button className="btn" disabled={busy} onClick={async () => { setBusy(true); setMsg(''); setMsg(text[await onCheck()]); setBusy(false); }}>{busy ? 'Checking…' : 'Check for updates'}</button>
        {msg && <span className="small">{msg}</span>}
      </div>
    </div>
  );
}

/**
 * Your Google Maps key, saved with the trip so it syncs through the Gist to your other devices (by your choice;
 * the GitHub token never syncs). A key saved on a device only still wins on that device.
 */
function GoogleKey({ tripKey, onSave }: { tripKey: string; onSave: (key: string | undefined) => void }) {
  const device = deviceGoogleKey();
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [askRemove, setAskRemove] = useState(false);
  const last4 = (k: string) => `…${k.slice(-4)}`;
  // Remove: from the trip (every device, after sync) and from this device. The Maps script can only load once
  // per page, so the app reloads to stop using it.
  const remove = () => { clearDeviceGoogleKey(); onSave(undefined); setTimeout(() => location.reload(), 300); };
  if (tripKey || device) return (
    <div className="gkey">
      {tripKey && <p className="small"><b>Saved with the trip: {last4(tripKey)}</b> <span className="muted">· syncs to your other devices. Used for the Map, Find on map and Get local name.</span></p>}
      {device && <p className="small"><b>Saved on this device only: {last4(device)}</b> <span className="muted">· {tripKey ? 'this device uses it instead of the trip’s key.' : 'not synced.'}</span>
        {!tripKey && <> <button className="link" onClick={() => onSave(device)}>Save it with the trip</button></>}</p>}
      <div className="row gap wrap">
        <button className="btn" disabled={busy} onClick={async () => { setBusy(true); setMsg(''); try { setMsg(await testGoogleKey()); } catch (e) { setMsg(e instanceof Error ? e.message : 'Didn’t work'); } finally { setBusy(false); } }}>{busy ? 'Testing…' : 'Test key'}</button>
        {!askRemove ? <button className="btn ghost danger" onClick={() => setAskRemove(true)}>Remove key</button>
          : <span className="confirm small">Remove it from the trip on every device{device ? ' and from this device' : ''}? <button className="btn danger" onClick={remove}>Remove</button> <button className="btn ghost" onClick={() => setAskRemove(false)}>Keep</button></span>}
      </div>
      {msg && <p className="small">{msg}</p>}
    </div>
  );
  return (
    <div className="gkey">
      <p className="muted small">Paste your Google Maps key to turn on the Map, Find on map and Get local name.
        It’s saved with the trip, so your other devices get it after sync. Only use a key that is <b>restricted to this website, restricted to the
        Maps JavaScript and Places APIs, and capped</b> (see the README).</p>
      <div className="row gap">
        <input className="grow" type="password" autoComplete="off" spellCheck={false} placeholder="AIza…" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Google Maps key" />
        <button className="btn primary" disabled={!isGoogleKey(key)} onClick={() => { onSave(key.trim()); setKey(''); }}>Save</button>
      </div>
    </div>
  );
}
