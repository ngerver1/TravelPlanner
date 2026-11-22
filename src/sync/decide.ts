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
