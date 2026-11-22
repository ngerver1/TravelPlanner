import { useEffect, useState } from 'react';
import type { TripDoc } from '../domain/types';
import type { GistInfo } from '../sync/gist';
import { SyncError } from '../sync/gist';
import type { Sync } from '../sync/useSync';
import { ConfirmDel } from '../components/ui';
import { SYNC_LABEL } from '../components/SyncChip';

const README = 'https://github.com/ngerver1/TravelPlanner#syncing-your-phone-and-laptop';
const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Trip%20Planner';
const errText = (e: unknown) => (e instanceof SyncError ? e.message : 'Something went wrong');
const summary = (d: TripDoc) => `“${d.trip.name}” · ${d.stays.length} stays, ${d.flights.length} flights, ${d.items.length} ideas`;

export function SyncSettings({ sync, doc }: { sync: Sync; doc: TripDoc }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [gists, setGists] = useState<GistInfo[] | null>(null);
  const [choice, setChoice] = useState<{ id: string; remote: TripDoc | null } | null>(null);
  const localHasTrip = doc.updatedAt > 0 && (doc.stays.length + doc.flights.length + doc.items.length + Object.keys(doc.days).length > 0);
  const run = async (f: () => Promise<unknown>) => { setBusy(true); setErr(''); try { await f(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); } };

  useEffect(() => { if (sync.token && !sync.gistId && gists === null) run(async () => setGists(await sync.list())); }, [sync.token, sync.gistId]); // eslint-disable-line

  // 1. No token yet
  if (!sync.token) return (
    <div className="sync-setup">
      <p className="small">Keep this trip in step between your phone and laptop. It’s saved in a <b>secret Gist</b> (a private-ish file) on your GitHub account.</p>
      <ol className="small steps">
        <li>On GitHub, <a href={TOKEN_URL} target="_blank" rel="noreferrer">create a token (classic)</a> with only the <b>gist</b> box ticked. Set an expiry date that covers your trip.</li>
        <li>Copy the token (starts with <code>ghp_</code>) and paste it here. It stays on this device only.</li>
      </ol>
      <form className="row gap" onSubmit={(e) => { e.preventDefault(); run(async () => { await sync.connect(token); setToken(''); }); }}>
        <input className="grow" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your GitHub token" aria-label="GitHub token" />
        <button className="btn primary" disabled={!token.trim() || busy}>{busy ? 'Checking…' : 'Connect'}</button>
      </form>
      {err && <div className="alert bad small">{err}</div>}
      <p className="muted small">Step-by-step help: <a href={README} target="_blank" rel="noreferrer">README, “Syncing your phone and laptop”</a>.</p>
    </div>
  );

  // 2. Token, but no Gist chosen
  if (!sync.gistId) return (
    <div className="sync-setup">
      <p className="small">Connected as <b>{sync.login}</b>. Now choose where to keep the trip.</p>
      {gists === null ? <p className="muted small">Looking for existing trips…</p> : gists.length > 0 && (<>
        <p className="small">Trips already in your Gists (use the same one on every device):</p>
        <div className="pick-list">
          {gists.map((g) => (
            <button key={g.id} className="pick" disabled={busy} onClick={() => run(async () => {
              const remote = await sync.peek(g.id);
              if (remote && localHasTrip) setChoice({ id: g.id, remote });
              else await sync.useGist(g.id, remote ? 'gist' : 'device');
            })}>
              <span className="grow">{g.description || 'Trip Planner'} <span className="muted small">· updated {new Date(g.updatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</span></span>
              <span className="muted small">Use</span>
            </button>
          ))}
        </div>
      </>)}
      <div className="row gap wrap">
        <button className="btn primary" disabled={busy} onClick={() => run(sync.create)}>Create a new secret Gist{localHasTrip ? ' with this trip' : ''}</button>
        <button className="btn ghost" onClick={sync.disconnect}>Use a different token</button>
      </div>
      {choice && (
        <div className="alert warn">
          <b>Both have a trip. Which one should both devices use?</b>
          <div className="small">On GitHub: {choice.remote ? summary(choice.remote) : 'empty'}<br />On this device: {summary(doc)}</div>
          <div className="row gap wrap">
            <button className="btn" disabled={busy} onClick={() => run(async () => { await sync.useGist(choice.id, 'gist'); setChoice(null); })}>Use the one on GitHub</button>
            <button className="btn" disabled={busy} onClick={() => run(async () => { await sync.useGist(choice.id, 'device'); setChoice(null); })}>Use this device’s</button>
            <button className="btn ghost" onClick={() => setChoice(null)}>Cancel</button>
          </div>
          <p className="muted small">Not sure? Download a backup below first.</p>
        </div>
      )}
      {err && <div className="alert bad small">{err}</div>}
    </div>
  );

  // 3. Syncing
  const [label, tone] = SYNC_LABEL[sync.status];
  return (
    <div className="sync-setup">
      <p className="small"><span className={'sync-dot ' + tone} /> <b>{label}</b>{sync.message ? <span className="muted"> · {sync.message}</span> : null}</p>
      <p className="muted small">Connected as {sync.login} · Gist <a href={`https://gist.github.com/${sync.gistId}`} target="_blank" rel="noreferrer">{sync.gistId?.slice(0, 8)}…</a></p>
      {sync.status === 'auth' && <p className="alert bad small">The token was refused (expired or deleted). Disconnect, then connect with a new token; your trip stays on this device.</p>}
      <div className="row gap wrap">
        <button className="btn" onClick={() => sync.syncNow()}>Sync now</button>
        <ConfirmDel label="Disconnect this device" onDelete={sync.disconnect} />
      </div>
      <p className="muted small">Disconnecting forgets the token on this device only. The trip stays here and in the Gist.</p>
    </div>
  );
}
