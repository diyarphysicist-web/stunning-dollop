import type { ViewerSession, ViewerStack } from "@neuromr/contracts";
import { describe, expect, it, vi } from "vitest";

const stack = (uid: string): ViewerStack => ({
  seriesInstanceUid: uid,
  studyInstanceUid: "S",
  description: uid,
  seriesNumber: 1,
  patientName: "P",
  patientId: "ID",
  studyDate: "",
  axis: "none",
  slicePositions: [0, 4, 8],
  points: [{}],
  grid: [[`${uid}.0`], [`${uid}.1`], [`${uid}.2`]],
  images: [],
});
const saved: { study: string; session: ViewerSession }[] = [];

vi.mock("../bridge.js", () => ({
  invoke: vi.fn(async (channel: string, req: Record<string, unknown>) => {
    if (channel === "viewer:stack") return { ok: true, value: stack(req.seriesInstanceUid as string) };
    if (channel === "session:get") return { ok: true, value: null };
    if (channel === "bookmark:save") {
      saved.push({ study: req.studyInstanceUid as string, session: req.session as ViewerSession });
      return { ok: true, value: { id: saved.length, studyInstanceUid: req.studyInstanceUid, name: `Bookmark ${saved.length}`, savedAt: "2026-11-23T12:00:00Z" } };
    }
    if (channel === "bookmark:get") return { ok: true, value: saved[(req.id as number) - 1]?.session ?? null };
    if (channel === "bookmark:list") return { ok: true, value: saved.map((s, i) => ({ id: i + 1, studyInstanceUid: s.study, name: `Bookmark ${i + 1}`, savedAt: "2026-11-23T12:00:00Z" })) };
    return { ok: true, value: null };
  }),
}));
vi.mock("@neuromr/viewer/cornerstone", () => ({ registerStack: vi.fn(), purge: vi.fn() }));

const { useViewer, paneRois } = await import("./store.js");
const { useBookmarks } = await import("./bookmarks.js");
const ellipse = { kind: "ellipse", center: [5, 5], a: 2, b: 1, angle: 0 } as const;

describe("GEN-242 Viewer bookmarks", () => {
  it("GEN-242 a bookmark stores the active study's state and restoring it replaces the current one", async () => {
    await useViewer.getState().open(["S.1"], "S");
    useViewer.getState().addRoi(0, ellipse);
    await useBookmarks.getState().refresh("S");
    const bm = await useBookmarks.getState().save();
    expect(bm?.name).toBe("Bookmark 1");
    expect(saved[0]?.study).toBe("S");
    expect(saved[0]?.session.series["S.1"]).toMatchObject({ slice: 1, rois: [{ name: "ROI1" }] });
    expect(useBookmarks.getState().list.map((b) => b.name)).toEqual(["Bookmark 1"]);

    useViewer.getState().step(0, 1, 0);
    useViewer.getState().deleteLastRoi(0);
    expect(await useBookmarks.getState().restore(1)).toBe(true);
    const st = useViewer.getState();
    expect(st.panes[0]?.slice).toBe(1);
    expect(paneRois(st, 0).rois.map((r) => r.name)).toEqual(["ROI1"]);
  });
});
