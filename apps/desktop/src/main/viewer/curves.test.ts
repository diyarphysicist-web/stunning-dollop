import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHeader } from "@neuromr/dicom";
import { fakeInstance, type FakeInstance } from "@neuromr/dicom/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudyIndex } from "../directory/study-index.js";
import { decodeImage } from "../pixels/decode-image.js";
import { roiCurves } from "./curves.js";

let dir: string;
let index: StudyIndex;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "neuromr-curves-"));
  mkdirSync(join(dir, "store"));
  index = new StudyIndex(join(dir, "index.sqlite"));
});
afterEach(() => {
  index.close();
  rmSync(dir, { recursive: true, force: true });
});
function store(o: FakeInstance) {
  const bytes = fakeInstance(o);
  const r = readHeader(bytes);
  if (r.status !== "ok") throw new Error("parse");
  const path = join(dir, "store", `${r.header.sopInstanceUid}.dcm`);
  writeFileSync(path, bytes);
  index.addInstance(r.header, path, bytes.length);
  index.refreshSeries(r.header.seriesInstanceUid, true);
}

describe("GEN-245 ROI curves", () => {
  it("GEN-245 the mean inside each ROI at its slice, for every dynamic, with the GEN-236 voxel rule", async () => {
    // 4 × 4 images; dynamic k, slice z holds 10·k + 100·z + pixel index.
    for (let k = 0; k < 3; k++)
      for (let z = 0; z < 2; z++)
        store({ series: "1.7", sop: `1.7.${k}.${z}`, temporal: k + 1, z: z * 4, pixels: Uint16Array.from({ length: 16 }, (_, i) => 10 * k + 100 * z + i) });
    // Freehand square covering pixel centres (1,1),(2,1),(1,2),(2,2): indices 5, 6, 9, 10 → mean 7.5.
    const square = { kind: "freehand" as const, points: [[1, 1], [3, 1], [3, 3], [1, 3]] as [number, number][] };
    const curves = await roiCurves(index, { seriesInstanceUid: "1.7", rois: [{ id: "a", slice: 0, shape: square }, { id: "b", slice: 1, shape: square }] }, decodeImage);
    expect(curves).toEqual([
      { id: "a", values: [7.5, 17.5, 27.5] },
      { id: "b", values: [107.5, 117.5, 127.5] },
    ]);
  });
  it("GEN-245 a missing image gives a gap, not a failure", async () => {
    for (let k = 0; k < 2; k++) store({ series: "1.8", sop: `1.8.${k}`, temporal: k + 1 });
    const square = { kind: "freehand" as const, points: [[1, 1], [3, 1], [3, 3], [1, 3]] as [number, number][] };
    const curves = await roiCurves(index, { seriesInstanceUid: "1.8", rois: [{ id: "a", slice: 0, shape: square }] }, async (path, f) => (path.includes("1.8.1") ? { status: "missing" } : decodeImage(path, f)));
    expect(curves[0]?.values[0]).not.toBeNull();
    expect(curves[0]?.values[1]).toBeNull();
  });
});
