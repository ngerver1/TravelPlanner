// Location colours, ported from v1: assigned in trip order, hash-seeded, probing to avoid clashes.

export interface Swatch { bg: string; border: string; fg: string; solid: string }

export const HUES = [212, 348, 152, 28, 268, 188, 4, 96, 300, 46, 236, 168, 322, 128];
export const NEUTRAL: Swatch = { bg: '#eef1f5', border: '#cfd6e0', fg: '#475467', solid: '#98a2b3' };

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function swatch(h: number): Swatch {
  return {
    bg: `hsl(${h} 75% 94%)`,
    border: `hsl(${h} 50% 78%)`,
    fg: `hsl(${h} 55% 30%)`,
    solid: `hsl(${h} 58% 52%)`,
  };
}
export const isAirport = (s: string | null | undefined) => /^[A-Z]{3}$/.test((s || '').trim());

/**
 * Assign a hue index to each key (in the given order). `seed` is the string hashed for the
 * starting hue (the normalised name, so colours match v1); `fixed` pins an index.
 */
export function assignHues(entries: { key: string; seed: string; fixed?: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const used = new Set<number>();
  for (const e of entries) {
    if (e.fixed != null && e.fixed >= 0) {
      out.set(e.key, e.fixed % HUES.length);
      used.add(e.fixed % HUES.length);
    }
  }
  for (const e of entries) {
    if (out.has(e.key)) continue;
    let idx = hash(e.seed) % HUES.length;
    for (let p = 0; p < HUES.length && used.has(idx); p++) idx = (idx + 1) % HUES.length;
    used.add(idx);
    if (used.size >= HUES.length) used.clear();
    out.set(e.key, idx);
  }
  return out;
}
