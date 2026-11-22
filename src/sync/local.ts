// Local copy of the trip in this browser. Every change is written here immediately.
import { normalizeDoc } from '../domain/normalize';
import type { TripDoc } from '../domain/types';

const KEY = 'tripPlanner.v2.doc';

export function loadLocal(): TripDoc | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? normalizeDoc(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

/** Returns false if the browser refused (storage full or blocked). */
export function saveLocal(doc: TripDoc): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}
