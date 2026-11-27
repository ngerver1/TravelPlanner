// Keeps this device's trip in step with a secret Gist.
// - Every change is already in localStorage (store.ts); ~2 s after the last edit it is saved to the Gist.
// - Before saving, the Gist is checked: if another device saved since, that's a conflict and nothing is overwritten.
// - On open, on focus and when back online, the Gist is checked (ETag: unchanged = cheap 304).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TripDoc } from '../domain/types';
import { decide, isDirty } from './decide';
import { SyncError, createGist, readGist, writeGist, checkToken, listTripGists, updateInbox, type GistInfo } from './gist';
import type { InboxEntry } from '../domain/inbox';

export type SyncStatus = 'local' | 'saved' | 'saving' | 'offline' | 'conflict' | 'auth' | 'error';

const TOKEN = 'tripPlanner.gh.token';
const META = 'tripPlanner.gh.sync';
const INBOX_KEY = 'tripPlanner.gh.inbox';
interface Meta { gistId: string | null; etag: string | null; remoteRev: number | null; syncedAt: number | null; login?: string }
const EMPTY: Meta = { gistId: null, etag: null, remoteRev: null, syncedAt: null };

const ls = {
  get: <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; } },
  set: (k: string, v: unknown) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};

const DEBOUNCE = 2000;

