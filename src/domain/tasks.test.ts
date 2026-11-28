import { describe, expect, it } from 'vitest';
import { emptyDoc, normalizeDoc } from './normalize';
import { restoreDropped } from '../sync/decide';
import { sortTasks } from '../components/Tasks';

describe('checklists', () => {
  it('old trips load with an empty checklist', () => {
    expect(normalizeDoc({ trip: { name: 'Old' } }).tasks).toEqual([]);
  });
  it('keeps valid to-dos: before-you-go (with an optional by-date) and per-day', () => {
    const d = normalizeDoc({ tasks: [
      { id: 'a', text: ' Buy JR Pass ', by: '2027-01-10' },
      { id: 'b', text: 'Buy Suica', date: '2027-01-24', done: true },
      { id: 'c', text: '   ' }, { text: 'No id' }, 'junk', { id: 'd', text: 'Both', date: '2027-01-25', by: '2027-01-01' },
    ] });
    expect(d.tasks).toEqual([
      { id: 'a', text: 'Buy JR Pass', by: '2027-01-10' },
      { id: 'b', text: 'Buy Suica', date: '2027-01-24', done: true },
      { id: expect.any(String), text: 'No id' },
      { id: 'd', text: 'Both', date: '2027-01-25' },
    ]);
  });
  it('lists not-done first, earliest by-date first, done last', () => {
    const t = sortTasks([{ id: '1', text: 'done', done: true }, { id: '2', text: 'no date' }, { id: '3', text: 'late', by: '2027-01-02' }, { id: '4', text: 'early', by: '2027-01-01' }]);
    expect(t.map((x) => x.text)).toEqual(['early', 'late', 'no date', 'done']);
  });
  it('sync recovers a checklist an older version dropped', () => {
    const remote = { ...emptyDoc(), rev: 4, tasks: [{ id: 'a', text: 'Buy JR Pass' }] };
    expect(restoreDropped({ ...emptyDoc(), rev: 4 }, remote).tasks).toEqual(remote.tasks);
    const mine = { ...emptyDoc(), rev: 4, tasks: [{ id: 'b', text: 'Mine' }] };
    expect(restoreDropped(mine, remote)).toBe(mine);
  });
});
