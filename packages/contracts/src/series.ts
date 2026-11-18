import { z } from "zod";

/** Series types assigned by the classifier (FUNCTIONAL_SPEC DIR-003). */
export const SeriesType = z.enum([
  "DSC",
  "DCE",
  "DWI",
  "DTI",
  "FMRI",
  "MRS_SVS",
  "MRS_CSI",
  "FLAIR",
  "T1",
  "T2",
  "SWI",
  "MULTI_ECHO",
  "VFA_REFERENCE",
  "DERIVED_MAP",
  "SECONDARY_CAPTURE",
]);
export type SeriesType = z.infer<typeof SeriesType>;

/** What the launcher needs to know about a series to decide package validity. */
export const SeriesSummary = z.object({
  seriesInstanceUid: z.string().min(1),
  studyInstanceUid: z.string().min(1),
  patientId: z.string(),
  description: z.string(),
  types: z.array(SeriesType),
  dynamics: z.number().int().nonnegative(),
  echoes: z.number().int().nonnegative(),
  bValues: z.array(z.number().nonnegative()),
  gradientDirections: z.number().int().nonnegative(),
  flipAngleDeg: z.number().nonnegative().optional(),
  isDynamic: z.boolean(),
  hasGeometry: z.boolean(),
  preprocessingDone: z.boolean(),
});
export type SeriesSummary = z.infer<typeof SeriesSummary>;

/** Analysis packages (FUNCTIONAL_SPEC package table). */
export const PackageId = z.enum([
  "dce",
  "dsc",
  "permeability",
  "diffusion",
  "tractography",
  "fmri",
  "spectroscopy",
  "longitudinal",
  "adv-diffusion",
  "subtraction",
  "echo",
]);
export type PackageId = z.infer<typeof PackageId>;
