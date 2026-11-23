import { z } from "zod";

const finite = z.number().finite();
const Uid = z.string().min(1).max(64);
const Pt = z.tuple([finite, finite]);

/** Viewer layouts (GEN-150 subset). */
export const ViewerLayout = z.enum(["1x1", "1x2", "2x1", "2x2", "2x3", "3x3"]);
export type ViewerLayout = z.infer<typeof ViewerLayout>;

export const RoiShapeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ellipse"), center: Pt, a: finite, b: finite, angle: finite }),
  z.object({ kind: z.literal("spline"), points: z.array(Pt).min(3).max(10000) }),
  z.object({ kind: z.literal("freehand"), points: z.array(Pt).min(3).max(10000) }),
]);

export const RoiSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  color: z.number().int().nonnegative(),
  slice: z.number().int().nonnegative(),
  shape: RoiShapeSchema,
});

/** What a series looks like in the Viewer (GEN-241): position, viewing tools, window and ROIs. */
export const SeriesView = z.object({
  slice: z.number().int().nonnegative(),
  point: z.number().int().nonnegative(),
  transform: z.object({ mirror: z.boolean(), flip: z.boolean(), quarterTurns: z.number().int().min(0).max(3) }),
  zoom: finite.positive().nullable(),
  pan: Pt.nullable(),
  window: z.object({ lower: finite, upper: finite }).nullable(),
  rois: z.array(RoiSchema).max(1000),
  roiSerial: z.number().int().nonnegative(),
});
export type SeriesView = z.infer<typeof SeriesView>;

/** Viewer state of one study (GEN-241, GEN-242). */
export const ViewerSession = z.object({
  layout: ViewerLayout,
  active: z.number().int().min(0).max(8),
  /** Series per viewport, nine entries; null where a viewport is empty. */
  panes: z.array(Uid.nullable()).length(9),
  series: z.record(Uid, SeriesView),
});
export type ViewerSession = z.infer<typeof ViewerSession>;

export const StudyRef = z.object({ studyInstanceUid: Uid }).strict();
export const SessionSave = z.object({ studyInstanceUid: Uid, session: ViewerSession }).strict();

/** A named, saved session of a study (GEN-242). */
export const Bookmark = z.object({
  id: z.number().int().positive(),
  studyInstanceUid: Uid,
  name: z.string().min(1).max(200),
  /** ISO 8601. */
  savedAt: z.string(),
});
export type Bookmark = z.infer<typeof Bookmark>;
export const BookmarkSave = z.object({ studyInstanceUid: Uid, session: ViewerSession }).strict();
export const BookmarkRef = z.object({ id: z.number().int().positive() }).strict();
export const BookmarkRename = z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(200) }).strict();
