import type { PackageId, SeriesSummary, SeriesType } from "@neuromr/contracts";

/** Result of checking whether a package can open the current selection (DIR-004). */
export type Validity = { valid: true } | { valid: false; reason: string };

const ok: Validity = { valid: true };
const no = (reason: string): Validity => ({ valid: false, reason });

const distinctB = (s: SeriesSummary): number => new Set(s.bValues).size;
const hasType = (s: SeriesSummary, t: SeriesType): boolean => s.types.includes(t);
const hasAnyType = (s: SeriesSummary, ts: readonly SeriesType[]): boolean => ts.some((t) => hasType(s, t));

const DIFFUSION: readonly SeriesType[] = ["DWI", "DTI"];
const MRS: readonly SeriesType[] = ["MRS_SVS", "MRS_CSI"];
/** Series that Subtraction never accepts: time series owned by another package, spectra, and screen captures. */
const NOT_SUBTRACTABLE: readonly SeriesType[] = ["DSC", "FMRI", "MRS_SVS", "MRS_CSI", "SECONDARY_CAPTURE"];

/**
 * Decide validity for one package and a selection of series.
 * The first series is the primary input; the rest are companions (references, imaging).
 * Each rule checks the DIR-003 series type first, then counts.
 * Messages are short, user-facing, and name the unmet condition.
 */
export function packageValidity(pkg: PackageId, selection: readonly SeriesSummary[]): Validity {
  const [primary, ...others] = selection;
  if (!primary) return no("Select a series first.");
  if (!primary.preprocessingDone) return no("Waiting for import and pre-processing to finish.");
  const patients = new Set(selection.map((s) => s.patientId));
  if (patients.size > 1) return no("Selected series belong to different patients.");

  switch (pkg) {
    case "dce":
      if (!hasType(primary, "DCE")) return no("Needs a DCE (T1-weighted dynamic) series.");
      return primary.dynamics >= 4 ? ok : no("Needs at least 4 dynamics.");
    case "dsc":
      if (!hasType(primary, "DSC")) return no("Needs a DSC (dynamic T2*-weighted) series.");
      return primary.dynamics >= 5 ? ok : no("Needs at least 5 dynamics.");
    case "permeability": {
      if (!hasType(primary, "DCE") || primary.dynamics < 20) return no("Needs a DCE series with at least 20 dynamics.");
      const refs = others.filter((s) => hasType(s, "VFA_REFERENCE") && !s.isDynamic);
      const angles = new Set(refs.map((s) => s.flipAngleDeg).filter((a) => a !== undefined));
      if (angles.size === 0) return no("Needs a non-dynamic T1 reference series for the baseline T1 map.");
      if (refs.length === 1 && primary.flipAngleDeg !== undefined && angles.has(primary.flipAngleDeg)) {
        return no("The reference series needs a different flip angle from the DCE series.");
      }
      return ok;
    }
    case "diffusion":
    case "adv-diffusion":
      if (!hasAnyType(primary, DIFFUSION)) return no("Needs a diffusion series (DWI or DTI).");
      return distinctB(primary) >= 2 ? ok : no("Needs at least 2 b-values.");
    case "tractography":
      if (!hasType(primary, "DTI")) return no("Needs a DTI series.");
      if (distinctB(primary) < 2) return no("Needs at least 2 b-values.");
      return primary.gradientDirections >= 6 ? ok : no("Needs at least 6 diffusion directions.");
    case "fmri":
      if (!hasType(primary, "FMRI")) return no("Needs a BOLD fMRI series.");
      return primary.dynamics >= 20 ? ok : no("Needs at least 20 dynamics (80 or more recommended).");
    case "spectroscopy": {
      if (!hasAnyType(primary, MRS)) return no("Needs a spectroscopy series.");
      return others.some((s) => s.hasGeometry && !hasAnyType(s, MRS))
        ? ok
        : no("Also select an imaging series for reference.");
    }
    case "longitudinal": {
      const studies = new Set(selection.map((s) => s.studyInstanceUid));
      return studies.size <= 4 ? ok : no("Select at most 4 studies.");
    }
    case "subtraction":
      if (hasAnyType(primary, NOT_SUBTRACTABLE) || others.some((s) => hasAnyType(s, NOT_SUBTRACTABLE))) {
        return no("Not for DSC, BOLD, spectroscopy or screen-capture series.");
      }
      if (primary.dynamics >= 2) return ok;
      return others.length >= 1 ? ok : no("Needs at least 2 dynamics or a second series.");
    case "echo":
      if (!hasType(primary, "MULTI_ECHO")) return no("Needs a multi-echo series.");
      return primary.echoes >= 2 ? ok : no("Needs at least 2 echoes.");
  }
}
