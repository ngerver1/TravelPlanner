// Minimal GitHub Gist client. The token is sent only in the Authorization header to api.github.com:
// never in a URL, never logged.
import { readTripFile } from '../domain/migrate';
import type { TripDoc } from '../domain/types';

const API = 'https://api.github.com';
export const FILE = 'trip.json';

export class SyncError extends Error {
  constructor(public kind: 'offline' | 'auth' | 'notfound' | 'other', message: string) { super(message); }
}

async function call(token: string, path: string, init: RequestInit & { etag?: string | null } = {}): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
  };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (init.etag) headers['If-None-Match'] = init.etag;
  let res: Response;
  try {
    res = await fetch(API + path, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new SyncError('offline', 'Can’t reach GitHub');
  }
  if (res.status === 401) throw new SyncError('auth', 'GitHub didn’t accept the token');
  if (res.status === 404) throw new SyncError('notfound', 'Gist not found (deleted, or the token can’t see it)');
  if (res.status === 403 || res.status === 429) throw new SyncError('other', 'GitHub is limiting requests; try again in a minute');
  if (!res.ok && res.status !== 304) throw new SyncError('other', `GitHub error ${res.status}`);
  return res;
}

export interface GistUser { login: string; scopes: string[] | null }
export async function checkToken(token: string): Promise<GistUser> {
  const res = await call(token, '/user');
  const body = await res.json();
  const sc = res.headers.get('x-oauth-scopes');
  return { login: body.login, scopes: sc == null ? null : sc.split(',').map((s) => s.trim()).filter(Boolean) };
}

export interface GistInfo { id: string; description: string; updatedAt: string; url: string }
export async function listTripGists(token: string): Promise<GistInfo[]> {
  const out: GistInfo[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await call(token, `/gists?per_page=100&page=${page}`);
    const list = (await res.json()) as { id: string; description: string | null; updated_at: string; html_url: string; files: Record<string, unknown> }[];
    for (const g of list) if (g.files && FILE in g.files) out.push({ id: g.id, description: g.description || '', updatedAt: g.updated_at, url: g.html_url });
    if (list.length < 100) break;
  }
  return out;
}

export type Fetched = { notModified: true } | { notModified: false; doc: TripDoc | null; etag: string | null };

/** Read the trip from a Gist. With an etag, an unchanged Gist answers 304 (cheap). */
export async function readGist(token: string, id: string, etag?: string | null): Promise<Fetched> {
  const res = await call(token, `/gists/${encodeURIComponent(id)}`, { etag });
  if (res.status === 304) return { notModified: true };
  const body = await res.json();
  const f = body.files?.[FILE] as { content?: string; truncated?: boolean; raw_url?: string } | undefined;
  const newEtag = res.headers.get('etag');
  if (!f) return { notModified: false, doc: null, etag: newEtag };
  let text = f.content ?? '';
  if (f.truncated && f.raw_url) {
    // Large files are cut short in the API response; the full text is at raw_url.
    try { text = await (await fetch(f.raw_url, { cache: 'no-store' })).text(); }
    catch { throw new SyncError('offline', 'Can’t reach GitHub'); }
  }
  if (!text.trim()) return { notModified: false, doc: null, etag: newEtag };
  try {
    return { notModified: false, doc: readTripFile(JSON.parse(text)).doc, etag: newEtag };
  } catch {
    throw new SyncError('other', 'The Gist’s trip.json isn’t a trip file');
  }
}

export async function writeGist(token: string, id: string, doc: TripDoc): Promise<void> {
  await call(token, `/gists/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(doc, null, 1) } } }) });
}

export async function createGist(token: string, doc: TripDoc): Promise<GistInfo> {
  const res = await call(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({ description: 'Trip Planner', public: false, files: { [FILE]: { content: JSON.stringify(doc, null, 1) } } }),
  });
  const g = await res.json();
  return { id: g.id, description: g.description || '', updatedAt: g.updated_at, url: g.html_url };
}
