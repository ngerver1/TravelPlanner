// Location colours: a small palette of strongly different colours, handed out in trip order so
// neighbouring places never look alike. A location can pin one (colorIndex).

/** solid = stripes and dots; bg/border/fg = chips (a clear tint); wash = large pale backgrounds. */
export interface Swatch { bg: string; border: string; fg: string; solid: string; wash: string }

/** Hue and lightness of each palette colour, ordered so each contrasts with the one before. */
export const PALETTE: { h: number; s: number; l: number }[] = [
  { h: 214, s: 85, l: 50 }, // blue
  { h: 26, s: 95, l: 52 },  // orange
  { h: 145, s: 70, l: 38 }, // green
  { h: 328, s: 78, l: 52 }, // magenta
  { h: 46, s: 95, l: 46 },  // gold
  { h: 268, s: 68, l: 56 }, // purple
  { h: 184, s: 85, l: 36 }, // teal
  { h: 88, s: 65, l: 38 },  // olive
  { h: 22, s: 60, l: 38 },  // brown
  { h: 2, s: 80, l: 50 },   // red: last, as it's close to the "no stay" warnings
];
/** Colours offered in the picker (indices into PALETTE). */
export const PICKER = [0, 1, 2, 3, 4, 5, 6, 7];

// light-dark() picks the right value for the current colour scheme (light or dark mode).
export const NEUTRAL: Swatch = {
  bg: 'light-dark(#e8ecf1, #262c38)', border: 'light-dark(#c4ccd8, #3a4252)', fg: 'light-dark(#475467, #b8c0cc)', solid: '#98a2b3',
  wash: 'light-dark(#f2f4f7, #20252f)',
};

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function swatchAt(i: number): Swatch {
  const { h, s, l } = PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
  return {
    bg: `light-dark(hsl(${h} ${s}% 88%), hsl(${h} 40% 25%))`,
    border: `light-dark(hsl(${h} ${Math.round(s * 0.75)}% 68%), hsl(${h} 45% 42%))`,
    fg: `light-dark(hsl(${h} ${s}% 24%), hsl(${h} 80% 82%))`,
    solid: `hsl(${h} ${s}% ${l}%)`,
    wash: `light-dark(hsl(${h} ${s}% 95%), hsl(${h} 28% 18%))`,
  };
}
export const isAirport = (s: string | null | undefined) => /^[A-Z]{3}$/.test((s || '').trim());

/**
 * Give each key (in trip order) the next palette colour not already taken; pinned colours are kept.
 * Only when every colour is in use does it start again.
 */
export function assignColors(entries: { key: string; fixed?: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const used = new Set<number>();
  for (const e of entries)
    if (e.fixed != null && e.fixed >= 0) { const i = e.fixed % PALETTE.length; out.set(e.key, i); used.add(i); }
  let next = 0;
  for (const e of entries) {
    if (out.has(e.key)) continue;
    if (used.size >= PALETTE.length) used.clear();
    while (used.has(next % PALETTE.length)) next++;
    const i = next % PALETTE.length;
    out.set(e.key, i); used.add(i); next++;
  }
  return out;
}
