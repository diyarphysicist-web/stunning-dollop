import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

describe("GEN-238 compressed images and GEN-239 lossy notice", () => {
  it("GEN-238 an image without a codec names its transfer syntax", async () => {
    store({ sop: "6.1" });
    const px = await imagePixels(index, "6.1", 0, async () => ({ status: "unsupported", transferSyntaxUid: "1.2.840.10008.1.2.4.100" }));
    expect(px).toEqual({ status: "unsupported", sopInstanceUid: "6.1", transferSyntaxUid: "1.2.840.10008.1.2.4.100" });
  });
  it("GEN-239 lossy compression recorded in the header marks the image and its series", () => {
    store({ series: "6.9", sop: "6.2", extra: { "00282110": { vr: "CS", value: "01" } } });
    store({ series: "6.9", sop: "6.3", z: 4 });
    const s = seriesStack(index, "6.9");
    expect(s.images.map((i) => [i.sopInstanceUid, i.lossy])).toEqual([
      ["6.2", true],
      ["6.3", false],
    ]);
    const study = index.studies("")[0]?.studyInstanceUid ?? "";
    expect(index.series(study)[0]?.lossy).toBe(true);
  });
});

// Codec phantoms (`pnpm phantoms`); CI sets NEUROMR_REQUIRE_PHANTOMS so they cannot be skipped there.
const CODECS = resolve(import.meta.dirname, "../../../../../data/phantoms/codecs");
describe.runIf(process.env.NEUROMR_REQUIRE_PHANTOMS === "1" || existsSync(CODECS))("GEN-238 codec phantoms through the store", () => {
  it.each(["jpeg-ls", "j2k", "rle", "jpeg-extended"])("GEN-238 %s decodes to the uncompressed reference's modality values", async (key) => {
    const first = (dir: string) => join(CODECS, dir, readdirSync(join(CODECS, dir)).filter((f) => f.endsWith(".dcm")).sort()[0] as string);
    const add = (path: string) => {
      const bytes = readFileSync(path);
      const r = readHeader(bytes);
      if (r.status !== "ok") throw new Error("parse");
      index.addInstance(r.header, path, bytes.length);
      index.refreshSeries(r.header.seriesInstanceUid, true);
      return r.header;
    };
    const h = add(first(key));
    const ref = add(first(key === "jpeg-extended" ? "reference-12" : "reference-16"));
    const got = await imagePixels(index, h.sopInstanceUid);
    const want = await imagePixels(index, ref.sopInstanceUid);
    if (got.status !== "ok" || want.status !== "ok") throw new Error(`${got.status} / ${want.status}`);
    const lossy = key === "j2k" || key === "jpeg-extended";
    expect(seriesStack(index, h.seriesInstanceUid).images[0]?.lossy).toBe(lossy);
    let err = 0;
    for (let i = 0; i < got.values.length; i++) err += Math.abs((got.values[i] as number) - (want.values[i] as number));
    if (lossy) expect(err / got.values.length).toBeLessThan(0.02 * Math.max(...want.values));
    else expect(err).toBe(0);
  });
});

// Enhanced phantoms (`pnpm phantoms`); CI sets NEUROMR_REQUIRE_PHANTOMS so they cannot be skipped there.
const ENHANCED = resolve(import.meta.dirname, "../../../../../data/phantoms/enhanced");
describe.runIf(process.env.NEUROMR_REQUIRE_PHANTOMS === "1" || existsSync(ENHANCED))("GEN-240 enhanced multi-frame through the store", () => {
  it("GEN-240 a multi-frame DSC opens as slices × dynamics; each cell decodes its own frame", async () => {
    const add = (dir: string) => {
      let series = "";
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".dcm"))) {
        const path = join(dir, f);
        const bytes = readFileSync(path);
        const r = readHeader(bytes);
        if (r.status !== "ok") throw new Error("parse");
        index.addInstance(r.header, path, bytes.length);
        series = r.header.seriesInstanceUid;
      }
      index.refreshSeries(series, true);
      return series;
    };
    const enh = seriesStack(index, add(join(ENHANCED, "dsc", "enhanced")));
    const cls = seriesStack(index, add(join(ENHANCED, "dsc", "classic")));
    expect(enh.axis).toBe("dynamic");
    expect([enh.grid.length, enh.grid[0]?.length]).toEqual([cls.grid.length, cls.grid[0]?.length]);
    expect(enh.points).toEqual(cls.points);
    expect(enh.images).toHaveLength(cls.images.length);
    const study = index.studies("")[0]?.studyInstanceUid ?? "";
    const row = index.series(study).find((s) => s.seriesInstanceUid === enh.seriesInstanceUid);
    expect(row).toMatchObject({ imageCount: cls.images.length, types: ["DSC"] });

    const s = enh.grid.length - 1;
    const p = (enh.grid[0]?.length ?? 1) - 1;
    const info = enh.images.find((i) => i.ref === enh.grid[s]?.[p]);
    const twin = cls.images.find((i) => i.sopInstanceUid === cls.grid[s]?.[p]);
    if (!info || !twin) throw new Error("cell missing");
    expect(info.frame).toBeGreaterThan(0);
    expect(info.position).toEqual(twin.position);
    const a = await imagePixels(index, info.sopInstanceUid, info.frame);
    const b = await imagePixels(index, twin.sopInstanceUid);
    if (a.status !== "ok" || b.status !== "ok") throw new Error("decode");
    expect(a.values).toEqual(b.values);
  });
});
