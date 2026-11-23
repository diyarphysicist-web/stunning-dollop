import type { AttributeUnit, DicomAttribute, StackAxis, ViewerImageInfo, ViewerPixels, ViewerStack } from "@neuromr/contracts";
import { describeSeries, expandFrames, imageRef, stackLayout, type InstanceHeader } from "@neuromr/dicom";
import { decodeImage, type DecodeImage } from "../pixels/decode-image.js";
import { isoDate, type StudyIndex } from "../directory/study-index.js";

/** Second image axis of a series for scrolling (GEN-021). */
export function stackAxis(headers: readonly InstanceHeader[]): StackAxis {
  const { facts } = describeSeries(headers);
  if (facts.bValues.length > 1 || facts.gradientDirections > 0) return "volume";
  if (facts.echoes > 1) return "echo";
  if (facts.dynamics > 1) return "dynamic";
  return "none";
}

const orNull = <T>(v: T | undefined): T | null => v ?? null;

function imageInfo(h: InstanceHeader): ViewerImageInfo {
  return {
    ref: imageRef(h),
    sopInstanceUid: h.sopInstanceUid,
    frame: h.frame ?? 0,
    rows: h.rows,
    columns: h.columns,
    pixelSpacing: orNull(h.pixelSpacing),
    orientation: h.imageOrientation?.length === 6 ? h.imageOrientation : null,
    position: orNull(h.imagePosition),
    frameOfReferenceUid: h.frameOfReferenceUid,
    windowCenter: orNull(h.windowCenter),
    windowWidth: h.windowWidth !== undefined && h.windowWidth > 0 ? h.windowWidth : null,
    repetitionTime: orNull(h.repetitionTime),
    echoTime: orNull(h.echoTime),
    lossy: h.lossy === true,
  };
}

/** A series of the local store arranged for the viewer (GEN-230, GEN-021). */
export function seriesStack(index: StudyIndex, seriesUid: string): ViewerStack {
  const headers = index
    .seriesHeaders(seriesUid)
    .map((r) => r.header)
    .filter((h) => h.hasPixelData && h.rows > 0 && h.columns > 0);
  const first = headers[0];
  if (!first) throw new Error("The series has no images in the local store.");
  const axis = stackAxis(headers);
  const layout = stackLayout(headers, axis);
  return {
    seriesInstanceUid: seriesUid,
    studyInstanceUid: first.studyInstanceUid,
    description: first.seriesDescription,
    seriesNumber: orNull(first.seriesNumber),
    patientName: first.patientName,
    patientId: first.patientId,
    studyDate: isoDate(first.studyDate),
    axis,
    slicePositions: layout.slicePositions,
    points: layout.points,
    grid: layout.grid,
    // One entry per frame of multi-frame instances (GEN-240).
    images: headers.flatMap(expandFrames).map(imageInfo),
  };
}

/**
 * Modality values of one stored image (GEN-232, GEN-234). The renderer names the image by UID; the
 * path comes from the index, never from the request.
 */
export async function imagePixels(index: StudyIndex, sopUid: string, frame = 0, decode: DecodeImage = decodeImage): Promise<ViewerPixels> {
  const inst = index.instance(sopUid);
  if (!inst) return { status: "missing", sopInstanceUid: sopUid };
  const img = await decode(inst.path, frame);
  if (img.status === "ok") return { status: "ok", sopInstanceUid: sopUid, width: img.width, height: img.height, values: img.values, invert: img.invert };
  if (img.status === "unsupported") return { status: "unsupported", sopInstanceUid: sopUid, transferSyntaxUid: img.transferSyntaxUid };
  return { status: "missing", sopInstanceUid: sopUid };
}

type Value = DicomAttribute["value"];
const ROWS: readonly [tag: string, keyword: string, get: (h: InstanceHeader) => Value | undefined, unit?: AttributeUnit][] = [
  ["(0008,0060)", "Modality", (h) => h.modality],
  ["(0008,103E)", "SeriesDescription", (h) => h.seriesDescription],
  ["(0020,0011)", "SeriesNumber", (h) => h.seriesNumber?.toString()],
  ["(0020,0013)", "InstanceNumber", (h) => h.instanceNumber?.toString()],
  ["(0008,0008)", "ImageType", (h) => h.imageType.join("\\")],
  ["(0018,0087)", "MagneticFieldStrength", (h) => h.magneticFieldStrength, "T"],
  ["(0018,0020)", "ScanningSequence", (h) => h.scanningSequence.join("\\")],
  ["(0018,0080)", "RepetitionTime", (h) => h.repetitionTime, "ms"],
  ["(0018,0081)", "EchoTime", (h) => h.echoTime, "ms"],
  ["(0018,0086)", "EchoNumbers", (h) => h.echoNumber?.toString()],
  ["(0018,0082)", "InversionTime", (h) => h.inversionTime, "ms"],
  ["(0018,1314)", "FlipAngle", (h) => h.flipAngle, "deg"],
  ["(0018,0010)", "ContrastBolusAgent", (h) => h.contrastAgent],
  ["(0020,0100)", "TemporalPositionIdentifier", (h) => h.temporalPosition?.toString()],
  ["(0018,1060)", "TriggerTime", (h) => h.triggerTime, "ms"],
  ["(0018,9087)", "DiffusionBValue", (h) => h.bValue, "s/mm2"],
  ["(0018,9089)", "DiffusionGradientOrientation", (h) => h.gradient],
  ["(0028,0010)", "Rows", (h) => h.rows, "px"],
  ["(0028,0011)", "Columns", (h) => h.columns, "px"],
  ["(0028,0030)", "PixelSpacing", (h) => h.pixelSpacing, "mm"],
  ["(0018,0050)", "SliceThickness", (h) => h.sliceThickness, "mm"],
  ["(0020,1041)", "SliceLocation", (h) => h.sliceLocation, "mm"],
  ["(0020,0032)", "ImagePositionPatient", (h) => h.imagePosition, "mm"],
  ["(0020,0037)", "ImageOrientationPatient", (h) => h.imageOrientation],
  ["(0028,1050)", "WindowCenter", (h) => h.windowCenter],
  ["(0028,1051)", "WindowWidth", (h) => h.windowWidth],
  ["(0008,0050)", "AccessionNumber", (h) => h.accessionNumber],
  ["(0020,000D)", "StudyInstanceUID", (h) => h.studyInstanceUid],
  ["(0020,000E)", "SeriesInstanceUID", (h) => h.seriesInstanceUid],
  ["(0008,0018)", "SOPInstanceUID", (h) => h.sopInstanceUid],
  ["(0020,0052)", "FrameOfReferenceUID", (h) => h.frameOfReferenceUid],
];

/** DICOM inspector rows for one image (GEN-233): recorded attributes only, identifiers as text. */
export function imageAttributes(index: StudyIndex, sopUid: string): DicomAttribute[] {
  const inst = index.instance(sopUid);
  if (!inst) return [];
  const out: DicomAttribute[] = [];
  for (const [tag, keyword, get, unit] of ROWS) {
    const value = get(inst.header);
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    out.push(unit ? { tag, keyword, value, unit } : { tag, keyword, value });
  }
  return out;
}
