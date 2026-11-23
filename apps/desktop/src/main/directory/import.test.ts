import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { ImportProgress } from "@neuromr/contracts";
import { encodeDicom } from "@neuromr/dicom";
import { fakeInstance } from "@neuromr/dicom/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runImport, storePath, uidComponent } from "./import.js";
import { StudyIndex } from "./study-index.js";

let dir: string;
let index: StudyIndex;
const opened: StudyIndex[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "neuromr-import-"));
  mkdirSync(join(dir, "in"));
  index = open();
});
afterEach(() => {
  for (const i of opened.splice(0)) i.close();
  rmSync(dir, { recursive: true, force: true });
});

function open(): StudyIndex {
  const i = new StudyIndex(join(dir, "index.sqlite"));
  opened.push(i);
  return i;
}

/** Writes a DSC-like series: `dyn` time points × `slices` slices. */
function writeDsc(folder: string, series = "1.2.3.150", dyn = 6, slices = 2): void {
  mkdirSync(join(dir, "in", folder), { recursive: true });
  for (let k = 0; k < dyn; k++)
    for (let z = 0; z < slices; z++) {
      const bytes = fakeInstance({ series, sop: `${series}.${k}.${z}`, description: "DSC perf", te: 30, tr: 1500, contrast: "Gd", temporal: k + 1, z: z * 4, rows: 16, cols: 16 });
      writeFileSync(join(dir, "in", folder, `IM${k}_${z}`), bytes);
    }
}

async function run(source: "folder" | "dicomdir" = "folder", root = join(dir, "in"), signal = new AbortController().signal, events: ImportProgress[] = []) {
  const importId = index.startImport(source, root);
  return runImport({ index, importId, source, root, storeRoot: join(dir, "store"), signal, onProgress: (p) => events.push(p), flushMs: 0 });
}

describe("DIR-007 import into the local store and index", () => {
  it("DIR-007 copies instances into the store and indexes study and series", async () => {
    writeDsc("a");
    const p = await run();
    expect(p).toMatchObject({ phase: "done", found: 12, read: 12, imported: 12, duplicates: 0, quarantined: 0, notDicom: 0 });
    const [study] = index.studies("");
    expect(study).toMatchObject({ patientName: "PHANTOM^SYNTHETIC", patientId: "NMR-PHANTOM-001", studyDate: "2026-01-01", seriesCount: 1, imageCount: 12, modality: "MR", fieldStrengthT: 3 });
    const [series] = index.series(study?.studyInstanceUid ?? "");
    expect(series).toMatchObject({ types: ["DSC"], dynamics: 6, slices: 2, imageCount: 12, status: "ready", preprocessingDone: true, isDynamic: true });
    expect(series?.thumbnail).toMatch(/^data:image\/png;base64,/);
    expect(readdirSync(join(dir, "store", "1.2.3", "1.2.3.150"))).toHaveLength(12);
  });

  it("DIR-007 importing the same folder twice changes nothing", async () => {
    writeDsc("a");
    await run();
    const before = index.indexVersion();
    const p = await run();
    expect(p).toMatchObject({ imported: 0, duplicates: 12 });
    expect(index.studies("")[0]?.imageCount).toBe(12);
    expect(index.indexVersion()).toBe(before);
  });

  it("DIR-007 the index survives a restart", async () => {
    writeDsc("a");
    await run();
    index.close();
    opened.splice(opened.indexOf(index), 1);
    const reopened = open();
    expect(reopened.studies("")).toHaveLength(1);
    expect(reopened.lastImport()).toMatchObject({ phase: "done", imported: 12 });
  });

  it("DIR-007 store paths never come from file contents", () => {
    expect(uidComponent("1.2.840.113619")).toBe("1.2.840.113619");
    expect(uidComponent("..\\..\\Windows")).toMatch(/^[0-9a-f]{40}$/);
    const h = { studyInstanceUid: "../../x", seriesInstanceUid: "1.2", sopInstanceUid: "C:\\evil" } as Parameters<typeof storePath>[1];
    expect(relative(join(dir, "store"), storePath(join(dir, "store"), h)).startsWith("..")).toBe(false);
  });

  it("DIR-009 search matches patient name, ID and accession; wildcards are literal", async () => {
    writeDsc("a");
    await run();
    expect(index.studies("phantom synth")).toHaveLength(1);
    expect(index.studies("NMR-PHANTOM")).toHaveLength(1);
    expect(index.studies("nobody")).toHaveLength(0);
    expect(index.studies("%")).toHaveLength(0);
  });
});

