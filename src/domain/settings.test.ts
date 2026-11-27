import { describe, expect, it } from 'vitest';
import { emptyDoc, exportJson, normalizeDoc } from './normalize';

const KEY = 'AIzaSyTEST_key_for_checks_only_123456';
describe('Google Maps key saved with the trip', () => {
  it('is kept when it looks like a Google key, dropped otherwise', () => {
    expect(normalizeDoc({ settings: { googleMapsKey: ` ${KEY} ` } }).settings).toEqual({ googleMapsKey: KEY });
    expect(normalizeDoc({ settings: { googleMapsKey: 'ghp_notAGoogleKey1234567890abcdef' } }).settings).toBeUndefined();
    expect(normalizeDoc({ settings: { googleMapsKey: KEY, githubToken: 'ghp_x', other: 1 } }).settings).toEqual({ googleMapsKey: KEY });
    expect(normalizeDoc({ trip: { name: 'Old trip' } })).not.toHaveProperty('settings');
  });
  it('exports leave it out unless asked', () => {
    const doc = { ...emptyDoc(), settings: { googleMapsKey: KEY } };
    expect(exportJson(doc)).not.toContain('AIza');
    expect(JSON.parse(exportJson(doc))).not.toHaveProperty('settings');
    expect(exportJson(doc, true)).toContain(KEY);
    expect(normalizeDoc(JSON.parse(exportJson(doc, true))).settings?.googleMapsKey).toBe(KEY); // re-import keeps it
    expect(exportJson(emptyDoc())).toBe(JSON.stringify(emptyDoc(), null, 2));
  });
});
