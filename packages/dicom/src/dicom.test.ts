import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { describeSeries, encodeDicom, readDicomdir, readHeader, thumbnail, type InstanceHeader } from "./index.js";
import { fakeInstance, type FakeInstance } from "./testing.js";

function header(bytes: Uint8Array): InstanceHeader {
  const r = readHeader(bytes);
  if (r.status !== "ok") throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r.header;
}

/** A series of `n` slices for each element of `axis` (time points, b-values, echoes). */
function series(base: Omit<FakeInstance, "sop">, perPoint: readonly Partial<FakeInstance>[], slices = 2): InstanceHeader[] {
  const out: InstanceHeader[] = [];
  perPoint.forEach((p, k) => {
    for (let z = 0; z < slices; z++) out.push(header(fakeInstance({ ...base, ...p, z: z * 4, sop: `1.9.${k}.${z}` })));
  });
  return out;
}
const times = (n: number) => Array.from({ length: n }, (_, k) => ({ temporal: k + 1 }));
const types = (h: InstanceHeader[]) => describeSeries(h).types;

describe("DIR-006 header reading and quarantine reasons", () => {
  it("DIR-006 reads identifiers, patient data and UTF-8 names", () => {
    const h = header(fakeInstance({ sop: "1.2.3.4.5", description: "Séries T1" }));
    expect(h).toMatchObject({ sopInstanceUid: "1.2.3.4.5", studyInstanceUid: "1.2.3", seriesInstanceUid: "1.2.3.4", patientName: "PHANTOM^SYNTHETIC", seriesDescription: "Séries T1", seriesNumber: 7, magneticFieldStrength: 3, rows: 4, columns: 4, hasPixelData: true });
  });

  it("DIR-006 quarantines a file that is not DICOM", () => {
    const r = readHeader(new TextEncoder().encode("this is a text file, not an image at all"));
    expect(r).toMatchObject({ status: "quarantine", reason: "not-dicom" });
  });

  it("DIR-006 quarantines a truncated file", () => {
    const full = fakeInstance({ sop: "1.2.3.9", rows: 64, cols: 64 });
    const r = readHeader(full.subarray(0, full.length - 3000));
    expect(r).toMatchObject({ status: "quarantine", reason: "unreadable" });
  });

  it("DIR-006 quarantines an image without pixel data", () => {
    expect(readHeader(fakeInstance({ sop: "1.2.3.10", pixels: false }))).toMatchObject({ status: "quarantine", reason: "no-pixel-data" });
  });

  it("DIR-006 quarantines an instance without a Series Instance UID", () => {
    const r = readHeader(encodeDicom({ "00080016": { vr: "UI", value: "1.2.840.10008.5.1.4.1.1.4" }, "00080018": { vr: "UI", value: "1.2.3.11" }, "0020000D": { vr: "UI", value: "1.2" } }));
    expect(r).toMatchObject({ status: "quarantine", reason: "missing-uid", detail: "Series Instance UID" });
  });

  it("DIR-006 accepts a spectroscopy object without pixel data", () => {
    expect(readHeader(fakeInstance({ sop: "1.2.3.12", sopClass: "1.2.840.10008.5.1.4.1.1.4.2", pixels: false, rows: 1, cols: 1 })).status).toBe("ok");
  });

  it("DIR-001 skips the DICOMDIR itself and lists its referenced files", () => {
    const dir = encodeDicom({
      "00080016": { vr: "UI", value: "1.2.840.10008.1.3.10" },
      "00080018": { vr: "UI", value: "1.2.3.13" },
      "00041220": { vr: "SQ", value: [{ "00041430": { vr: "CS", value: "IMAGE" }, "00041500": { vr: "CS", value: ["DICOM", "ST000", "IM000001"] } }, { "00041430": { vr: "CS", value: "IMAGE" }, "00041500": { vr: "CS", value: ["DICOM", "ST000", "IM000002"] } }] },
    });
    expect(readHeader(dir)).toEqual({ status: "skip", why: "dicomdir" });
    expect(readDicomdir(dir)).toEqual([["DICOM", "ST000", "IM000001"], ["DICOM", "ST000", "IM000002"]]);
  });
});

