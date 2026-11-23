import { parseImageRef, type DicomAttribute, type PresetCell, type ViewerSession, type ViewerStack } from "@neuromr/contracts";
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
  /** Statistics of the current image per ROI id (GEN-236); missing while the image loads. */
  stats: Record<string, RoiStats | null>;
  /** Saved zoom, pan and window the viewport applies once when it shows the series (GEN-241). */
  restore: CameraState | null;
  /** What a layout preset wanted here when the study had no matching series (GEN-243). */
  expected: PresetCell | null;
}

/** Camera and window of a viewport, as Cornerstone reports them (GEN-241). */
export interface CameraState {
  zoom: number | null;
  pan: [number, number] | null;
  window: { lower: number; upper: number } | null;
}

/** How a series was last shown (GEN-241), whatever viewport showed it. */
export interface SeriesViewState extends CameraState {
  slice: number;
  point: number;
  transform: ViewTransform;
}

/** Layout part of a study's session (GEN-241). */
export interface SessionLayout {
  layout: Layout;
  active: number;
  panes: (string | null)[];
}

/** ROIs of one series with their history (GEN-034, GEN-035); shared by every viewport showing it (GEN-236). */
export interface SeriesRois {
  rois: Roi[];
  /** ROIs created so far in this series, for palette order (GEN-035). */
  roiSerial: number;
  /** Snapshots for undo/redo (GEN-034). */
  undo: Roi[][];
  redo: Roi[][];
}

export const NO_ROIS: SeriesRois = Object.freeze({ rois: [], roiSerial: 0, undo: [], redo: [] }) as unknown as SeriesRois;

const MAX_PANES = 9;
const emptyPane = (): Pane => ({ seriesUid: null, stack: null, status: "empty", slice: 0, point: 0, transform: IDENTITY, resetView: 0, resetWindow: 0, stats: {}, restore: null, expected: null });
const HISTORY = 100;

interface ViewerState {
  layout: Layout;
  panes: Pane[];
  active: number;
  tool: Tool;
  attributes: DicomAttribute[];
  /** ROIs by Series Instance UID (GEN-236). */
  roisBySeries: Record<string, SeriesRois>;
  /** View state by Series Instance UID (GEN-241). */
  viewsBySeries: Record<string, SeriesViewState>;
  /** Study of every series the Viewer has state for. */
  studyOfSeries: Record<string, string>;
  /** Layout of a study's saved session, for studies not on screen (GEN-241). */
  savedLayouts: Record<string, SessionLayout>;

  /** Brings a study's saved session into memory, once per study and run; series already in memory win. */
  hydrate(studyUid: string): Promise<ViewerSession | null>;
  /** Shows a session: series state from it (replacing what is in memory when `replace`), then its layout and series. */
  applySession(studyUid: string, session: ViewerSession, replace: boolean): Promise<void>;
  /** GEN-241: reopens a study's last session, or its first series when it has none. */
  openStudy(studyUid: string, firstSeries: string | undefined): Promise<void>;
  /** Records the camera and window a viewport shows (GEN-241). */
  noteCamera(pane: number, camera: CameraState): void;

  open(seriesUids: readonly string[], studyUid?: string): Promise<void>;
  load(pane: number, seriesUid: string): Promise<void>;
  /** GEN-243: shows `layout` with these series; an empty cell with an expectation says what was missing. */
  showLayout(layout: Layout, series: readonly (string | null)[], expected: readonly (PresetCell | null)[]): Promise<void>;
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
  /** Viewport waiting for the Reset all confirmation (GEN-244), or null. */
  confirmReset: number | null;
  /** The ROI curves panel is open (GEN-245). */
  curvesOpen: boolean;
  toggleCurves(): void;
  askResetAll(pane: number | null): void;
  /** GEN-244: resets zoom, pan, transform and window and removes every ROI of the series, as one undo step. */
  resetAll(pane: number): void;
  undoRoi(pane: number): void;
  redoRoi(pane: number): void;
  setStats(pane: number, stats: Record<string, RoiStats | null>): void;
}

/** ROIs of the series shown in viewport `i`. */
export function paneRois(s: Pick<ViewerState, "panes" | "roisBySeries">, i: number): SeriesRois {
  const uid = s.panes[i]?.seriesUid;
  return (uid && s.roisBySeries[uid]) || NO_ROIS;
}

export function currentSop(p: Pane): string | null {
  return p.stack ? sopAt(p.stack, p.slice, p.point) : null;
}

