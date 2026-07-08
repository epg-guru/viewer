import type { EpgIndex } from './xmltv/types';

// Validated dark-mode categorical 8-hue set (dataviz skill's reference
// palette, references/palette.md) — chosen for CVD-safe adjacency and
// ≥3:1 contrast against a #1a1a19-class dark surface, which matches this
// app's #1a1b1e background closely enough to reuse directly.
export const CATEGORY_PALETTE = [
  '#3987e5', // blue
  '#199e70', // aqua
  '#c98500', // yellow
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
  '#d55181', // magenta
  '#d95926', // orange
] as const;

// A 9th+ unique category doesn't get a generated hue (that would break the
// palette's CVD guarantees) — it folds into this neutral instead.
export const CATEGORY_FALLBACK_COLOR = 'var(--mantine-color-dark-4)';

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const [, r, g, b] = m;
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
}

export interface CategoryColorMap {
  colorFor(category: string | undefined): string;
}

/**
 * Builds a single global category→color map from the *entire* loaded
 * index, in first-seen order. Must run once over the whole dataset rather
 * than being assigned lazily during virtualized rendering — otherwise the
 * same category could get a different color depending on scroll history.
 */
export function buildCategoryColorMap(index: EpgIndex): CategoryColorMap {
  const assigned = new Map<string, string>();

  for (const list of index.programmesByChannel.values()) {
    for (const programme of list) {
      const category = programme.category;
      if (!category || assigned.has(category)) continue;
      if (assigned.size >= CATEGORY_PALETTE.length) continue;
      assigned.set(category, CATEGORY_PALETTE[assigned.size]);
    }
  }

  return {
    colorFor(category) {
      if (!category) return CATEGORY_FALLBACK_COLOR;
      return assigned.get(category) ?? CATEGORY_FALLBACK_COLOR;
    },
  };
}