describe("DIR-006 quarantine", () => {
  it("DIR-006 quarantines broken DICOM, skips non-DICOM files, and imports the rest", async () => {
    writeDsc("a");
    writeFileSync(join(dir, "in", "readme.txt"), "not an image");
    writeFileSync(join(dir, "in", "nopixels.dcm"), fakeInstance({ sop: "9.9.1", pixels: false }));
    const full = fakeInstance({ sop: "9.9.2", rows: 64, cols: 64 });
    writeFileSync(join(dir, "in", "truncated.dcm"), full.subarray(0, full.length - 2000));
    const p = await run();
    expect(p).toMatchObject({ phase: "done", imported: 12, notDicom: 1, quarantined: 2 });
    const q = index.quarantine();
    expect(q.map((e) => [e.path.endsWith("nopixels.dcm") || e.path.endsWith("truncated.dcm"), e.reason]).sort()).toEqual([[true, "no-pixel-data"], [true, "unreadable"]]);
  });

  it("DIR-001 imports the files a DICOMDIR lists and quarantines missing ones", async () => {
    writeDsc("DICOM");
    const listed = readdirSync(join(dir, "in", "DICOM")).slice(0, 3);
    const record = (name: string) => ({ "00041430": { vr: "CS", value: "IMAGE" }, "00041500": { vr: "CS", value: ["DICOM", name] } });
    const records = [...listed.map(record), record("GONE"), { "00041430": { vr: "CS", value: "IMAGE" }, "00041500": { vr: "CS", value: ["..", "outside"] } }];
    writeFileSync(join(dir, "in", "DICOMDIR"), encodeDicom({ "00080016": { vr: "UI", value: "1.2.840.10008.1.3.10" }, "00080018": { vr: "UI", value: "5.5" }, "00041220": { vr: "SQ", value: records } }));
    const p = await run("dicomdir", join(dir, "in", "DICOMDIR"));
    expect(p).toMatchObject({ phase: "done", imported: 3, quarantined: 1 });
    expect(index.quarantine()[0]?.reason).toBe("missing-file");
  });
});

describe("DIR-008 progress and cancel", () => {
  it("DIR-008 reports progress and keeps what was stored when cancelled", async () => {
    writeDsc("a", "1.2.3.150", 10, 2);
    const ctl = new AbortController();
    const events: ImportProgress[] = [];
    const importId = index.startImport("folder", join(dir, "in"));
    const p = await runImport({
      index, importId, source: "folder", root: join(dir, "in"), storeRoot: join(dir, "store"), signal: ctl.signal, flushMs: 0,
      onProgress: (e) => {
        events.push(e);
        if (e.read === 5) ctl.abort();
      },
    });
    expect(p.phase).toBe("cancelled");
    expect(p.imported).toBe(5);
    expect(events.map((e) => e.phase)).toContain("reading");
    const [series] = index.series(index.studies("")[0]?.studyInstanceUid ?? "");
    expect(series).toMatchObject({ imageCount: 5, status: "ready" });
  });

  it("DIR-005 series show as importing until the import finishes", async () => {
    writeDsc("a", "1.2.3.150", 4, 2);
    const states: string[] = [];
    const importId = index.startImport("folder", join(dir, "in"));
    await runImport({
      index, importId, source: "folder", root: join(dir, "in"), storeRoot: join(dir, "store"), signal: new AbortController().signal, flushMs: 0,
      onProgress: (e) => {
        const study = index.studies("")[0];
        if (study && e.phase === "reading") states.push(index.series(study.studyInstanceUid)[0]?.status ?? "");
      },
    });
    expect(states).toContain("importing");
    expect(index.series(index.studies("")[0]?.studyInstanceUid ?? "")[0]?.status).toBe("ready");
  });

  it("DIR-005 a crash mid-import is finished on the next start", async () => {
    writeDsc("a", "1.2.3.150", 2, 2);
    await run();
    index.db.prepare("UPDATE series SET status = 'importing', thumbnail = NULL").run();
    index.db.prepare("UPDATE imports SET phase = 'reading'").run();
    index.recoverInterrupted();
    expect(index.series(index.studies("")[0]?.studyInstanceUid ?? "")[0]).toMatchObject({ status: "ready" });
    expect(index.lastImport()).toMatchObject({ phase: "failed", error: "interrupted" });
  });
});
