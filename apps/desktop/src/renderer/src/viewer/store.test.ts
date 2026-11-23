import type { ViewerStack } from "@neuromr/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stack = (uid: string): ViewerStack => ({
  seriesInstanceUid: uid,
  studyInstanceUid: "1.1",
  description: uid,
  seriesNumber: 1,
  patientName: "P",
  patientId: "ID",
  studyDate: "",
  axis: "none",
  slicePositions: [0, 4],
  points: [{}],
  grid: [[`${uid}.1`], [`${uid}.2`]],
  images: [],
});

vi.mock("../bridge.js", () => ({
  invoke: vi.fn(async (channel: string, req: { seriesInstanceUid?: string }) =>
    channel === "viewer:stack" && req.seriesInstanceUid ? { ok: true, value: stack(req.seriesInstanceUid) } : { ok: true, value: channel === "session:get" ? null : [] },
  ),
}));
vi.mock("@neuromr/viewer/cornerstone", () => ({ registerStack: vi.fn(), purge: vi.fn() }));

const { useViewer, paneRois } = await import("./store.js");
const ellipse = { kind: "ellipse", center: [5, 5], a: 2, b: 1, angle: 0 } as const;

describe("GEN-236 ROIs belong to the series", () => {
  beforeEach(() => useViewer.setState({ roisBySeries: {} }));

  it("GEN-236 a series in two viewports shows the same ROIs; undo is shared", async () => {
    const s = useViewer.getState();
    await s.open(["A", "A"]);
    s.addRoi(0, ellipse);
    const v = useViewer.getState();
    expect(paneRois(v, 1).rois.map((r) => r.name)).toEqual(["ROI1"]);
    v.undoRoi(1);
    expect(paneRois(useViewer.getState(), 0).rois).toEqual([]);
    useViewer.getState().redoRoi(0);
    expect(paneRois(useViewer.getState(), 1).rois).toHaveLength(1);
  });

  it("GEN-236 ROIs, palette order and history follow the series to another viewport", async () => {
    await useViewer.getState().open(["A", "B"]);
    useViewer.getState().addRoi(0, ellipse);
    useViewer.getState().addRoi(0, ellipse);
    useViewer.getState().addRoi(1, ellipse);
    await useViewer.getState().load(0, "B");
    await useViewer.getState().load(1, "A");
    const v = useViewer.getState();
    expect(paneRois(v, 1).rois.map((r) => [r.name, r.color])).toEqual([
      ["ROI1", 0],
      ["ROI2", 1],
    ]);
    expect(paneRois(v, 0).rois.map((r) => r.name)).toEqual(["ROI1"]);
    v.addRoi(1, ellipse);
    expect(paneRois(useViewer.getState(), 1).rois.at(-1)?.color).toBe(2);
    useViewer.getState().undoRoi(1);
    expect(paneRois(useViewer.getState(), 1).rois).toHaveLength(2);
    await useViewer.getState().open(["A"]);
    expect(paneRois(useViewer.getState(), 0).rois).toHaveLength(2);
  });

  it("GEN-034 an empty viewport has no ROIs to change", () => {
    useViewer.getState().close();
    expect(useViewer.getState().addRoi(0, ellipse)).toBeNull();
    useViewer.getState().undoRoi(0);
    expect(useViewer.getState().roisBySeries).toEqual({});
  });
});
