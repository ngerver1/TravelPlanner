// What to do when this device's copy and the Gist's copy are compared.
// `rev` counts saves to the Gist; a device's doc carries the rev it was last in step with.
// `dirty` = this device has changes the Gist hasn't got yet.

export type SyncAction = 'noop' | 'push' | 'pull' | 'conflict';

export function decide(localRev: number, remoteRev: number, dirty: boolean): SyncAction {
  if (remoteRev === localRev) return dirty ? 'push' : 'noop';
  return dirty ? 'conflict' : 'pull';
}

/** Has this doc changed since it was last in step with the Gist? */
export const isDirty = (doc: { updatedAt: number }, syncedAt: number | null) => syncedAt == null ? doc.updatedAt > 0 : doc.updatedAt > syncedAt;

/**
 * After an app update: an older version may have read the trip and dropped parts it didn't know about (like
 * the Google Maps key in `settings`) while still counting itself in step with that save. Given the Gist's copy
 * of the same save, put those parts back. Returns the same object when there's nothing to restore.
 */
export function restoreDropped<T extends { rev: number }>(local: T, remote: T | null): T {
  if (!remote || remote.rev !== local.rev) return local;
  const l = local as Record<string, unknown>, r = remote as Record<string, unknown>;
  const empty = (v: unknown) => v === undefined || (Array.isArray(v) && v.length === 0);
  const back: Record<string, unknown> = {};
  for (const k of ['settings', 'tasks']) if (empty(l[k]) && !empty(r[k])) back[k] = r[k];
  return Object.keys(back).length ? { ...local, ...back } : local;
}
