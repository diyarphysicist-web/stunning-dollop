import type { ViewerSession, ViewerStack } from "@neuromr/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stack = (uid: string, study: string): ViewerStack => ({
  seriesInstanceUid: uid,
  studyInstanceUid: study,
  description: uid,
  seriesNumber: 1,
  patientName: "P",
  patientId: "ID",
  studyDate: "",
  axis: "dynamic",
  slicePositions: [0, 4, 8],
  points: [{}, {}],
  grid: [0, 1, 2].map((z) => [`${uid}.${z}.0`, `${uid}.${z}.1`]),
  images: [],
});
// Series "S.n" belong to study "S".
const studyOf = (uid: string) => uid.split(".")[0] as string;
const stored = new Map<string, ViewerSession>();

vi.mock("../bridge.js", () => ({
  invoke: vi.fn(async (channel: string, req: { seriesInstanceUid?: string; studyInstanceUid?: string }) => {
    if (channel === "viewer:stack" && req.seriesInstanceUid) return { ok: true, value: stack(req.seriesInstanceUid, studyOf(req.seriesInstanceUid)) };
    if (channel === "session:get") return { ok: true, value: stored.get(req.studyInstanceUid ?? "") ?? null };
    return { ok: true, value: [] };
  }),
}));
vi.mock("@neuromr/viewer/cornerstone", () => ({ registerStack: vi.fn(), purge: vi.fn() }));

const { useViewer, paneRois } = await import("./store.js");
const { buildSession, startAutosave } = await import("./session.js");
const ellipse = { kind: "ellipse", center: [5, 5], a: 2, b: 1, angle: 0 } as const;

beforeEach(() => useViewer.setState({ roisBySeries: {}, viewsBySeries: {}, studyOfSeries: {}, savedLayouts: {} }));
afterEach(() => vi.useRealTimers());

describe("GEN-241 Viewer sessions", () => {
  it("GEN-241 the session holds layout, series per viewport and each series' view and ROIs", async () => {
    const v = useViewer.getState();
    await v.open(["A.1", "A.2"], "A");
    v.step(0, 1, 1);
    v.transform(0, "mirror");
    v.addRoi(0, ellipse);
    v.noteCamera(0, { zoom: 2, pan: [3, -1], window: { lower: 5, upper: 50 } });
    const s = buildSession(useViewer.getState(), "A", null);
    expect(s.layout).toBe("1x2");
    expect(s.panes.slice(0, 3)).toEqual(["A.1", "A.2", null]);
    expect(s.series["A.1"]).toMatchObject({ slice: 2, point: 1, transform: { mirror: true }, zoom: 2, pan: [3, -1], window: { lower: 5, upper: 50 }, roiSerial: 1 });
    expect(s.series["A.1"]?.rois.map((r) => r.name)).toEqual(["ROI1"]);
    expect(s.series["A.2"]).toMatchObject({ slice: 1, point: 0, rois: [] });
  });

  it("GEN-241 autosave waits for the change to settle, saves once per change and keeps a hidden study's layout", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    const stop = startAutosave(save, 1000);
    await useViewer.getState().open(["B.1", "B.2"], "B");
    useViewer.getState().step(1, 1, 0);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toBe("B");
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    // Another study replaces B on screen; B's saved layout stays what it was.
    await useViewer.getState().open(["C.1"], "C");
    await vi.advanceTimersByTimeAsync(1000);
    const forB = save.mock.calls.filter((c) => c[0] === "B").at(-1)?.[1] as ViewerSession | undefined;
    expect(forB?.panes.slice(0, 2)).toEqual(["B.1", "B.2"]);
    stop();
  });

  it("GEN-241 a saved session comes back: series state on open, layout on reopening the study", async () => {
    stored.set("D", {
      layout: "1x2",
      active: 1,
      panes: ["D.2", "D.1", null, null, null, null, null, null, null],
      series: {
        "D.1": { slice: 0, point: 1, transform: { mirror: false, flip: true, quarterTurns: 3 }, zoom: 1.5, pan: [1, 2], window: { lower: 0, upper: 9 }, rois: [{ id: "r", name: "Lesion", color: 4, slice: 0, shape: ellipse as never }], roiSerial: 5 },
      },
    });
    await useViewer.getState().open(["D.1"], "D");
    const p = useViewer.getState().panes[0];
    expect(p).toMatchObject({ slice: 0, point: 1, transform: { flip: true, quarterTurns: 3 }, restore: { zoom: 1.5, pan: [1, 2], window: { lower: 0, upper: 9 } } });
    expect(paneRois(useViewer.getState(), 0)).toMatchObject({ roiSerial: 5, rois: [{ name: "Lesion" }] });
    await useViewer.getState().openStudy("D", "D.1");
    const st = useViewer.getState();
    expect([st.layout, st.active, st.panes[0]?.seriesUid, st.panes[1]?.seriesUid]).toEqual(["1x2", 1, "D.2", "D.1"]);
  });

  it("GEN-241 a study without a session opens its first series", async () => {
    await useViewer.getState().openStudy("E", "E.7");
    const st = useViewer.getState();
    expect([st.layout, st.panes[0]?.seriesUid, st.panes[0]?.slice]).toEqual(["1x1", "E.7", 1]);
  });
});
