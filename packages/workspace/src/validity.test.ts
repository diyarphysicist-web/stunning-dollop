import { describe, expect, it } from "vitest";
import type { PackageId, SeriesSummary } from "@neuromr/contracts";
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
    const r = packageValidity("dsc", [s({ types: ["DSC"], dynamics: 40, isDynamic: true, preprocessingDone: false })]);
    expect(r).toEqual({ valid: false, reason: "Waiting for import and pre-processing to finish." });
  });

  it("SAFE-020 blocks series from different patients", () => {
    const r = packageValidity("dsc", [s({ types: ["DSC"], dynamics: 40, isDynamic: true }), s({ patientId: "P2" })]);
    expect(r.valid).toBe(false);
  });

  it("DIR-004 uses the DIR-003 type: a DSC series opens only DSC, Longitudinal among single-series packages", () => {
    const dscSeries = s({ types: ["DSC"], dynamics: 60, isDynamic: true });
    const valid = (pkg: PackageId) => packageValidity(pkg, [dscSeries]).valid;
    expect(valid("dsc")).toBe(true);
    expect(valid("longitudinal")).toBe(true);
    for (const pkg of ["dce", "permeability", "fmri", "subtraction", "diffusion", "tractography", "adv-diffusion", "echo", "spectroscopy"] as const) {
      expect(valid(pkg), pkg).toBe(false);
    }
    expect(packageValidity("dce", [dscSeries])).toEqual({ valid: false, reason: "Needs a DCE (T1-weighted dynamic) series." });
    expect(packageValidity("fmri", [dscSeries])).toEqual({ valid: false, reason: "Needs a BOLD fMRI series." });
    expect(packageValidity("subtraction", [dscSeries])).toEqual({
      valid: false,
      reason: "Not for DSC, BOLD, spectroscopy or screen-capture series.",
    });
  });

  it("DIR-004 a DCE or BOLD series is not valid for DSC", () => {
    expect(packageValidity("dsc", [s({ types: ["DCE"], dynamics: 60, isDynamic: true })]).valid).toBe(false);
    expect(packageValidity("dsc", [s({ types: ["FMRI"], dynamics: 120, isDynamic: true })]).valid).toBe(false);
  });

  it("DCE-001 needs a DCE series with at least 4 dynamics", () => {
    expect(packageValidity("dce", [s({ types: ["DCE"], dynamics: 3 })]).valid).toBe(false);
    expect(packageValidity("dce", [s({ types: ["DCE"], dynamics: 4 })]).valid).toBe(true);
    expect(packageValidity("dce", [s({ types: ["T1"], dynamics: 4 })]).valid).toBe(false);
  });

  it("DSC-001 needs a DSC series with at least 5 dynamics", () => {
    expect(packageValidity("dsc", [s({ types: ["DSC"], dynamics: 4, isDynamic: true })]).valid).toBe(false);
    expect(packageValidity("dsc", [s({ types: ["DSC"], dynamics: 5, isDynamic: true })]).valid).toBe(true);
  });

  it("PERM-001 needs a DCE series with 20 dynamics and a VFA reference", () => {
    const dceSeries = s({ types: ["DCE"], dynamics: 60, isDynamic: true, flipAngleDeg: 15 });
    const ref5 = s({ types: ["VFA_REFERENCE", "T1"], flipAngleDeg: 5 });
    expect(packageValidity("permeability", [s({ types: ["DCE"], dynamics: 19 }), ref5]).valid).toBe(false);
    expect(packageValidity("permeability", [dceSeries]).valid).toBe(false);
    expect(packageValidity("permeability", [dceSeries, ref5]).valid).toBe(true);
    const dscSeries = s({ types: ["DSC"], dynamics: 60, isDynamic: true, flipAngleDeg: 90 });
    expect(packageValidity("permeability", [dscSeries, ref5])).toEqual({
      valid: false,
      reason: "Needs a DCE series with at least 20 dynamics.",
    });
  });

  it("PERM-003 single reference must differ in flip angle", () => {
    const dceSeries = s({ types: ["DCE"], dynamics: 60, isDynamic: true, flipAngleDeg: 15 });
    const ref15 = s({ types: ["VFA_REFERENCE"], flipAngleDeg: 15 });
    expect(packageValidity("permeability", [dceSeries, ref15]).valid).toBe(false);
  });

  it("DIF-001 needs a DWI/DTI series with 2 distinct b-values; TRK-001 needs DTI with 6 directions", () => {
    expect(packageValidity("diffusion", [s({ types: ["DWI"], bValues: [0, 0, 0] })])).toEqual({
      valid: false,
      reason: "Needs at least 2 b-values.",
    });
    expect(packageValidity("diffusion", [s({ types: ["T2"], bValues: [0, 1000] })])).toEqual({
      valid: false,
      reason: "Needs a diffusion series (DWI or DTI).",
    });
    const dwi = s({ types: ["DWI"], bValues: [0, 1000], gradientDirections: 3 });
    expect(packageValidity("diffusion", [dwi]).valid).toBe(true);
    expect(packageValidity("tractography", [dwi])).toEqual({ valid: false, reason: "Needs a DTI series." });
    const dti = s({ types: ["DTI"], bValues: [0, 1000], gradientDirections: 3 });
    expect(packageValidity("tractography", [dti]).valid).toBe(false);
    expect(packageValidity("tractography", [{ ...dti, gradientDirections: 6 }]).valid).toBe(true);
  });

  it("ADV-001 needs a DWI or DTI series with 2 b-values", () => {
    expect(packageValidity("adv-diffusion", [s({ types: ["DWI"], bValues: [0, 500, 1000] })]).valid).toBe(true);
    expect(packageValidity("adv-diffusion", [s({ types: ["FLAIR"], bValues: [0, 1000] })]).valid).toBe(false);
  });

  it("FMRI-001 needs a BOLD series with at least 20 dynamics", () => {
    expect(packageValidity("fmri", [s({ types: ["FMRI"], dynamics: 19, isDynamic: true })]).valid).toBe(false);
    expect(packageValidity("fmri", [s({ types: ["FMRI"], dynamics: 120, isDynamic: true })]).valid).toBe(true);
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

  it("SUB-003 needs 2 dynamics or a second imaging series, never DSC, BOLD, MRS or SC", () => {
    expect(packageValidity("subtraction", [s({ types: ["T1"], dynamics: 1 })]).valid).toBe(false);
    expect(packageValidity("subtraction", [s({ types: ["T1"], dynamics: 1 }), s({ types: ["T1"] })]).valid).toBe(true);
    expect(packageValidity("subtraction", [s({ types: ["DCE"], dynamics: 40, isDynamic: true })]).valid).toBe(true);
    expect(packageValidity("subtraction", [s({ types: ["FMRI"], dynamics: 120, isDynamic: true })]).valid).toBe(false);
    expect(packageValidity("subtraction", [s({ types: ["T1"] }), s({ types: ["SECONDARY_CAPTURE"] })]).valid).toBe(false);
  });

  it("ECHO-001 needs a multi-echo series with at least 2 echoes", () => {
    expect(packageValidity("echo", [s({ types: ["MULTI_ECHO"], echoes: 1 })]).valid).toBe(false);
    expect(packageValidity("echo", [s({ types: ["MULTI_ECHO"], echoes: 4 })]).valid).toBe(true);
    expect(packageValidity("echo", [s({ types: ["DSC"], echoes: 2 })])).toEqual({ valid: false, reason: "Needs a multi-echo series." });
  });
});
