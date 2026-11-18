import { describe, expect, it } from "vitest";
import type { SeriesSummary } from "@neuromr/contracts";
import { packageValidity } from "./validity.js";

const base: SeriesSummary = {
  seriesInstanceUid: "1.2.3",
  studyInstanceUid: "1.2",
  patientId: "P1",
  description: "series",
  types: [],
  dynamics: 1,
  echoes: 1,
  bValues: [],
  gradientDirections: 0,
  isDynamic: false,
  hasGeometry: true,
  preprocessingDone: true,
};
const s = (over: Partial<SeriesSummary>): SeriesSummary => ({ ...base, ...over });

describe("DIR-004 package validity", () => {
  it("DIR-004 blocks until pre-processing is done (GEN-191)", () => {
    const r = packageValidity("dsc", [s({ dynamics: 40, isDynamic: true, preprocessingDone: false })]);
    expect(r).toEqual({ valid: false, reason: "Waiting for import and pre-processing to finish." });
  });

  it("SAFE-020 blocks series from different patients", () => {
    const r = packageValidity("dsc", [s({ dynamics: 40, isDynamic: true }), s({ patientId: "P2" })]);
    expect(r.valid).toBe(false);
  });

  it("DCE-001 needs at least 4 dynamics", () => {
    expect(packageValidity("dce", [s({ dynamics: 3 })]).valid).toBe(false);
    expect(packageValidity("dce", [s({ dynamics: 4 })]).valid).toBe(true);
  });

  it("DSC-001 needs a dynamic series with at least 5 dynamics", () => {
    expect(packageValidity("dsc", [s({ dynamics: 4, isDynamic: true })]).valid).toBe(false);
    expect(packageValidity("dsc", [s({ dynamics: 5, isDynamic: true })]).valid).toBe(true);
  });

  it("PERM-001 needs 20 dynamics and a VFA reference", () => {
    const dceSeries = s({ dynamics: 60, isDynamic: true, flipAngleDeg: 15 });
    const ref5 = s({ types: ["VFA_REFERENCE"], flipAngleDeg: 5 });
    expect(packageValidity("permeability", [s({ dynamics: 19 }), ref5]).valid).toBe(false);
    expect(packageValidity("permeability", [dceSeries]).valid).toBe(false);
    expect(packageValidity("permeability", [dceSeries, ref5]).valid).toBe(true);
  });

  it("PERM-003 single reference must differ in flip angle", () => {
    const dceSeries = s({ dynamics: 60, isDynamic: true, flipAngleDeg: 15 });
    const ref15 = s({ types: ["VFA_REFERENCE"], flipAngleDeg: 15 });
    expect(packageValidity("permeability", [dceSeries, ref15]).valid).toBe(false);
  });

  it("DIF-001 needs 2 distinct b-values; TRK-001 also needs 6 directions", () => {
    expect(packageValidity("diffusion", [s({ bValues: [0, 0, 0] })])).toEqual({
      valid: false,
      reason: "Needs at least 2 b-values.",
    });
    const dwi = s({ bValues: [0, 1000], gradientDirections: 3 });
    expect(packageValidity("diffusion", [dwi]).valid).toBe(true);
    expect(packageValidity("tractography", [dwi]).valid).toBe(false);
    expect(packageValidity("tractography", [{ ...dwi, gradientDirections: 6 }]).valid).toBe(true);
  });

  it("MRS-001 needs an MRS series plus an imaging series", () => {
    const mrs = s({ types: ["MRS_SVS"], hasGeometry: false });
    expect(packageValidity("spectroscopy", [mrs]).valid).toBe(false);
    expect(packageValidity("spectroscopy", [mrs, s({ types: ["T2"] })]).valid).toBe(true);
  });

  it("LBA-001 accepts at most 4 studies", () => {
    const five = [1, 2, 3, 4, 5].map((i) => s({ studyInstanceUid: `1.${i}` }));
    expect(packageValidity("longitudinal", five).valid).toBe(false);
    expect(packageValidity("longitudinal", five.slice(0, 4)).valid).toBe(true);
  });

  it("ECHO-001 needs 2 echoes; SUB needs 2 dynamics or a second series", () => {
    expect(packageValidity("echo", [s({ echoes: 1 })]).valid).toBe(false);
    expect(packageValidity("echo", [s({ echoes: 4 })]).valid).toBe(true);
    expect(packageValidity("subtraction", [s({ dynamics: 1 })]).valid).toBe(false);
    expect(packageValidity("subtraction", [s({ dynamics: 1 }), s({})]).valid).toBe(true);
  });
});
