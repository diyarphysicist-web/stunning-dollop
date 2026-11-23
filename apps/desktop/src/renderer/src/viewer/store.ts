import { parseImageRef, type DicomAttribute, type ViewerStack } from "@neuromr/contracts";
import { IDENTITY, nextRoiName, uniqueRoiName, type Roi, type RoiShape, type RoiStats, type ViewTransform } from "@neuromr/viewer";
import { create } from "zustand";
import { invoke } from "../bridge.js";
import { purge, registerStack } from "@neuromr/viewer/cornerstone";
import { cellCount, clamp, layoutFor, middleSlice, sopAt, type Layout } from "./stack.js";

/** Left-drag modes of the generic Viewer (GEN-010 subset that applies without a package) and ROI shapes (GEN-030). */
export type Tool = "scroll" | "pan" | "zoom" | "window" | "ellipse" | "spline" | "freehand";
export const DRAW_TOOLS: ReadonlySet<Tool> = new Set(["ellipse", "spline", "freehand"]);

export interface Pane {
  seriesUid: string | null;
  stack: ViewerStack | null;
  status: "empty" | "loading" | "ready" | "failed";
  slice: number;
  point: number;
  transform: ViewTransform;
  /** Increments to ask the viewport for a reset (GEN-012). */
  resetView: number;
  resetWindow: number;
  rois: Roi[];
  /** ROIs created so far in this pane, for palette order (GEN-035). */
  roiSerial: number;
  /** Snapshots for undo/redo (GEN-034). */
  undo: Roi[][];
  redo: Roi[][];
  /** Statistics of the current image per ROI id (GEN-236); missing while the image loads. */
  stats: Record<string, RoiStats | null>;
}

const MAX_PANES = 9;
const emptyPane = (): Pane => ({ seriesUid: null, stack: null, status: "empty", slice: 0, point: 0, transform: IDENTITY, resetView: 0, resetWindow: 0, rois: [], roiSerial: 0, undo: [], redo: [], stats: {} });
const HISTORY = 100;

interface ViewerState {
  layout: Layout;
  panes: Pane[];
  active: number;
  tool: Tool;
  attributes: DicomAttribute[];

  open(seriesUids: readonly string[]): Promise<void>;
  load(pane: number, seriesUid: string): Promise<void>;
  setActive(pane: number): void;
  setLayout(layout: Layout): void;
  setTool(tool: Tool): void;
  step(pane: number, dSlice: number, dPoint: number): void;
  transform(pane: number, op: "mirror" | "flip" | "rotate-cw" | "rotate-ccw"): void;
  reset(pane: number, what: "view" | "window"): void;
  close(): void;

  addRoi(pane: number, shape: RoiShape): string | null;
  /** Records an undo step; call once before a drag that edits ROIs. */
  checkpoint(pane: number): void;
  setRoiShape(pane: number, id: string, shape: RoiShape): void;
  renameRoi(pane: number, id: string, name: string): void;
  deleteRoi(pane: number, id: string): void;
  deleteLastRoi(pane: number): void;
  undoRoi(pane: number): void;
  redoRoi(pane: number): void;
  setStats(pane: number, stats: Record<string, RoiStats | null>): void;
}

export function currentSop(p: Pane): string | null {
  return p.stack ? sopAt(p.stack, p.slice, p.point) : null;
}

