import type { SyncStatus } from '../sync/useSync';

export const SYNC_LABEL: Record<SyncStatus, [string, string]> = {
  local: ['On this device only', 'muted'],
  saved: ['Saved', 'good'],
  saving: ['Syncing…', 'muted'],
  offline: ['Offline · changes kept on this device', 'warn'],
  conflict: ['Conflict', 'bad'],
  auth: ['Token invalid', 'bad'],
  error: ['Sync problem', 'bad'],
};
const SHORT: Partial<Record<SyncStatus, string>> = { offline: 'Offline', local: 'This device' };

export function SyncChip({ status, onClick }: { status: SyncStatus; onClick: () => void }) {
  const [label, tone] = SYNC_LABEL[status];
  return (
    <button type="button" className={'sync-chip ' + tone} onClick={onClick} title={label}>
      <span className={'sync-dot ' + tone} aria-hidden="true" />
      <span className="long">{label}</span><span className="short">{SHORT[status] ?? label}</span>
    </button>
  );
}