describe("DIR-003 series aggregation", () => {
  it("DIR-003 counts dynamics, slices and images", () => {
    const d = describeSeries(series({ te: 30, contrast: "Gd" }, times(40), 4)).facts;
    expect(d).toMatchObject({ dynamics: 40, slices: 4, imageCount: 160, echoes: 1, hasGeometry: true });
  });

  it("DIR-003 counts b-values and gradient lines, opposite vectors once", () => {
    const pts: Partial<FakeInstance>[] = [{ b: 0 }, { b: 1000, grad: [1, 0, 0] }, { b: 1000, grad: [-1, 0, 0] }, { b: 1000, grad: [0, 1, 0] }];
    const d = describeSeries(series({ te: 80 }, pts)).facts;
    expect(d.bValues).toEqual([0, 1000]);
    expect(d.gradientDirections).toBe(2);
    expect(d.dynamics).toBe(1);
  });

  it("DIR-003 counts echoes at one slice position", () => {
    const d = describeSeries(series({ tr: 50 }, [5, 10, 15, 20].map((te, i) => ({ te, echo: i + 1 })))).facts;
    expect(d).toMatchObject({ echoes: 4, dynamics: 1, slices: 2 });
  });
});

describe("DIR-003 series-type classifier (ALGORITHMS.md §13)", () => {
  const dirs = (n: number) => [{ b: 0 }, ...Array.from({ length: n }, (_, i) => ({ b: 1000, grad: [Math.cos(i), Math.sin(i), i / n] as [number, number, number] }))];

  it("DIR-003 Secondary Capture is final", () => {
    expect(types(series({ sopClass: "1.2.840.10008.5.1.4.1.1.7", te: 30 }, times(10)))).toEqual(["SECONDARY_CAPTURE"]);
  });
  it("DIR-003 spectroscopy: one voxel is SVS, a grid is CSI", () => {
    const mrs = { sopClass: "1.2.840.10008.5.1.4.1.1.4.2", pixels: false as const };
    expect(types([header(fakeInstance({ ...mrs, sop: "1.1", rows: 1, cols: 1 }))])).toEqual(["MRS_SVS"]);
    expect(types([header(fakeInstance({ ...mrs, sop: "1.2", rows: 16, cols: 16 }))])).toEqual(["MRS_CSI"]);
  });
  it("DIR-003 derived images are derived maps", () => {
    expect(types(series({ imageType: ["DERIVED", "PRIMARY", "ADC"], te: 80 }, [{}]))).toEqual(["DERIVED_MAP"]);
  });
  it("DIR-003 diffusion: DWI, and DTI with at least 6 directions", () => {
    expect(types(series({ te: 80 }, [{ b: 0 }, { b: 500 }, { b: 1000 }]))).toEqual(["DWI"]);
    expect(types(series({ te: 80 }, dirs(5)))).toEqual(["DWI"]);
    expect(types(series({ te: 80 }, dirs(6)))).toEqual(["DTI", "DWI"]);
  });
  it("DIR-003 dynamic series by attributes: short TE is DCE, contrast with T2* is DSC, else BOLD", () => {
    expect(types(series({ te: 2, tr: 5, contrast: "Gd" }, times(12)))).toEqual(["DCE", "T1"]);
    expect(types(series({ te: 30, tr: 1500, contrast: "Gd" }, times(60)))).toEqual(["DSC"]);
    expect(types(series({ te: 30, tr: 2000 }, times(100)))).toEqual(["FMRI"]);
  });
  it("DIR-003 dynamic keywords win over attributes", () => {
    expect(types(series({ te: 30, description: "ep2d_perf" }, times(50)))).toEqual(["DSC"]);
    expect(types(series({ te: 30, contrast: "Gd", description: "ep2d_bold_moco" }, times(50)))).toEqual(["FMRI"]);
    expect(types(series({ te: 30, description: "Dyn T1 post" }, times(50)))).toEqual(["DCE", "T1"]);
  });
  it("DIR-003 multi-echo, SWI and FLAIR", () => {
    expect(types(series({ tr: 50 }, [5, 10].map((te, i) => ({ te, echo: i + 1 }))))).toEqual(["MULTI_ECHO"]);
    expect(types(series({ te: 20, tr: 30, imageType: ["ORIGINAL", "PRIMARY", "M", "SWI"] }, [{}]))).toEqual(["SWI"]);
    expect(types(series({ te: 120, tr: 4800, ti: 2500, scanning: ["SE", "IR"] }, [{}]))).toEqual(["FLAIR"]);
    expect(types(series({ te: 20, tr: 9000, description: "ax FLAIR" }, [{}]))).toEqual(["FLAIR"]);
  });
  it("DIR-003 T1, VFA reference and T2", () => {
    expect(types(series({ te: 2, tr: 5, flip: 15, scanning: ["GR"] }, [{}]))).toEqual(["VFA_REFERENCE", "T1"]);
    expect(types(series({ te: 10, tr: 500, flip: 90, scanning: ["SE"] }, [{}]))).toEqual(["T1"]);
    expect(types(series({ te: 3, tr: 8, ti: 900, flip: 8, scanning: ["GR", "IR"] }, [{}]))).toEqual(["T1"]);
    expect(types(series({ te: 90, tr: 4000, scanning: ["SE"] }, [{}]))).toEqual(["T2"]);
  });
  it("DIR-003 a series that matches no rule has no type", () => {
    expect(types(series({ te: 30, tr: 1000 }, [{}]))).toEqual([]);
  });
});

