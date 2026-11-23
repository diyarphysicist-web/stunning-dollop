/** A display window as a value range. */
export interface VoiRange {
  lower: number;
  upper: number;
}

/**
 * Initial window of a series (GEN-232): the recorded Window Center/Width when present, otherwise the
 * 1st–99th percentile of the given image's values.
 */
export function initialWindow(values: ArrayLike<number>, center: number | null, width: number | null): VoiRange {
  if (center !== null && width !== null && width > 0) return { lower: center - width / 2, upper: center + width / 2 };
  const sorted = Float64Array.from(values).sort();
  if (sorted.length === 0) return { lower: 0, upper: 1 };
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] as number;
  const lower = at(0.01);
  const upper = at(0.99);
  return upper > lower ? { lower, upper } : { lower, upper: lower + 1 };
}

/** Window/Level drag (GEN-010): horizontal changes the width, vertical the level, scaled to the width. */
export function dragWindow(r: VoiRange, dx: number, dy: number): VoiRange {
  const width = r.upper - r.lower;
  const step = Math.max(Math.abs(width), 1) / 256;
  const w = Math.max(width + dx * step, 1e-6);
  const c = (r.upper + r.lower) / 2 + dy * step;
  return { lower: c - w / 2, upper: c + w / 2 };
}
