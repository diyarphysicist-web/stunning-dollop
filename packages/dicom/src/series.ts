import type { SeriesType } from "@neuromr/contracts";
import { expandFrames, type InstanceHeader } from "./header.js";
import { classify } from "./classify.js";

/** Per-series facts derived from its instances (ALGORITHMS.md §13, aggregation step). */
export interface SeriesFacts {
  sopClassUid: string;
  imageType: string[];
  scanningSequence: string[];
  /** Lower-case words of Series Description and Protocol Name, split at non-alphanumerics. */
  words: string[];
  echoTime: number | undefined;
  repetitionTime: number | undefined;
  inversionTime: number | undefined;
  flipAngle: number | undefined;
  contrastAgent: boolean;
  /** Images including frames of multi-frame instances. */
  imageCount: number;
  slices: number;
  rows: number;
  columns: number;
  /** Distinct time points; 1 for a static series. */
  dynamics: number;
  bValues: number[];
  gradientDirections: number;
  echoes: number;
  /** Voxels of a spectroscopy object (rows × columns × frames). */
  spectroscopyVoxels: number;
  hasGeometry: boolean;
  /** Some instances are stored with lossy compression (GEN-239). */
  lossy: boolean;
}

export interface SeriesDescription {
  facts: SeriesFacts;
  types: SeriesType[];
}

const distinct = <T>(values: readonly (T | undefined)[]): T[] => [...new Set(values.filter((v): v is T => v !== undefined))];

function median(values: readonly (number | undefined)[]): number | undefined {
  const v = values.filter((x): x is number => x !== undefined).sort((a, b) => a - b);
  if (v.length === 0) return undefined;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : ((v[mid - 1] as number) + (v[mid] as number)) / 2;
}

/** Slice position key: the position projected on the slice normal, rounded to 0.01 mm (sorts numerically). */
export function sliceKey(h: InstanceHeader): string {
  const p = h.imagePosition;
  const o = h.imageOrientation;
  if (p && o) {
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = o;
    const normal = [b * f - c * e, c * d - a * f, a * e - b * d] as const;
    return (p[0] * normal[0] + p[1] * normal[1] + p[2] * normal[2]).toFixed(2);
  }
  return p ? p.map((x) => x.toFixed(2)).join(",") : `#${h.instanceNumber ?? 0}`;
}

/** A gradient direction as a line: unit length, sign fixed so the first non-zero component is positive. */
function directionKey(g: readonly [number, number, number]): string | undefined {
  const len = Math.hypot(...g);
  if (len < 0.5) return undefined;
  let u = g.map((x) => x / len);
  const first = u.find((x) => Math.abs(x) > 1e-3) ?? 1;
  if (first < 0) u = u.map((x) => -x);
  return u.map((x) => (Math.abs(x) < 5e-4 ? 0 : x).toFixed(3)).join(",");
}

function words(...texts: string[]): string[] {
  return texts.flatMap((t) => t.toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean);
}

/** Aggregates the instances of one series and classifies it. `instances` must be non-empty. */
export function describeSeries(headers: readonly InstanceHeader[]): SeriesDescription {
  // Multi-frame instances count as their frames (GEN-240).
  const instances = headers.flatMap(expandFrames);
  const first = instances[0];
  if (!first) throw new RangeError("describeSeries needs at least one instance");

  const bySlice = new Map<string, InstanceHeader[]>();
  for (const h of instances) {
    const key = sliceKey(h);
    const list = bySlice.get(key);
    if (list) list.push(h);
    else bySlice.set(key, [h]);
  }
  const perSlice = Math.min(...[...bySlice.values()].map((l) => l.length));
  const sample = [...bySlice.values()][0] ?? [];

  const bValues = distinct(instances.map((h) => (h.bValue === undefined ? undefined : Math.round(h.bValue)))).sort((a, b) => a - b);
  const diffusionWeighted = bValues.some((b) => b > 0);
  const directions = distinct(instances.map((h) => ((h.bValue ?? 0) > 0 && h.gradient ? directionKey(h.gradient) : undefined)));

  const echoNumbers = distinct(sample.map((h) => h.echoNumber));
  const echoTimes = distinct(sample.map((h) => h.echoTime));
  const echoes = diffusionWeighted ? 1 : Math.max(1, echoNumbers.length > 1 ? echoNumbers.length : echoTimes.length);

  let dynamics = 1;
  if (!diffusionWeighted && echoes < 2) {
    const temporal = distinct(instances.map((h) => h.temporalPosition));
    if (temporal.length >= 2) dynamics = temporal.length;
    else if (perSlice >= 2) {
      const acq = distinct(sample.map((h) => h.acquisitionNumber)).length;
      const trig = distinct(sample.map((h) => h.triggerTime)).length;
      if (acq >= 2 || trig >= 2) dynamics = perSlice;
    }
  }

  const imageCount = instances.reduce((n, h) => n + Math.max(1, h.numberOfFrames), 0);
  const facts: SeriesFacts = {
    sopClassUid: first.sopClassUid,
    imageType: first.imageType,
    scanningSequence: first.scanningSequence,
    words: words(first.seriesDescription, first.protocolName),
    echoTime: median(instances.map((h) => h.echoTime)),
    repetitionTime: median(instances.map((h) => h.repetitionTime)),
    inversionTime: median(instances.map((h) => h.inversionTime)),
    flipAngle: median(instances.map((h) => h.flipAngle)),
    contrastAgent: instances.some((h) => h.contrastAgent !== ""),
    imageCount,
    slices: first.numberOfFrames > 1 && instances.length === 1 ? first.numberOfFrames : bySlice.size,
    rows: first.rows,
    columns: first.columns,
    dynamics,
    bValues,
    gradientDirections: directions.length,
    echoes,
    spectroscopyVoxels: first.rows * first.columns * Math.max(1, first.numberOfFrames),
    hasGeometry: instances.every((h) => h.imagePosition !== undefined && h.imageOrientation !== undefined && h.pixelSpacing !== undefined),
    lossy: instances.some((h) => h.lossy === true),
  };
  return { facts, types: classify(facts) };
}
