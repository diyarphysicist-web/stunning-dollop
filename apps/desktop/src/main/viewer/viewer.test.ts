import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHeader } from "@neuromr/dicom";
import { fakeInstance, type FakeInstance } from "@neuromr/dicom/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudyIndex } from "../directory/study-index.js";
import { imageAttributes, imagePixels, seriesStack } from "./viewer.js";

let dir: string;
let index: StudyIndex;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "neuromr-viewer-"));
  mkdirSync(join(dir, "store"));
  index = new StudyIndex(join(dir, "index.sqlite"));
});
afterEach(() => {
  index.close();
  rmSync(dir, { recursive: true, force: true });
});

function store(o: FakeInstance): string {
  const bytes = fakeInstance(o);
  const r = readHeader(bytes);
  if (r.status !== "ok") throw new Error("parse");
  const path = join(dir, "store", `${r.header.sopInstanceUid}.dcm`);
  writeFileSync(path, bytes);
  index.addInstance(r.header, path, bytes.length);
  index.refreshSeries(r.header.seriesInstanceUid, true);
  return path;
}

describe("GEN-230 viewer stacks from the local store", () => {
  it("GEN-021 a dynamic series becomes slices × dynamics with patient overlay facts", () => {
    for (let k = 0; k < 3; k++) for (let z = 0; z < 2; z++) store({ series: "1.9", sop: `1.9.${k}.${z}`, description: "DSC perf", temporal: k + 1, z: z * 4, te: 30, tr: 1500 });
    const s = seriesStack(index, "1.9");
    expect(s.axis).toBe("dynamic");
    expect(s.grid).toEqual([
      ["1.9.0.0", "1.9.1.0", "1.9.2.0"],
      ["1.9.0.1", "1.9.1.1", "1.9.2.1"],
    ]);
    expect(s.description).toBe("DSC perf");
    expect(s.images).toHaveLength(6);
    expect(s.images[0]?.orientation).toHaveLength(6);
    expect(s.studyDate).toMatch(/^\d{4}-\d{2}-\d{2}$|^$/);
  });

  it("GEN-230 an unknown series is an error, not an empty viewer", () => {
    expect(() => seriesStack(index, "4.4")).toThrow();
  });
});

describe("GEN-234 pixels are read in main by UID", () => {
  it("GEN-232 returns modality values as a Float32Array", async () => {
    store({ sop: "2.1", pixels: Uint16Array.from({ length: 16 }, (_, i) => i), extra: { "00281053": { vr: "DS", value: 2 } } });
    const px = await imagePixels(index, "2.1");
    expect(px.status).toBe("ok");
    if (px.status !== "ok") return;
    expect(px.values).toBeInstanceOf(Float32Array);
    expect(px.values[15]).toBe(30);
  });

  it("GEN-234 unknown UIDs and vanished files report missing", async () => {
    expect((await imagePixels(index, "3.3")).status).toBe("missing");
    const path = store({ sop: "3.4" });
    rmSync(path);
    expect((await imagePixels(index, "3.4")).status).toBe("missing");
  });
});

describe("GEN-233 DICOM inspector", () => {
  it("GEN-233 lists recorded attributes with units; identifiers stay text", () => {
    store({ sop: "5.1", te: 30, tr: 1500, series: "5.0" });
    const rows = imageAttributes(index, "5.1");
    expect(rows.find((r) => r.keyword === "RepetitionTime")).toEqual({ tag: "(0018,0080)", keyword: "RepetitionTime", value: 1500, unit: "ms" });
    expect(rows.find((r) => r.keyword === "SOPInstanceUID")?.value).toBe("5.1");
    expect(rows.some((r) => r.keyword === "InversionTime")).toBe(false);
    expect(imageAttributes(index, "nope")).toEqual([]);
  });
});
