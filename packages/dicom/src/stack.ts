import type { InstanceHeader } from "./header.js";
import { sliceKey } from "./series.js";

/** What the second image axis of a series is (GEN-021, GEN-231). */
export type StackAxis = "none" | "dynamic" | "echo" | "volume";

export interface StackPoint {
  /** Seconds from the first dynamic (dynamic series). */
  timeS?: number;
  bValue?: number;
  echoTimeMs?: number;
}

export interface StackLayout {
  axis: StackAxis;
  /** Slice positions along the slice normal in mm, ascending. */
  slicePositions: number[];
  points: StackPoint[];
  /** SOP Instance UIDs by [slice][point]; null where the acquisition has a gap. */
  grid: (string | null)[][];
}

const num = (v: number | undefined): number => v ?? Number.POSITIVE_INFINITY;

/** Acquisition order of the images at one slice position, per axis kind. */
function pointOrder(axis: StackAxis): (a: InstanceHeader, b: InstanceHeader) => number {
  const by = (...keys: ((h: InstanceHeader) => number | undefined)[]) => (a: InstanceHeader, b: InstanceHeader) => {
    for (const k of keys) {
      const d = num(k(a)) - num(k(b));
      if (d !== 0 && Number.isFinite(d)) return d;
    }
    return 0;
  };
  if (axis === "echo") return by((h) => h.echoNumber, (h) => h.echoTime, (h) => h.instanceNumber);
  if (axis === "volume") return by((h) => h.acquisitionNumber, (h) => h.instanceNumber);
  return by((h) => h.temporalPosition, (h) => h.acquisitionNumber, (h) => h.triggerTime, (h) => h.instanceNumber);
}

/**
 * Arranges a series into slices × points for the viewer (GEN-020, GEN-021). `axis` comes from the
 * series facts: diffusion → volume, ≥ 2 echoes → echo, ≥ 2 dynamics → dynamic, else none.
 */
export function stackLayout(instances: readonly InstanceHeader[], axis: StackAxis): StackLayout {
  const bySlice = new Map<string, InstanceHeader[]>();
  for (const h of instances) {
    const key = sliceKey(h);
    const list = bySlice.get(key);
    if (list) list.push(h);
    else bySlice.set(key, [h]);
  }
  const slices = [...bySlice.entries()].sort(([a], [b]) => Number(a) - Number(b) || a.localeCompare(b));
  const order = pointOrder(axis);
  const columns = slices.map(([, list]) => (axis === "none" ? list.slice(0, 1) : [...list].sort(order)));
  const nPoints = Math.max(1, ...columns.map((c) => c.length));
  const grid = columns.map((c) => Array.from({ length: nPoints }, (_, i) => c[i]?.sopInstanceUid ?? null));

  // Point descriptions come from the most complete slice.
  const ref = columns.reduce((best, c) => (c.length > best.length ? c : best), columns[0] ?? []);
  const t0 = ref[0]?.triggerTime;
  const points: StackPoint[] = Array.from({ length: nPoints }, (_, i) => {
    const h = ref[i];
    if (!h) return {};
    if (axis === "dynamic" && h.triggerTime !== undefined && t0 !== undefined) return { timeS: (h.triggerTime - t0) / 1000 };
    if (axis === "volume" && h.bValue !== undefined) return { bValue: h.bValue };
    if (axis === "echo" && h.echoTime !== undefined) return { echoTimeMs: h.echoTime };
    return {};
  });
  return { axis, slicePositions: slices.map(([k]) => Number(k)), points, grid };
}