export const useViewer = create<ViewerState>((set, get) => {
  const patch = (i: number, change: Partial<Pane>) => set({ panes: get().panes.map((p, k) => (k === i ? { ...p, ...change } : p)) });

  let attributesFor: string | null = null;
  async function refreshAttributes(): Promise<void> {
    const { panes, active } = get();
    const pane = panes[active];
    const sop = pane ? currentSop(pane) : null;
    if (sop === attributesFor) return;
    attributesFor = sop;
    if (!sop) return set({ attributes: [] });
    const r = await invoke("viewer:attributes", { sopInstanceUid: parseImageRef(sop).sopInstanceUid });
    if (attributesFor === sop) set({ attributes: r.ok ? r.value : [] });
  }

  function release(): void {
    const keep = new Set<string>();
    for (const p of get().panes) for (const i of p.stack?.images ?? []) keep.add(i.ref);
    purge(keep);
  }

  return {
    layout: "1x1",
    panes: Array.from({ length: MAX_PANES }, emptyPane),
    active: 0,
    tool: "scroll",
    attributes: [],

    async open(seriesUids) {
      const uids = seriesUids.slice(0, MAX_PANES);
      set({ layout: layoutFor(uids.length), panes: Array.from({ length: MAX_PANES }, emptyPane), active: 0 });
      await Promise.all(uids.map((uid, i) => get().load(i, uid)));
    },

    async load(i, seriesUid) {
      patch(i, { ...emptyPane(), seriesUid, status: "loading" });
      const r = await invoke("viewer:stack", { seriesInstanceUid: seriesUid });
      if (get().panes[i]?.seriesUid !== seriesUid) return;
      if (!r.ok) return patch(i, { status: "failed" });
      registerStack(r.value);
      patch(i, { stack: r.value, status: "ready", slice: middleSlice(r.value), point: 0 });
      release();
      void refreshAttributes();
    },

    setActive(active) {
      if (active === get().active) return;
      set({ active });
      void refreshAttributes();
    },

    setLayout(layout) {
      set({ layout, active: Math.min(get().active, cellCount(layout) - 1) });
      void refreshAttributes();
    },

    setTool: (tool) => set({ tool }),

    step(i, dSlice, dPoint) {
      const p = get().panes[i];
      if (!p?.stack) return;
      const slice = clamp(p.slice + dSlice, 0, p.stack.grid.length - 1);
      const point = clamp(p.point + dPoint, 0, Math.max(0, (p.stack.grid[0]?.length ?? 1) - 1));
      if (slice === p.slice && point === p.point) return;
      patch(i, { slice, point });
      if (i === get().active) void refreshAttributes();
    },

    transform(i, op) {
      const p = get().panes[i];
      if (!p) return;
      const t = p.transform;
      const next: ViewTransform =
        op === "mirror" ? { ...t, mirror: !t.mirror } : op === "flip" ? { ...t, flip: !t.flip } : { ...t, quarterTurns: (t.quarterTurns + (op === "rotate-cw" ? 1 : 3)) % 4 };
      patch(i, { transform: next });
    },

    reset(i, what) {
      const p = get().panes[i];
      if (!p) return;
      patch(i, what === "view" ? { resetView: p.resetView + 1, transform: IDENTITY } : { resetWindow: p.resetWindow + 1 });
    },

    addRoi(i, shape) {
      const p = get().panes[i];
      if (!p?.stack) return null;
      const id = `roi-${i}-${p.roiSerial + 1}-${Date.now().toString(36)}`;
      const roi: Roi = { id, name: nextRoiName(p.rois.map((r) => r.name)), color: p.roiSerial, slice: p.slice, shape };
      patch(i, { rois: [...p.rois, roi], roiSerial: p.roiSerial + 1, undo: [...p.undo, p.rois].slice(-HISTORY), redo: [] });
      return id;
    },

    checkpoint(i) {
      const p = get().panes[i];
      if (p) patch(i, { undo: [...p.undo, p.rois].slice(-HISTORY), redo: [] });
    },

    setRoiShape(i, id, shape) {
      const p = get().panes[i];
      if (p) patch(i, { rois: p.rois.map((r) => (r.id === id ? { ...r, shape } : r)) });
    },

    renameRoi(i, id, name) {
      const p = get().panes[i];
      if (!p || !name.trim()) return;
      const unique = uniqueRoiName(name, p.rois.filter((r) => r.id !== id).map((r) => r.name));
      patch(i, { rois: p.rois.map((r) => (r.id === id ? { ...r, name: unique } : r)), undo: [...p.undo, p.rois].slice(-HISTORY), redo: [] });
    },

    deleteRoi(i, id) {
      const p = get().panes[i];
      if (p?.rois.some((r) => r.id === id)) patch(i, { rois: p.rois.filter((r) => r.id !== id), undo: [...p.undo, p.rois].slice(-HISTORY), redo: [] });
    },

    deleteLastRoi(i) {
      const last = get().panes[i]?.rois.at(-1);
      if (last) get().deleteRoi(i, last.id);
    },

    undoRoi(i) {
      const p = get().panes[i];
      const prev = p?.undo.at(-1);
      if (p && prev) patch(i, { rois: prev, undo: p.undo.slice(0, -1), redo: [...p.redo, p.rois] });
    },

    redoRoi(i) {
      const p = get().panes[i];
      const next = p?.redo.at(-1);
      if (p && next) patch(i, { rois: next, redo: p.redo.slice(0, -1), undo: [...p.undo, p.rois] });
    },

    setStats(i, stats) {
      patch(i, { stats });
    },

    close() {
      set({ panes: Array.from({ length: MAX_PANES }, emptyPane), attributes: [], active: 0 });
      attributesFor = null;
      release();
    },
  };
});
