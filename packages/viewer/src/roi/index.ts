/**
 * ROI geometry and statistics (GEN-030…035, GEN-236). Image coordinates: x along columns, y along
 * rows, in pixels, with (0, 0) at the outer corner of the first pixel, so pixel (i, j) has its centre
 * at (i + 0.5, j + 0.5).
 */
export type Pt = readonly [number, number];

export type RoiShape =
  /** a: half-axis along `angle` (radians from +x), b: the other half-axis, both in pixels. */
  | { kind: "ellipse"; center: Pt; a: number; b: number; angle: number }
  /** Control points of a closed Catmull-Rom spline. */
  | { kind: "spline"; points: Pt[] }
  | { kind: "freehand"; points: Pt[] };

export interface Roi {
  id: string;
  name: string;
  /** Index into the ROI palette (GEN-035), in creation order. */
  color: number;
  /** Slice index of the series the ROI was drawn on (GEN-236). */
  slice: number;
  shape: RoiShape;
}

const SPLINE_STEPS = 12;

/** Ellipse from the GEN-030 clicks: the first two set the width, the third sets the height. */
export function ellipseFromClicks(p1: Pt, p2: Pt, p3: Pt): RoiShape {
  const center: Pt = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  // Distance of the third click from the line through the first two.
  const b = len === 0 ? Math.hypot(p3[0] - center[0], p3[1] - center[1]) : Math.abs(dx * (p3[1] - p1[1]) - dy * (p3[0] - p1[0])) / len;
  return { kind: "ellipse", center, a: len / 2, b, angle };
}

function catmullRom(points: readonly Pt[], steps = SPLINE_STEPS): Pt[] {
  const n = points.length;
  if (n < 3) return [...points];
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n] as Pt;
    const p1 = points[i] as Pt;
    const p2 = points[(i + 1) % n] as Pt;
    const p3 = points[(i + 2) % n] as Pt;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/** Closed outline of an ROI as a polygon (first point not repeated). */
export function outline(shape: RoiShape, segments = 72): Pt[] {
  if (shape.kind === "spline") return catmullRom(shape.points);
  if (shape.kind === "freehand") return [...shape.points];
  const { center, a, b, angle } = shape;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return Array.from({ length: segments }, (_, k) => {
    const t = (2 * Math.PI * k) / segments;
    const x = a * Math.cos(t);
    const y = b * Math.sin(t);
    return [center[0] + x * c - y * s, center[1] + x * s + y * c] as Pt;
  });
}

/** Row-major indices of the pixels whose centres lie inside the ROI (GEN-236). */
export function roiMask(shape: RoiShape, width: number, height: number): Uint32Array {
  const out: number[] = [];
  if (shape.kind === "ellipse") {
    const { center, a, b, angle } = shape;
    if (a <= 0 || b <= 0) return new Uint32Array();
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const r = Math.max(a, b);
    const j0 = Math.max(0, Math.floor(center[1] - r));
    const j1 = Math.min(height - 1, Math.ceil(center[1] + r));
    const i0 = Math.max(0, Math.floor(center[0] - r));
    const i1 = Math.min(width - 1, Math.ceil(center[0] + r));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - center[0];
        const dy = j + 0.5 - center[1];
        const u = (dx * c + dy * s) / a;
        const v = (-dx * s + dy * c) / b;
        if (u * u + v * v <= 1) out.push(j * width + i);
      }
    return Uint32Array.from(out);
  }
  const poly = outline(shape);
  if (poly.length < 3) return new Uint32Array();
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const p of poly) {
    ymin = Math.min(ymin, p[1]);
    ymax = Math.max(ymax, p[1]);
  }
  const j0 = Math.max(0, Math.floor(ymin - 0.5));
  const j1 = Math.min(height - 1, Math.ceil(ymax - 0.5));
  const xs: number[] = [];
  for (let j = j0; j <= j1; j++) {
    const y = j + 0.5;
    xs.length = 0;
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k] as Pt;
      const q = poly[(k + 1) % poly.length] as Pt;
      // Half-open rule so a vertex on the scan line is counted once.
      if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] as number) - 0.5));
      const to = Math.min(width - 1, Math.ceil((xs[k + 1] as number) - 0.5) - 1);
      for (let i = from; i <= to; i++) out.push(j * width + i);
    }
  }
  return Uint32Array.from(out);
}

