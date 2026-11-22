import { useMemo, useRef, useState } from 'react';
import { fmtShort, todayStr } from '../domain/dates';
import { readTripFile, type FileKind } from '../domain/migrate';
import type { TripDoc } from '../domain/types';
import type { Theme } from '../theme';
import { Seg } from '../components/ui';

export function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: 'application/json' });
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

export function SettingsPage({ doc, onImport, toast, status, statusOk, theme, onTheme }: {
  doc: TripDoc; onImport: (d: TripDoc) => void; toast: (m: string) => void; status: string; statusOk: boolean; theme: Theme; onTheme: (t: Theme) => void;
}) {
  const json = useMemo(() => JSON.stringify(doc, null, 2), [doc]);
  const [paste, setPaste] = useState('');
  const [pending, setPending] = useState<{ doc: TripDoc; from: FileKind } | null>(null);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
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
      <h4>Saving</h4>
      <p className={'small ' + (statusOk ? 'muted' : 'alert bad')}>{status}. Syncing between your phone and laptop comes in the next update.</p>
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
