import { norm, uid } from './ids';
import type { TripDoc } from './types';

/** Find a location by name (case-insensitive) or create it. Mutates doc. Returns its id, or undefined for an empty name. */
export function ensureLocation(doc: TripDoc, name: string): string | undefined {
  const n = name.trim();
  if (!n) return undefined;
  const found = doc.locations.find((l) => norm(l.name) === norm(n));
  if (found) return found.id;
  const id = uid();
  doc.locations.push({ id, name: n });
  return id;
}

export const locationName = (doc: TripDoc, id: string | undefined) =>
  (id && doc.locations.find((l) => l.id === id)?.name) || '';
