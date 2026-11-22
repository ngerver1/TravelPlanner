import { describe, it, expect } from 'vitest';
import { decide, isDirty } from './decide';

describe('sync decisions', () => {
  it('does nothing when both sides are the same and nothing changed here', () => {
    expect(decide(3, 3, false)).toBe('noop');
  });
  it('saves local changes when the Gist has not moved on', () => {
    expect(decide(3, 3, true)).toBe('push');
  });
  it('takes the Gist copy when it moved on and nothing changed here', () => {
    expect(decide(3, 5, false)).toBe('pull');
    expect(decide(0, 1, false)).toBe('pull'); // fresh device
  });
  it('raises a conflict when both changed (never overwrites silently)', () => {
    expect(decide(3, 4, true)).toBe('conflict');
    expect(decide(5, 4, true)).toBe('conflict'); // Gist went backwards (restored elsewhere)
  });
  it('dirty means edited since the last sync', () => {
    expect(isDirty({ updatedAt: 10 }, 10)).toBe(false);
    expect(isDirty({ updatedAt: 11 }, 10)).toBe(true);
    expect(isDirty({ updatedAt: 0 }, null)).toBe(false); // untouched empty trip
    expect(isDirty({ updatedAt: 5 }, null)).toBe(true);
  });
});
