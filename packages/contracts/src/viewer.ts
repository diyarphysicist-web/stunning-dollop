import { z } from "zod";

const Uid = z.string().min(1).max(64);
/** An image: SOP Instance UID, plus ":frame" for a frame of a multi-frame instance (GEN-240). */
const ImageRef = z.string().regex(/^[^:]{1,64}(:\d{1,6})?$/);

/** Reference of an image (GEN-240): the SOP UID for a single-frame image, "UID:frame" for a frame. */
export function imageRef(h: { sopInstanceUid: string; frame?: number | undefined }): string {
  return h.frame === undefined ? h.sopInstanceUid : `${h.sopInstanceUid}:${h.frame}`;
}

/** Splits a reference made by `imageRef`. */
export function parseImageRef(ref: string): { sopInstanceUid: string; frame: number } {
  const at = ref.lastIndexOf(":");
  return at < 0 ? { sopInstanceUid: ref, frame: 0 } : { sopInstanceUid: ref.slice(0, at), frame: Number(ref.slice(at + 1)) };
}
const finite = z.number().refine(Number.isFinite);

/** Geometry and display defaults of one image of a stack (GEN-231, GEN-232). */
export const ViewerImageInfo = z.object({
  /** `imageRef` of this image; the stack grid holds these. */
  ref: ImageRef,
  sopInstanceUid: Uid,
  /** Frame number within the instance (0 for single-frame images). */
  frame: z.number().int().nonnegative(),
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  /** Row spacing, column spacing in mm (DICOM order); null when not recorded. */
  pixelSpacing: z.tuple([finite, finite]).nullable(),
  /** Image Orientation Patient: row cosines then column cosines. */
  orientation: z.array(finite).length(6).nullable(),
  position: z.tuple([finite, finite, finite]).nullable(),
  frameOfReferenceUid: z.string(),
  windowCenter: finite.nullable(),
  windowWidth: finite.nullable(),
  repetitionTime: finite.nullable(),
  echoTime: finite.nullable(),
  /** Stored with lossy compression (GEN-239). */
  lossy: z.boolean(),
});
export type ViewerImageInfo = z.infer<typeof ViewerImageInfo>;

export const StackAxis = z.enum(["none", "dynamic", "echo", "volume"]);
export type StackAxis = z.infer<typeof StackAxis>;

export const StackPoint = z.object({ timeS: finite.optional(), bValue: finite.optional(), echoTimeMs: finite.optional() });
export type StackPoint = z.infer<typeof StackPoint>;

/** A series arranged for the viewer: slices × points of the second axis (GEN-020, GEN-021). */
export const ViewerStack = z.object({
  seriesInstanceUid: Uid,
  studyInstanceUid: Uid,
  description: z.string(),
  seriesNumber: z.number().int().nullable(),
  patientName: z.string(),
  patientId: z.string(),
  /** ISO YYYY-MM-DD or empty. */
  studyDate: z.string(),
  axis: StackAxis,
  slicePositions: z.array(finite),
  points: z.array(StackPoint),
  /** SOP Instance UIDs by [slice][point]; null for a gap in the acquisition. */
  grid: z.array(z.array(ImageRef.nullable())),
  images: z.array(ViewerImageInfo),
});
export type ViewerStack = z.infer<typeof ViewerStack>;

/** Modality values of one image (GEN-232), or why it cannot be shown. */
export const ViewerPixels = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    sopInstanceUid: Uid,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    values: z.instanceof(Float32Array),
    invert: z.boolean(),
  }),
  z.object({ status: z.literal("unsupported"), sopInstanceUid: Uid, transferSyntaxUid: z.string() }),
  z.object({ status: z.literal("missing"), sopInstanceUid: Uid }),
]);
export type ViewerPixels = z.infer<typeof ViewerPixels>;

export const AttributeUnit = z.enum(["ms", "T", "mm", "px", "deg", "s/mm2", "dyn"]);
export type AttributeUnit = z.infer<typeof AttributeUnit>;

/** One row of the DICOM inspector (GEN-233). Identifiers and dates are text; quantities are numbers. */
export const DicomAttribute = z.object({
  tag: z.string().regex(/^\([0-9A-F]{4},[0-9A-F]{4}\)$/),
  keyword: z.string().min(1),
  value: z.union([z.string(), finite, z.array(finite)]),
  unit: AttributeUnit.optional(),
});
export type DicomAttribute = z.infer<typeof DicomAttribute>;

export const StackQuery = z.object({ seriesInstanceUid: Uid }).strict();
export const ImageQuery = z.object({ sopInstanceUid: Uid, frame: z.number().int().nonnegative().optional() }).strict();
