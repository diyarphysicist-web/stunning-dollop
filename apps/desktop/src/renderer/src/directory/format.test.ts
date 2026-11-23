import type { SeriesRow } from "@neuromr/contracts";
import { describe, expect, it } from "vitest";
import { ageYears, dimensions, localTime } from "./format.js";

const base: SeriesRow = { seriesInstanceUid: "1", studyInstanceUid: "1", patientId: "P", description: "", types: [], dynamics: 1, echoes: 1, bValues: [], gradientDirections: 0, isDynamic: false, hasGeometry: true, preprocessingDone: true, seriesNumber: 1, status: "ready", imageCount: 1, slices: 1, rows: 64, columns: 64, thumbnail: null, lossy: false };
const s = (o: Partial<SeriesRow>): SeriesRow => ({ ...base, ...o });

describe("DIR-009 series dimensions as the design writes them (GEN-201)", () => {
  it("DIR-009 dynamic, diffusion, echo and static series", () => {
    expect(dimensions(s({ types: ["DSC"], isDynamic: true, dynamics: 60, slices: 4, imageCount: 240 }))).toBe("60 dyn × 4 sl · 64²");
    expect(dimensions(s({ types: ["DTI", "DWI"], bValues: [0, 1000], gradientDirections: 32, slices: 2, imageCount: 66 }))).toBe("33 vol × 2 sl · 32 dir");
    expect(dimensions(s({ types: ["DWI"], bValues: [0, 10, 20, 50, 100, 200, 400, 800, 1000, 1500, 2000, 2500], slices: 2, imageCount: 24 }))).toBe("12 b × 2 sl");
    expect(dimensions(s({ types: ["MULTI_ECHO"], echoes: 4, slices: 32, imageCount: 128 }))).toBe("4 echoes × 32 sl · 64²");
    expect(dimensions(s({ types: ["VFA_REFERENCE", "T1"], slices: 2, rows: 48, columns: 48, flipAngleDeg: 5 }))).toBe("2 sl · 48² · FA 5°");
    expect(dimensions(s({ slices: 176, rows: 1024, columns: 1024 }))).toBe("176 sl · 1,024²");
    expect(dimensions(s({ rows: 256, columns: 192 }))).toBe("1 sl · 192 × 256");
  });
  it("DIR-006 quarantine times are local wall-clock times", () => {
    const d = new Date(2026, 10, 23, 9, 5, 7);
    expect(localTime(d.toISOString())).toBe("09:05:07");
    expect(localTime("nonsense")).toBe("");
  });
  it("SAFE-001 age at the study date", () => {
    expect(ageYears("1970-01-01", "2026-01-01")).toBe(56);
    expect(ageYears("1970-06-02", "2026-06-01")).toBe(55);
    expect(ageYears("", "2026-06-01")).toBeUndefined();
  });
});
