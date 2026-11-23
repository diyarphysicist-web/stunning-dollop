import type { ViewerStack } from "@neuromr/contracts";

/** System layouts (GEN-150): rows × columns. */
export const LAYOUTS = ["1x1", "1x2", "2x1", "2x2", "2x3", "3x3"] as const;
export type Layout = (typeof LAYOUTS)[number];

export function layoutSize(layout: Layout): { rows: number; columns: number } {
  const [r, c] = layout.split("x").map(Number) as [number, number];
  return { rows: r, columns: c };
}

export const cellCount = (layout: Layout): number => {
  const { rows, columns } = layoutSize(layout);
  return rows * columns;
};

/** The smallest system layout that shows `n` series side by side (GEN-230). */
export function layoutFor(n: number): Layout {
  return LAYOUTS.find((l) => cellCount(l) >= n) ?? "3x3";
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The image shown at (slice, point): that position, or the nearest acquired point at that slice. */
export function sopAt(stack: ViewerStack, slice: number, point: number): string | null {
  const row = stack.grid[slice];
  if (!row) return null;
  for (let d = 0; d < row.length; d++) {
    const hit = row[point - d] ?? row[point + d];
    if (hit) return hit;
  }
  return null;
}

/** Flattened image list for the stack viewport and the index of each (slice, point). */
export function flatten(stack: ViewerStack): { ids: string[]; index: Map<string, number> } {
  const ids: string[] = [];
  const index = new Map<string, number>();
  for (const row of stack.grid)
    for (const sop of row)
      if (sop && !index.has(sop)) {
        index.set(sop, ids.length);
        ids.push(sop);
      }
  return { ids, index };
}

export const middleSlice = (stack: ViewerStack): number => Math.max(0, (stack.grid.length - 1) >> 1);

/**
 * One drag step on the scroll tool (GEN-020, GEN-021): with one image axis horizontal moves the
 * slice; with two, vertical moves the slice and horizontal the second axis.
 */
export function scrollStep(stack: ViewerStack, dx: number, dy: number): { dSlice: number; dPoint: number } {
  if (stack.axis === "none" || (stack.grid[0]?.length ?? 1) <= 1) return { dSlice: dx + dy, dPoint: 0 };
  return { dSlice: dy, dPoint: dx };
}
