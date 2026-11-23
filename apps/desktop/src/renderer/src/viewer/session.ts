import type { SeriesView, ViewerSession } from "@neuromr/contracts";
import { invoke } from "../bridge.js";
import { useViewer, type SessionLayout } from "./store.js";

type State = ReturnType<typeof useViewer.getState>;

const EMPTY_LAYOUT: SessionLayout = { layout: "1x1", active: 0, panes: Array.from({ length: 9 }, () => null) };

/** Layout part of a study shown on screen now, or null when none of its series is in a viewport. */
export function shownLayout(st: State, studyUid: string): SessionLayout | null {
  const ofStudy = (uid: string | null) => (uid && st.studyOfSeries[uid] === studyUid ? uid : null);
  if (!st.panes.some((p) => ofStudy(p.seriesUid))) return null;
  return { layout: st.layout, active: st.active, panes: st.panes.map((p) => ofStudy(p.seriesUid)) };
}

/** The Viewer state of one study as it is saved (GEN-241) and bookmarked (GEN-242). */
export function buildSession(st: State, studyUid: string, layout: SessionLayout | null): ViewerSession {
  const series: Record<string, SeriesView> = {};
  for (const [uid, study] of Object.entries(st.studyOfSeries)) {
    const view = st.viewsBySeries[uid];
    if (study !== studyUid || !view) continue;
    const rois = st.roisBySeries[uid];
    // Roi points are readonly tuples in the viewer model; the wire schema has the same shape.
    series[uid] = { ...view, rois: (rois?.rois ?? []) as SeriesView["rois"], roiSerial: rois?.roiSerial ?? 0 };
  }
  const part = shownLayout(st, studyUid) ?? layout ?? st.savedLayouts[studyUid] ?? EMPTY_LAYOUT;
  return { layout: part.layout, active: part.active, panes: part.panes, series };
}

export type SaveSession = (studyUid: string, session: ViewerSession) => Promise<unknown>;

/**
 * GEN-241: saves every study whose Viewer state changed, at most `delayMs` after the change, and
 * at once when the window goes away. Returns a function that flushes and stops.
 */
export function startAutosave(save: SaveSession = (studyInstanceUid, session) => invoke("session:save", { studyInstanceUid, session }), delayMs = 1000): () => void {
  const saved = new Map<string, string>();
  const layouts = new Map<string, SessionLayout>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const st = useViewer.getState();
    for (const study of new Set(Object.values(st.studyOfSeries))) {
      const shown = shownLayout(st, study);
      if (shown) layouts.set(study, shown);
      const session = buildSession(st, study, layouts.get(study) ?? null);
      const json = JSON.stringify(session);
      if (saved.get(study) === json) continue;
      saved.set(study, json);
      void save(study, session);
    }
  };
  const unsubscribe = useViewer.subscribe(() => {
    timer ??= setTimeout(flush, delayMs);
  });
  const onHide = () => flush();
  globalThis.addEventListener?.("beforeunload", onHide);
  return () => {
    unsubscribe();
    globalThis.removeEventListener?.("beforeunload", onHide);
    flush();
  };
}
