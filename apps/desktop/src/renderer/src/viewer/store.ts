import type { DicomAttribute, ViewerStack } from "@neuromr/contracts";
import { IDENTITY, type ViewTransform } from "@neuromr/viewer";
import { create } from "zustand";
import { invoke } from "../bridge.js";
import { purge, registerStack } from "@neuromr/viewer/cornerstone";
import { cellCount, clamp, layoutFor, middleSlice, sopAt, type Layout } from "./stack.js";

/** Left-drag modes of the generic Viewer (GEN-010 subset that applies without a package). */
export type Tool = "scroll" | "pan" | "zoom" | "window";

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
}

const MAX_PANES = 9;
const emptyPane = (): Pane => ({ seriesUid: null, stack: null, status: "empty", slice: 0, point: 0, transform: IDENTITY, resetView: 0, resetWindow: 0 });

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
    const r = await invoke("viewer:attributes", { sopInstanceUid: sop });
    if (attributesFor === sop) set({ attributes: r.ok ? r.value : [] });
  }

  function release(): void {
    const keep = new Set<string>();
    for (const p of get().panes) for (const i of p.stack?.images ?? []) keep.add(i.sopInstanceUid);
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

    close() {
      set({ panes: Array.from({ length: MAX_PANES }, emptyPane), attributes: [], active: 0 });
      attributesFor = null;
      release();
    },
  };
});