export function useSync({ doc, load, setRev }: { doc: TripDoc; load: (d: TripDoc) => void; setRev: (rev: number) => void }) {
  const [token, setTokenState] = useState<string | null>(() => ls.get<string | null>(TOKEN, null));
  const [meta, setMetaState] = useState<Meta>(() => ({ ...EMPTY, ...ls.get<Partial<Meta>>(META, {}) }));
  const [status, setStatus] = useState<SyncStatus>(token && meta.gistId ? 'saving' : 'local');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState<{ remote: TripDoc } | null>(null);
  /** Bookings from forwarded emails, waiting for review (inbox.json in the Gist). */
  // Kept on the device too, so it's there when the app is opened offline.
  const [inbox, setInboxState] = useState<InboxEntry[]>(() => ls.get<InboxEntry[]>(INBOX_KEY, []));
  const setInbox = useCallback((v: InboxEntry[] | ((cur: InboxEntry[]) => InboxEntry[])) => setInboxState((cur) => {
    const next = typeof v === 'function' ? v(cur) : v;
    ls.set(INBOX_KEY, next.length ? next : null);
    return next;
  }), []);

  const docRef = useRef(doc); docRef.current = doc;
  const metaRef = useRef(meta); metaRef.current = meta;
  const tokenRef = useRef(token); tokenRef.current = token;
  const conflictRef = useRef(conflict); conflictRef.current = conflict;
  const setMeta = useCallback((m: Partial<Meta>) => {
    const next = { ...metaRef.current, ...m };
    metaRef.current = next; setMetaState(next); ls.set(META, next);
  }, []);

  // One sync job at a time; a request made while busy runs once the current one finishes.
  const busy = useRef(false);
  const again = useRef(false);
  const fail = (e: unknown) => {
    const err = e instanceof SyncError ? e : new SyncError('other', String(e));
    setMessage(err.message);
    setStatus(err.kind === 'offline' ? 'offline' : err.kind === 'auth' ? 'auth' : 'error');
  };

  const sync = useCallback(async () => {
    const t = tokenRef.current, id = metaRef.current.gistId;
    if (!t || !id) { setStatus('local'); return; }
    if (conflictRef.current) { setStatus('conflict'); return; }
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    try {
      do {
        again.current = false;
        const m = metaRef.current;
        let got = await readGist(t, id, m.remoteRev != null ? m.etag : null);
        if (got.notModified && m.remoteRev == null) got = await readGist(t, id, null);
        let remote: TripDoc | null = null, remoteRev: number;
        if (got.notModified) remoteRev = m.remoteRev!;
        else {
          remote = got.doc;
          remoteRev = remote?.rev ?? 0;
          setInbox(got.inbox);
          setMeta({ etag: got.etag, remoteRev });
        }
        const local = docRef.current;
        const dirty = isDirty(local, metaRef.current.syncedAt);
        // An empty Gist (just created elsewhere, or emptied) takes this device's trip.
        const action = remote === null && !got.notModified ? (dirty || local.updatedAt > 0 ? 'push' : 'noop') : decide(local.rev, remoteRev, dirty);
        if (action === 'conflict') {
          if (!remote) { const full = await readGist(t, id, null); remote = full.notModified ? null : full.doc; }
          if (remote) { setConflict({ remote }); setStatus('conflict'); return; }
        }
        if (action === 'pull' && remote) {
          load(remote);
          setMeta({ syncedAt: remote.updatedAt, remoteRev: remote.rev });
        } else if (action === 'pull' && !remote) {
          // 304 but our rev differs: fetch the body to pull it.
          const full = await readGist(t, id, null);
          if (!full.notModified && full.doc) { load(full.doc); setMeta({ etag: full.etag, remoteRev: full.doc.rev, syncedAt: full.doc.updatedAt }); }
        } else if (action === 'push') {
          setStatus('saving');
          const snapshot = docRef.current;
          const rev = Math.max(remoteRev, snapshot.rev) + 1;
          await writeGist(t, id, { ...snapshot, rev });
          setRev(rev);
          setMeta({ remoteRev: rev, etag: null, syncedAt: snapshot.updatedAt });
        }
        setMessage('');
        setStatus(isDirty(docRef.current, metaRef.current.syncedAt) ? 'saving' : 'saved');
        if (isDirty(docRef.current, metaRef.current.syncedAt)) again.current = true;
      } while (again.current);
    } catch (e) {
      fail(e);
    } finally {
      busy.current = false;
    }
  }, [load, setMeta, setRev]);

  // Save ~2 s after the last edit.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!token || !meta.gistId || conflict) return;
    if (!isDirty(doc, metaRef.current.syncedAt)) return;
    setStatus((s) => (s === 'offline' || s === 'auth' || s === 'error' ? s : 'saving'));
    clearTimeout(timer.current);
    timer.current = setTimeout(sync, DEBOUNCE);
    return () => clearTimeout(timer.current);
  }, [doc, token, meta.gistId, conflict, sync]);

  // Check on open, on focus, when the tab becomes visible and when back online.
  useEffect(() => {
    if (!token || !meta.gistId) { setStatus('local'); return; }
    sync();
    const onFocus = () => { if (document.visibilityState === 'visible') sync(); };
    const onOffline = () => setStatus((s) => (s === 'conflict' || s === 'auth' ? s : 'offline'));
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('online', onFocus); window.removeEventListener('offline', onOffline); document.removeEventListener('visibilitychange', onFocus); };
  }, [token, meta.gistId, sync]);

  // ---------- conflict ----------
  const resolve = useCallback(async (choice: 'mine' | 'theirs') => {
    const c = conflictRef.current, t = tokenRef.current, id = metaRef.current.gistId;
    if (!c || !t || !id) return;
    try {
      if (choice === 'theirs') {
        load(c.remote);
        setMeta({ syncedAt: c.remote.updatedAt, remoteRev: c.remote.rev, etag: null });
      } else {
        setStatus('saving');
        const snapshot = docRef.current;
        const rev = Math.max(c.remote.rev, snapshot.rev) + 1;
        await writeGist(t, id, { ...snapshot, rev });
        setRev(rev);
        setMeta({ remoteRev: rev, etag: null, syncedAt: snapshot.updatedAt });
      }
      conflictRef.current = null;
      setConflict(null);
      setStatus('saved');
      setMessage('');
    } catch (e) { fail(e); }
  }, [load, setMeta, setRev]);

  // ---------- setup (Settings) ----------
  const connect = useCallback(async (raw: string) => {
    const t = raw.trim();
    const user = await checkToken(t); // throws SyncError
    ls.set(TOKEN, t);
    setTokenState(t);
    tokenRef.current = t;
    setMeta({ login: user.login });
    return user;
  }, [setMeta]);

  const list = useCallback(async (): Promise<GistInfo[]> => (tokenRef.current ? listTripGists(tokenRef.current) : []), []);

  /** Link to an existing Gist. `keep`: whose trip wins if both have one. */
  const useGist = useCallback(async (id: string, keep: 'gist' | 'device') => {
    const t = tokenRef.current;
    if (!t) return;
    const got = await readGist(t, id, null);
    const remote = got.notModified ? null : got.doc;
    if (keep === 'gist' && remote) {
      load(remote);
      setMeta({ gistId: id, etag: got.notModified ? null : got.etag, remoteRev: remote.rev, syncedAt: remote.updatedAt });
    } else {
      const rev = Math.max(remote?.rev ?? 0, docRef.current.rev) + 1;
      const snapshot = docRef.current;
      await writeGist(t, id, { ...snapshot, rev });
      setRev(rev);
      setMeta({ gistId: id, etag: null, remoteRev: rev, syncedAt: snapshot.updatedAt });
    }
    conflictRef.current = null; setConflict(null);
    setStatus('saved'); setMessage('');
  }, [load, setMeta, setRev]);

  const peek = useCallback(async (id: string) => {
    const t = tokenRef.current;
    if (!t) return null;
    const got = await readGist(t, id, null);
    return got.notModified ? null : got.doc;
  }, []);

  const create = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    const snapshot = docRef.current;
    const rev = snapshot.rev + 1;
    const g = await createGist(t, { ...snapshot, rev });
    setRev(rev);
    setMeta({ gistId: g.id, etag: null, remoteRev: rev, syncedAt: snapshot.updatedAt });
    setStatus('saved'); setMessage('');
  }, [setMeta, setRev]);

  /** Forget the token and Gist on this device. The trip stays on the device. */
  const disconnect = useCallback(() => {
    ls.set(TOKEN, null); ls.set(META, null);
    setTokenState(null); tokenRef.current = null;
    metaRef.current = EMPTY; setMetaState(EMPTY); setInbox([]);
    conflictRef.current = null; setConflict(null);
    setStatus('local'); setMessage('');
  }, []);

  /** Change the inbox in the Gist (after Add / Update / Dismiss). */
  const changeInbox = useCallback(async (change: (entries: InboxEntry[]) => InboxEntry[]) => {
    const t = tokenRef.current, id = metaRef.current.gistId;
    if (!t || !id) return;
    setInbox((cur) => change(cur)); // show it straight away
    try { setInbox(await updateInbox(t, id, change)); setMeta({ etag: null }); } catch (e) { fail(e); }
  }, [setMeta]);

  return {
    status, message, conflict, resolve, syncNow: sync, inbox, changeInbox,
    token, login: meta.login, gistId: meta.gistId,
    connect, list, useGist, peek, create, disconnect,
  };
}
export type Sync = ReturnType<typeof useSync>;