export interface RoiStats {
  voxels: number;
  mean: number;
  /** Sample standard deviation (n − 1); 0 for a single voxel. */
  sd: number;
  min: number;
  max: number;
}

export function roiStats(values: ArrayLike<number>, mask: ArrayLike<number>): RoiStats | null {
  const n = mask.length;
  if (n === 0) return null;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < n; k++) {
    const v = values[mask[k] as number] as number;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;
  let ss = 0;
  for (let k = 0; k < n; k++) ss += ((values[mask[k] as number] as number) - mean) ** 2;
  return { voxels: n, mean, sd: n > 1 ? Math.sqrt(ss / (n - 1)) : 0, min, max };
}

/** Next default name (GEN-033): ROI1, ROI2, … after the highest one in use. */
export function nextRoiName(names: readonly string[]): string {
  let k = 0;
  for (const n of names) {
    const m = /^ROI(\d+)$/.exec(n);
    if (m) k = Math.max(k, Number(m[1]));
  }
  return `ROI${k + 1}`;
}

/** A user name made unique with a numeric suffix (GEN-033): "Hemisphere", "Hemisphere 2". */
export function uniqueRoiName(name: string, others: readonly string[]): string {
  const base = name.trim();
  if (!others.includes(base)) return base;
  let k = 2;
  while (others.includes(`${base} ${k}`)) k++;
  return `${base} ${k}`;
}

export function translateShape(shape: RoiShape, dx: number, dy: number): RoiShape {
  if (shape.kind === "ellipse") return { ...shape, center: [shape.center[0] + dx, shape.center[1] + dy] };
  return { ...shape, points: shape.points.map((p) => [p[0] + dx, p[1] + dy] as Pt) };
}

/** Anchors a user can drag to reshape an ROI (GEN-032). */
export function anchors(shape: RoiShape, freehandAnchors = 16): Pt[] {
  if (shape.kind === "spline") return [...shape.points];
  if (shape.kind === "freehand") {
    const step = Math.max(1, Math.floor(shape.points.length / freehandAnchors));
    return shape.points.filter((_, i) => i % step === 0);
  }
  const { center, a, b, angle } = shape;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [center[0] + a * c, center[1] + a * s],
    [center[0] - b * s, center[1] + b * c],
    [center[0] - a * c, center[1] - a * s],
    [center[0] + b * s, center[1] - b * c],
  ];
}

/** The shape with anchor `k` (as listed by `anchors`) moved to `to`. */
export function moveAnchor(shape: RoiShape, k: number, to: Pt, freehandAnchors = 16): RoiShape {
  if (shape.kind === "spline") return { ...shape, points: shape.points.map((p, i) => (i === k ? to : p)) };
  if (shape.kind === "freehand") {
    const n = shape.points.length;
    const step = Math.max(1, Math.floor(n / freehandAnchors));
    const at = k * step;
    const from = shape.points[at];
    if (!from) return shape;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    // Neighbours follow with a linear fall-off so the outline stays smooth.
    return {
      ...shape,
      points: shape.points.map((p, i) => {
        const d = Math.min(Math.abs(i - at), n - Math.abs(i - at));
        const w = Math.max(0, 1 - d / step);
        return w > 0 ? ([p[0] + dx * w, p[1] + dy * w] as Pt) : p;
      }),
    };
  }
  const { center, angle } = shape;
  const dx = to[0] - center[0];
  const dy = to[1] - center[1];
  const along = Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle));
  const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
  return k % 2 === 0 ? { ...shape, a: Math.max(along, 0.5) } : { ...shape, b: Math.max(across, 0.5) };
}

/** Even-odd point-in-polygon test on the outline, for picking an ROI under the pointer. */
export function containsPoint(shape: RoiShape, p: Pt): boolean {
  if (shape.kind === "ellipse") {
    const dx = p[0] - shape.center[0];
    const dy = p[1] - shape.center[1];
    const c = Math.cos(shape.angle);
    const s = Math.sin(shape.angle);
    const u = (dx * c + dy * s) / shape.a;
    const v = (-dx * s + dy * c) / shape.b;
    return u * u + v * v <= 1;
  }
  const poly = outline(shape);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Pt;
    const b = poly[j] as Pt;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
