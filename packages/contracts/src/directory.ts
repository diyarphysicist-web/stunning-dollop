import { z } from "zod";
import { SeriesSummary } from "./series.js";

/** One study in the Directory's study list (DIR-009). Dates are ISO `YYYY-MM-DD` or empty. */
export const StudyRow = z.object({
  studyInstanceUid: z.string().min(1),
  patientName: z.string(),
  patientId: z.string(),
  patientBirthDate: z.string(),
  patientSex: z.string(),
  studyDate: z.string(),
  studyDescription: z.string(),
  accessionNumber: z.string(),
  modality: z.string(),
  fieldStrengthT: z.number().positive().nullable(),
  seriesCount: z.number().int().nonnegative(),
  imageCount: z.number().int().nonnegative(),
});
export type StudyRow = z.infer<typeof StudyRow>;

export const SeriesStatus = z.enum(["importing", "ready"]);
export type SeriesStatus = z.infer<typeof SeriesStatus>;

/** One series in the Directory's series list (DIR-002, DIR-009); also what the launcher reads (DIR-004). */
export const SeriesRow = SeriesSummary.extend({
  seriesNumber: z.number().int().nullable(),
  status: SeriesStatus,
  imageCount: z.number().int().nonnegative(),
  slices: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
  columns: z.number().int().nonnegative(),
  /** 8-bit greyscale PNG as a data URL; null when the pixel data could not be decoded. */
  thumbnail: z.string().startsWith("data:image/png;base64,").nullable(),
});
export type SeriesRow = z.infer<typeof SeriesRow>;

export const QuarantineReason = z.enum(["unreadable", "missing-uid", "no-pixel-data", "missing-file"]);
export type QuarantineReason = z.infer<typeof QuarantineReason>;

/** A file that was not indexed (DIR-006). */
export const QuarantineEntry = z.object({
  path: z.string(),
  reason: QuarantineReason,
  detail: z.string(),
  at: z.string(),
});
export type QuarantineEntry = z.infer<typeof QuarantineEntry>;

export const ImportPhase = z.enum(["scanning", "reading", "finishing", "done", "cancelled", "failed"]);
export type ImportPhase = z.infer<typeof ImportPhase>;

/** Progress and outcome of one import (DIR-007, DIR-008). */
export const ImportProgress = z.object({
  importId: z.number().int().positive(),
  source: z.enum(["folder", "dicomdir"]),
  phase: ImportPhase,
  found: z.number().int().nonnegative(),
  read: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  notDicom: z.number().int().nonnegative(),
  quarantined: z.number().int().nonnegative(),
  /** Increases whenever studies or series in the index changed, so lists know to refresh. */
  indexVersion: z.number().int().nonnegative(),
  /** Set when phase is "failed". */
  error: z.string().optional(),
});
export type ImportProgress = z.infer<typeof ImportProgress>;

export const DirectoryOverview = z.object({
  studies: z.number().int().nonnegative(),
  patients: z.number().int().nonnegative(),
  lastImport: ImportProgress.nullable(),
});
export type DirectoryOverview = z.infer<typeof DirectoryOverview>;

export const ImportRequest = z.object({ source: z.enum(["folder", "dicomdir"]) }).strict();
export const ImportStart = z.discriminatedUnion("started", [
  z.object({ started: z.literal(true), importId: z.number().int().positive() }),
  z.object({ started: z.literal(false), why: z.enum(["dismissed", "busy"]) }),
]);
export type ImportStart = z.infer<typeof ImportStart>;

export const StudyQuery = z.object({ search: z.string().max(200).default("") }).strict();
export const SeriesQuery = z.object({ studyInstanceUid: z.string().min(1).max(64) }).strict();
