import type { ViewerStack } from "@neuromr/contracts";
import { formatMachine, t } from "@neuromr/i18n";
import type { RoiStats } from "@neuromr/viewer";

export type XMode = "time" | "index";

/** Seconds from the first dynamic are available when every point has an acquisition time (GEN-245). */
export const hasTimes = (stack: ViewerStack): boolean => stack.axis === "dynamic" && stack.points.length > 0 && stack.points.every((p) => p.timeS !== undefined);

/** X values and axis label for the second axis. */
export function curveX(stack: ViewerStack, mode: XMode): { values: number[]; label: string } {
  const n = stack.grid[0]?.length ?? 0;
  if (mode === "time" && hasTimes(stack)) {
    const t0 = stack.points[0]?.timeS ?? 0;
    return { values: stack.points.slice(0, n).map((p) => (p.timeS ?? 0) - t0), label: t("curves.x.time") };
  }
  const axis = stack.axis === "none" ? "dynamic" : stack.axis;
  return { values: Array.from({ length: n }, (_, k) => k + 1), label: t(`curves.x.${axis}`) };
}

/** Mean of the shown curves at each point, skipping gaps; null where none has a value. */
export function averageCurve(curves: readonly (readonly (number | null)[])[]): (number | null)[] {
  const n = Math.max(0, ...curves.map((c) => c.length));
  return Array.from({ length: n }, (_, k) => {
    const v = curves.map((c) => c[k]).filter((x): x is number => typeof x === "number");
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  });
}

const tsv = (rows: string[][]) => rows.map((r) => r.join("\t")).join("\r\n") + "\r\n";
const num = (v: number | null | undefined) => (typeof v === "number" ? formatMachine(v) : "");

/** GEN-246: the ROI curves as tab-separated text, one row per point, machine-format numbers. */
export function curvesTsv(x: { values: number[]; label: string }, curves: readonly { name: string; values: readonly (number | null)[] }[], unit: string): string {
  const head = [x.label, ...curves.map((c) => t("copy.withUnit", { name: c.name, unit }))];
  return tsv([head, ...x.values.map((xv, k) => [num(xv), ...curves.map((c) => num(c.values[k]))])]);
}

/** GEN-246: the inspector's ROI table as tab-separated text. */
export function roiTableTsv(rows: readonly { name: string; stats: RoiStats | null }[], unit: string, voxelArea: number | null): string {
  const u = (name: string) => t("copy.withUnit", { name, unit });
  const head = [t("copy.name"), u(t("copy.mean")), u(t("copy.sd")), u(t("copy.min")), u(t("copy.max")), t("copy.voxels"), t("copy.withUnit", { name: t("copy.area"), unit: t("copy.mm2") })];
  return tsv([
    head,
    ...rows.map(({ name, stats: s }) => [name, num(s?.mean), num(s?.sd), num(s?.min), num(s?.max), num(s?.voxels), s && voxelArea !== null ? num(s.voxels * voxelArea) : ""]),
  ]);
}