describe("DIR-002 thumbnails", () => {
  it("DIR-002 fits the frame in the box, keeps the aspect ratio and windows to 8 bits", () => {
    const ramp = Uint16Array.from({ length: 128 * 64 }, (_, i) => Math.floor((i * 65535) / (128 * 64 - 1)));
    const bytes = fakeInstance({ sop: "1.5", rows: 128, cols: 64, pixels: ramp });
    const r = readHeader(bytes);
    if (r.status !== "ok") throw new Error("parse");
    const t = thumbnail(r.dataSet, r.header.transferSyntaxUid, 64);
    expect(t).toMatchObject({ width: 32, height: 64 });
    expect(t?.pixels[0]).toBe(0);
    expect(t?.pixels[t.pixels.length - 1]).toBe(255);
  });
});

// Classifies the generated phantoms when they are present (`pnpm phantoms`); CI generates them for the engine job only.
const PHANTOMS = resolve(import.meta.dirname, "../../../data/phantoms");
describe.runIf(existsSync(PHANTOMS))("DIR-003 classifier on the phantom series", () => {
  const cases: [string, string[]][] = [
    ["dsc_snr50_tr2.1/dicom", ["DSC"]],
    ["dce_semiquant/dicom", ["DCE", "T1"]],
    ["dce_tofts/dicom_vfa5", ["VFA_REFERENCE", "T1"]],
    ["dti_6dir_snrinf/dicom", ["DTI", "DWI"]],
    ["ivim_dki/dicom", ["DWI"]],
    ["fmri_block/dicom", ["FMRI"]],
    ["flair_baseline/dicom", ["FLAIR"]],
    ["brain_swi_epi/dicom", ["SWI"]],
    ["brain_multi_echo_gre/dicom", ["MULTI_ECHO"]],
  ];
  it.each(cases)("DIR-003 %s", (folder, expected) => {
    const dir = join(PHANTOMS, folder);
    const headers = readdirSync(dir).filter((f) => f.endsWith(".dcm")).map((f) => header(readFileSync(join(dir, f))));
    expect(describeSeries(headers).types).toEqual(expected);
  });
});