export const useViewer = create<ViewerState>((set, get) => {
  const patch = (i: number, change: Partial<Pane>) => set({ panes: get().panes.map((p, k) => (k === i ? { ...p, ...change } : p)) });
  /** Changes the ROIs of the series in viewport `i`; returns false when the viewport shows no series. */
  const patchRois = (i: number, change: (r: SeriesRois) => Partial<SeriesRois> | null): boolean => {
    const uid = get().panes[i]?.stack ? get().panes[i]?.seriesUid : null;
    if (!uid) return false;
    const cur = get().roisBySeries[uid] ?? NO_ROIS;
    const next = change(cur);
    if (!next) return false;
    set({ roisBySeries: { ...get().roisBySeries, [uid]: { ...cur, ...next } } });
    return true;
  };
  /** Copies a viewport's slice, point and transform into its series' view state. */
  const remember = (i: number) => {
    const p = get().panes[i];
    if (!p?.stack || !p.seriesUid) return;
    const cur = get().viewsBySeries[p.seriesUid];
    const next: SeriesViewState = { zoom: null, pan: null, window: null, ...cur, slice: p.slice, point: p.point, transform: p.transform };
    set({ viewsBySeries: { ...get().viewsBySeries, [p.seriesUid]: next } });
  };
  const hydrated = new Map<string, Promise<ViewerSession | null>>();
  const history = (r: SeriesRois) => ({ undo: [...r.undo, r.rois].slice(-HISTORY), redo: [] as Roi[][] });

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
    roisBySeries: {},
    viewsBySeries: {},
    studyOfSeries: {},
    savedLayouts: {},

    hydrate(studyUid) {
      let pending = hydrated.get(studyUid);
      if (!pending) {
        pending = invoke("session:get", { studyInstanceUid: studyUid }).then((r) => {
          const session = r.ok ? r.value : null;
          if (session) {
            const st = get();
            const views = { ...st.viewsBySeries };
            const rois = { ...st.roisBySeries };
            const study = { ...st.studyOfSeries };
            for (const [uid, v] of Object.entries(session.series)) {
              study[uid] = studyUid;
              if (!views[uid]) views[uid] = { slice: v.slice, point: v.point, transform: v.transform, zoom: v.zoom, pan: v.pan, window: v.window };
              if (!rois[uid]) rois[uid] = { rois: v.rois, roiSerial: v.roiSerial, undo: [], redo: [] };
            }
            set({
              viewsBySeries: views,
              roisBySeries: rois,
              studyOfSeries: study,
              savedLayouts: { ...st.savedLayouts, [studyUid]: { layout: session.layout, active: session.active, panes: session.panes } },
            });
          }
          return session;
        });
        hydrated.set(studyUid, pending);
      }
      return pending;
    },

    async applySession(studyUid, session, replace) {
      await get().hydrate(studyUid);
      if (replace) {
        const st = get();
        const views = { ...st.viewsBySeries };
        const rois = { ...st.roisBySeries };
        for (const [uid, v] of Object.entries(session.series)) {
          views[uid] = { slice: v.slice, point: v.point, transform: v.transform, zoom: v.zoom, pan: v.pan, window: v.window };
          rois[uid] = { rois: v.rois, roiSerial: v.roiSerial, undo: [], redo: [] };
        }
        set({ viewsBySeries: views, roisBySeries: rois });
      }
      const panes = session.panes.slice(0, MAX_PANES);
      set({ layout: session.layout, panes: Array.from({ length: MAX_PANES }, emptyPane), active: Math.min(session.active, cellCount(session.layout) - 1) });
      await Promise.all(panes.map((uid, i) => (uid ? get().load(i, uid) : Promise.resolve())));
      void refreshAttributes();
    },

    async openStudy(studyUid, firstSeries) {
      const session = await get().hydrate(studyUid);
      if (session && session.panes.some(Boolean)) return get().applySession(studyUid, session, false);
      if (firstSeries) await get().open([firstSeries], studyUid);
    },

    noteCamera(i, camera) {
      const uid = get().panes[i]?.seriesUid;
      const cur = uid ? get().viewsBySeries[uid] : undefined;
      if (!uid || !cur) return;
      const same = cur.zoom === camera.zoom && cur.pan?.[0] === camera.pan?.[0] && cur.pan?.[1] === camera.pan?.[1] && cur.window?.lower === camera.window?.lower && cur.window?.upper === camera.window?.upper;
      if (!same) set({ viewsBySeries: { ...get().viewsBySeries, [uid]: { ...cur, ...camera } } });
    },

    async open(seriesUids, studyUid) {
      if (studyUid) await get().hydrate(studyUid);
      const uids = seriesUids.slice(0, MAX_PANES);
      set({ layout: layoutFor(uids.length), panes: Array.from({ length: MAX_PANES }, emptyPane), active: 0 });
      await Promise.all(uids.map((uid, i) => get().load(i, uid)));
    },

    async showLayout(layout, series, expected) {
      set({ layout, active: 0, panes: Array.from({ length: MAX_PANES }, (_, i) => ({ ...emptyPane(), expected: series[i] ? null : (expected[i] ?? null) })) });
      await Promise.all(series.slice(0, cellCount(layout)).map((uid, i) => (uid ? get().load(i, uid) : Promise.resolve())));
      void refreshAttributes();
    },

    async load(i, seriesUid) {
      patch(i, { ...emptyPane(), seriesUid, status: "loading" });
      const r = await invoke("viewer:stack", { seriesInstanceUid: seriesUid });
      if (get().panes[i]?.seriesUid !== seriesUid) return;
      if (!r.ok) return patch(i, { status: "failed" });
      registerStack(r.value);
      // GEN-241: a series comes back as it was last shown.
      const saved = get().viewsBySeries[seriesUid];
      const lastSlice = r.value.grid.length - 1;
      const lastPoint = Math.max(0, (r.value.grid[0]?.length ?? 1) - 1);
      set({ studyOfSeries: { ...get().studyOfSeries, [seriesUid]: r.value.studyInstanceUid } });
      patch(i, {
        stack: r.value,
        status: "ready",
        slice: saved ? clamp(saved.slice, 0, lastSlice) : middleSlice(r.value),
        point: saved ? clamp(saved.point, 0, lastPoint) : 0,
        transform: saved?.transform ?? IDENTITY,
        restore: saved ? { zoom: saved.zoom, pan: saved.pan, window: saved.window } : null,
      });
      remember(i);
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
      remember(i);
      if (i === get().active) void refreshAttributes();
    },

    transform(i, op) {
      const p = get().panes[i];
      if (!p) return;
      const t = p.transform;
      const next: ViewTransform =
        op === "mirror" ? { ...t, mirror: !t.mirror } : op === "flip" ? { ...t, flip: !t.flip } : { ...t, quarterTurns: (t.quarterTurns + (op === "rotate-cw" ? 1 : 3)) % 4 };
      patch(i, { transform: next });
      remember(i);
    },

    confirmReset: null,
    curvesOpen: false,
    toggleCurves: () => set({ curvesOpen: !get().curvesOpen }),
    askResetAll(i) {
      set({ confirmReset: i });
    },
    resetAll(i) {
      const p = get().panes[i];
      if (!p) return;
      patch(i, { resetView: p.resetView + 1, resetWindow: p.resetWindow + 1, transform: IDENTITY });
      patchRois(i, (r) => (r.rois.length ? { rois: [], ...history(r) } : null));
      set({ confirmReset: null });
      remember(i);
    },

    reset(i, what) {
      const p = get().panes[i];
      if (!p) return;
      patch(i, what === "view" ? { resetView: p.resetView + 1, transform: IDENTITY } : { resetWindow: p.resetWindow + 1 });
      remember(i);
    },

    addRoi(i, shape) {
      const p = get().panes[i];
      if (!p?.stack) return null;
      let id: string | null = null;
      patchRois(i, (r) => {
        id = `roi-${r.roiSerial + 1}-${Date.now().toString(36)}`;
        const roi: Roi = { id, name: nextRoiName(r.rois.map((x) => x.name)), color: r.roiSerial, slice: p.slice, shape };
        return { rois: [...r.rois, roi], roiSerial: r.roiSerial + 1, ...history(r) };
      });
      return id;
    },

    checkpoint(i) {
      patchRois(i, history);
    },

    setRoiShape(i, id, shape) {
      patchRois(i, (r) => ({ rois: r.rois.map((x) => (x.id === id ? { ...x, shape } : x)) }));
    },

    renameRoi(i, id, name) {
      if (!name.trim()) return;
      patchRois(i, (r) => {
        const unique = uniqueRoiName(name, r.rois.filter((x) => x.id !== id).map((x) => x.name));
        return { rois: r.rois.map((x) => (x.id === id ? { ...x, name: unique } : x)), ...history(r) };
      });
    },

    deleteRoi(i, id) {
      patchRois(i, (r) => (r.rois.some((x) => x.id === id) ? { rois: r.rois.filter((x) => x.id !== id), ...history(r) } : null));
    },

    deleteLastRoi(i) {
      const last = paneRois(get(), i).rois.at(-1);
      if (last) get().deleteRoi(i, last.id);
    },

    undoRoi(i) {
      patchRois(i, (r) => {
        const prev = r.undo.at(-1);
        return prev ? { rois: prev, undo: r.undo.slice(0, -1), redo: [...r.redo, r.rois] } : null;
      });
    },

    redoRoi(i) {
      patchRois(i, (r) => {
        const next = r.redo.at(-1);
        return next ? { rois: next, redo: r.redo.slice(0, -1), undo: [...r.undo, r.rois] } : null;
      });
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
